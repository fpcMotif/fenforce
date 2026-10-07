import { vi } from 'vite-plus/test';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConvexError } from 'convex/values';
import { useSyncExternalStore } from 'react';

import {
  CompanyTrash,
  CompanyTrashAction,
} from '~/pages/convex-preview/CompanyLifecycle';
import type { Id } from '../../../../../../deployments/convex/convex/_generated/dataModel';

const mutation = vi.fn();
let isWebSocketConnected = true;
const connectionListeners = new Set<() => void>();
const setWebSocketConnected = (connected: boolean) => {
  isWebSocketConnected = connected;
  connectionListeners.forEach((listener) => listener());
};
vi.mock('convex/react', () => ({
  useMutation: () => mutation,
  useConvexConnectionState: () => ({
    isWebSocketConnected: useSyncExternalStore(
      (listener) => {
        connectionListeners.add(listener);
        return () => connectionListeners.delete(listener);
      },
      () => isWebSocketConnected,
    ),
  }),
}));
const trashedAcme = {
  _id: 'company',
  revision: 2,
  name: 'Acme',
  accountOwnerName: 'Former owner',
  permissions: { canReassign: true },
  memberId: 'active-owner',
  displayName: 'Active owner',
};
let trashResults = [trashedAcme];
vi.mock('@convex-dev/react-query', () => ({
  useConvexPaginatedQuery: () => ({
    status: 'Exhausted',
    results: trashResults,
  }),
}));

const workspaceId = 'workspace' as Id<'workspaces'>;
const companyId = 'company' as Id<'workspaceCompanies'>;
const i18n = setupI18n({ locale: 'en', messages: { en: {} } });

it('captures the confirmed revision and keeps a stale trash failure visible', async () => {
  mutation.mockReset().mockRejectedValue(new ConvexError('COMPANY_CHANGED'));
  const user = userEvent.setup();
  const onComplete = vi.fn();
  const onChanged = vi.fn();
  const view = (revision: number) => (
    <I18nProvider i18n={i18n}>
      <CompanyTrashAction
        workspaceId={workspaceId}
        companyId={companyId}
        revision={revision}
        onComplete={onComplete}
        onChanged={onChanged}
      />
    </I18nProvider>
  );
  const rendered = render(view(2));
  await user.click(screen.getByRole('button', { name: 'Move to trash' }));
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  rendered.rerender(view(3));
  await user.click(
    screen.getByRole('button', { name: 'Confirm move to trash' }),
  );
  expect(mutation).toHaveBeenCalledOnce();
  expect(mutation).toHaveBeenCalledWith({
    workspaceId,
    companyId,
    expectedRevision: 2,
    operationId: expect.any(String),
  });
  expect(screen.getByRole('alert')).toHaveTextContent('This company changed');
  expect(onChanged).toHaveBeenCalledOnce();
  expect(onComplete).not.toHaveBeenCalled();
});

