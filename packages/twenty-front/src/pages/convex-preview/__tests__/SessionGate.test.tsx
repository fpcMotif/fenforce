import { vi } from 'vite-plus/test';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SessionGate } from '~/pages/convex-preview/SessionGate';
import { PreviewSignIn } from '~/pages/convex-preview/PreviewSignIn';

const query = vi.fn();
const convex = { query };
vi.mock('convex/react', () => ({ useConvex: () => convex }));
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
    await act(async () => {
      respond?.({ expiresAt: Date.now() + 3600000, userId: 'seller-a' });
    });
    expect(screen.queryByText('Secret company')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
