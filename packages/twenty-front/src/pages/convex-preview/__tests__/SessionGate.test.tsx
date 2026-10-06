import { vi } from 'vite-plus/test';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SessionGate } from '~/pages/convex-preview/SessionGate';
import { PreviewSignIn } from '~/pages/convex-preview/PreviewSignIn';

type ConnectionListener = (state: { isWebSocketConnected: boolean }) => void;

const query = vi.fn();
let isWebSocketConnected = true;
const connectionListeners = new Set<ConnectionListener>();
const convex = {
  query,
  connectionState: () => ({ isWebSocketConnected }),
  subscribeToConnectionState: (listener: ConnectionListener) => {
    connectionListeners.add(listener);
    return () => connectionListeners.delete(listener);
  },
};
vi.mock('convex/react', () => ({ useConvex: () => convex }));

const setWebSocketConnected = (connected: boolean) => {
  isWebSocketConnected = connected;
  connectionListeners.forEach((listener) =>
    listener({ isWebSocketConnected: connected }),
  );
};

const renderGate = (queryClient: QueryClient) =>
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <QueryClientProvider client={queryClient}>
        <SessionGate>
          <p>Secret company</p>
        </SessionGate>
      </QueryClientProvider>
    </I18nProvider>,
  );

const advance = async (milliseconds: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
};
vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({
    signOut: vi.fn(),
    signIn: vi.fn().mockResolvedValue({ signingIn: false }),
  }),
}));

it('does not leave a sign-in failure after a successfully verified session signs out', async () => {
  query
    .mockReset()
    .mockResolvedValue({ expiresAt: Date.now() + 3600000, userId: 'seller-a' });
  const user = userEvent.setup();
  const i18n = setupI18n({ locale: 'en', messages: { en: {} } });
  const signInView = () => (
    <I18nProvider i18n={i18n}>
      <PreviewSignIn />
    </I18nProvider>
  );
  const initial = render(signInView());
  await user.click(
    screen.getByRole('button', { name: 'Continue with employee identity' }),
  );
  initial.unmount();
  const signedIn = render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={new QueryClient()}>
        <SessionGate>
          <p>Protected workspace</p>
        </SessionGate>
      </QueryClientProvider>
    </I18nProvider>,
  );
  expect(await screen.findByText('Protected workspace')).toBeVisible();
  signedIn.unmount();
  render(signInView());
  expect(screen.queryByRole('alert')).toBeNull();
});

it('removes protected content and cache when an idle session expires', async () => {
  vi.useFakeTimers();
  query.mockResolvedValue({ expiresAt: Date.now() + 3000, userId: 'seller-a' });
  const queryClient = new QueryClient();
  queryClient.setQueryData(['protected'], 'Secret company');
  try {
    render(
      <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
        <QueryClientProvider client={queryClient}>
          <SessionGate>
            <p>Secret company</p>
          </SessionGate>
        </QueryClientProvider>
      </I18nProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText('Secret company')).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(screen.queryByText('Secret company')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your session has ended',
    );
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  } finally {
    vi.useRealTimers();
  }
});

it('fails closed within five seconds when the backend stops answering and ignores a late response', async () => {
  vi.useFakeTimers();
  let respond:
    | ((value: { expiresAt: number; userId: string }) => void)
    | undefined;
  query
    .mockReset()
    .mockResolvedValueOnce({
      expiresAt: Date.now() + 3600000,
      userId: 'seller-a',
    })
    .mockImplementation(
      () =>
        new Promise((resolve) => {
          respond = resolve;
        }),
    );
  const queryClient = new QueryClient();
  try {
    render(
      <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
        <QueryClientProvider client={queryClient}>
          <SessionGate>
            <p>Secret company</p>
          </SessionGate>
        </QueryClientProvider>
      </I18nProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText('Secret company')).toBeVisible();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(screen.queryByText('Secret company')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Unable to load Fenforce',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      'Your session has ended',
    );
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
    await act(async () => {
      respond?.({ expiresAt: Date.now() + 3600000, userId: 'seller-a' });
    });
    expect(screen.queryByText('Secret company')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

const mockSessionQueryThatWaitsForConnection = (expiresAt: number) => {
  const waitingForConnection: Array<() => void> = [];
  query.mockReset().mockImplementation(
    () =>
      new Promise((resolve) => {
        const answer = () => resolve({ expiresAt, userId: 'seller-a' });
        if (isWebSocketConnected) answer();
        else waitingForConnection.push(answer);
      }),
  );
  return () => {
    setWebSocketConnected(true);
    waitingForConnection.splice(0).forEach((answer) => answer());
  };
};

it('keeps protected content through an outage longer than the verification timeout and re-verifies on reconnect', async () => {
  vi.useFakeTimers();
  const reconnect = mockSessionQueryThatWaitsForConnection(
    Date.now() + 3600000,
  );
  const queryClient = new QueryClient();
  queryClient.setQueryData(['protected'], 'Secret company');
  try {
    renderGate(queryClient);
    await advance(1);
    expect(screen.getByText('Secret company')).toBeVisible();

    act(() => setWebSocketConnected(false));
    await advance(10000);
    expect(screen.getByText('Secret company')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(queryClient.getQueryData(['protected'])).toBe('Secret company');

    const callsBeforeReconnect = query.mock.calls.length;
    await act(async () => {
      reconnect();
    });
    await advance(5000);
    expect(query.mock.calls.length).toBeGreaterThan(callsBeforeReconnect);
    expect(screen.getByText('Secret company')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(queryClient.getQueryData(['protected'])).toBe('Secret company');
  } finally {
    setWebSocketConnected(true);
    vi.useRealTimers();
  }
});

it('still ends the session when it expires during an outage', async () => {
  vi.useFakeTimers();
  mockSessionQueryThatWaitsForConnection(Date.now() + 6000);
  const queryClient = new QueryClient();
  queryClient.setQueryData(['protected'], 'Secret company');
  try {
    renderGate(queryClient);
    await advance(1);
    expect(screen.getByText('Secret company')).toBeVisible();

    act(() => setWebSocketConnected(false));
    await advance(6000);
    expect(screen.queryByText('Secret company')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your session has ended',
    );
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  } finally {
    setWebSocketConnected(true);
    vi.useRealTimers();
  }
});