it('reports a stale trash rejection that arrives after the record left the page', async () => {
  let reject: (reason: unknown) => void = () => {};
  mutation.mockReset().mockImplementation(
    () =>
      new Promise((_, rejectMutation) => {
        reject = rejectMutation;
      }),
  );
  const user = userEvent.setup();
  const onChanged = vi.fn();
  const rendered = render(
    <I18nProvider i18n={i18n}>
      <CompanyTrashAction
        workspaceId={workspaceId}
        companyId={companyId}
        revision={2}
        onComplete={vi.fn()}
        onChanged={onChanged}
      />
    </I18nProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Move to trash' }));
  await user.click(
    screen.getByRole('button', { name: 'Confirm move to trash' }),
  );
  rendered.unmount();
  await act(async () => reject(new ConvexError('COMPANY_CHANGED')));
  expect(onChanged).toHaveBeenCalledOnce();
});

it('keeps a trash submit pending through an outage and completes it once after reconnect', async () => {
  let acknowledge: (value: unknown) => void = () => {};
  mutation.mockReset().mockImplementation(
    () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
  );
  const user = userEvent.setup();
  const onComplete = vi.fn();
  render(
    <I18nProvider i18n={i18n}>
      <CompanyTrashAction
        workspaceId={workspaceId}
        companyId={companyId}
        revision={2}
        onComplete={onComplete}
        onChanged={vi.fn()}
      />
    </I18nProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Move to trash' }));
  await user.click(
    screen.getByRole('button', { name: 'Confirm move to trash' }),
  );

  act(() => setWebSocketConnected(false));
  try {
    expect(await screen.findByRole('status')).toHaveTextContent('Reconnecting');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
    await act(async () => {
      setWebSocketConnected(true);
      acknowledge({ revision: 3, changed: true });
    });
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  } finally {
    setWebSocketConnected(true);
  }
});

it('shows a plain failure when the server rejects a trash without retrying', async () => {
  mutation.mockReset().mockRejectedValue(new Error('Server Error'));
  const user = userEvent.setup();
  const onComplete = vi.fn();
  const onChanged = vi.fn();
  render(
    <I18nProvider i18n={i18n}>
      <CompanyTrashAction
        workspaceId={workspaceId}
        companyId={companyId}
        revision={2}
        onComplete={onComplete}
        onChanged={onChanged}
      />
    </I18nProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Move to trash' }));
  await user.click(
    screen.getByRole('button', { name: 'Confirm move to trash' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Unable to move this company to trash. Try again.',
  );
  expect(screen.queryByRole('status')).toBeNull();
  expect(mutation).toHaveBeenCalledTimes(1);
  expect(onComplete).not.toHaveBeenCalled();
  expect(onChanged).not.toHaveBeenCalled();
});

it('explains a stale restore after another restore removed the company from trash', async () => {
  let reject: (reason: unknown) => void = () => {};
  mutation.mockReset().mockImplementation(
    () =>
      new Promise((_, rejectMutation) => {
        reject = rejectMutation;
      }),
  );
  const user = userEvent.setup();
  const view = () => (
    <I18nProvider i18n={i18n}>
      <CompanyTrash workspaceId={workspaceId} />
    </I18nProvider>
  );
  const rendered = render(view());
  try {
    await user.click(screen.getByRole('button', { name: 'Restore' }));
    trashResults = [];
    rendered.rerender(view());
    expect(screen.queryByRole('region', { name: 'Acme' })).toBeNull();
    await act(async () => reject(new ConvexError('COMPANY_CHANGED')));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Acme changed before your restore was saved. Your request was not applied.',
    );
    expect(
      screen.queryByText('Company restored. It is available in Companies.'),
    ).toBeNull();
  } finally {
    trashResults = [trashedAcme];
  }
});

it('explains an unavailable owner and allows manager recovery before restoring', async () => {
  mutation
    .mockReset()
    .mockRejectedValueOnce(new ConvexError('INVALID_ACCOUNT_OWNER'))
    .mockResolvedValue({ changed: true, revision: 3 });
  const user = userEvent.setup();
  render(
    <I18nProvider i18n={i18n}>
      <CompanyTrash workspaceId={workspaceId} />
    </I18nProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Restore' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'A manager must assign an active owner',
  );
  expect(
    screen.queryByText('Company restored. It is available in Companies.'),
  ).toBeNull();
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'New owner' }),
    'active-owner',
  );
  await user.click(screen.getByRole('button', { name: 'Assign owner' }));
  expect(mutation).toHaveBeenLastCalledWith({
    workspaceId,
    companyId,
    expectedRevision: 2,
    accountOwnerId: 'active-owner',
    operationId: expect.any(String),
  });
  await user.click(screen.getByRole('button', { name: 'Restore' }));
  expect(screen.getByRole('status')).toHaveTextContent('Company restored');
  expect(screen.getByRole('heading', { name: 'Trash' })).toHaveFocus();
});
