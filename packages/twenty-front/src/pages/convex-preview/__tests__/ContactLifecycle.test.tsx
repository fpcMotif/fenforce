import { vi } from 'vite-plus/test';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConvexError } from 'convex/values';

import type { Id } from '../../../../../../deployments/convex/convex/_generated/dataModel';
import {
  ContactTrash,
  ContactTrashAction,
} from '~/pages/convex-preview/ContactLifecycle';

const mockMutation = vi.fn();
let mockTrashPage: { status: string; results: Array<Record<string, unknown>> } =
  { status: 'Exhausted', results: [] };

vi.mock('@convex-dev/react-query', () => ({
  useConvexPaginatedQuery: () => ({ ...mockTrashPage, loadMore: vi.fn() }),
}));
vi.mock('convex/react', () => ({
  useMutation: () => mockMutation,
  useConvexConnectionState: () => ({ isWebSocketConnected: true }),
}));

const WORKSPACE_ID = 'workspace' as Id<'workspaces'>;
const CONTACT_ID = 'contact-a' as Id<'workspaceContacts'>;

const withI18n = (children: React.ReactNode) => (
  <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
    {children}
  </I18nProvider>
);

beforeEach(() => {
  mockMutation.mockReset();
  mockTrashPage = { status: 'Exhausted', results: [] };
});

it('moves a person to trash with the confirmed revision', async () => {
  mockMutation.mockResolvedValue({ revision: 2, changed: true });
  const onComplete = vi.fn();
  const user = userEvent.setup();
  render(
    withI18n(
      <ContactTrashAction
        workspaceId={WORKSPACE_ID}
        contactId={CONTACT_ID}
        revision={1}
        onComplete={onComplete}
      />,
    ),
  );
  await user.click(screen.getByRole('button', { name: 'Move to trash' }));
  expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  await user.click(
    screen.getByRole('button', { name: 'Confirm move to trash' }),
  );
  expect(mockMutation).toHaveBeenCalledWith({
    workspaceId: WORKSPACE_ID,
    contactId: CONTACT_ID,
    expectedRevision: 1,
    operationId: expect.any(String),
  });
  expect(onComplete).toHaveBeenCalledTimes(1);
});

it('explains a stale trash without completing it', async () => {
  mockMutation.mockRejectedValue(new ConvexError('CONTACT_CHANGED'));
  const onComplete = vi.fn();
  const user = userEvent.setup();
  render(
    withI18n(
      <ContactTrashAction
        workspaceId={WORKSPACE_ID}
        contactId={CONTACT_ID}
        revision={1}
        onComplete={onComplete}
      />,
    ),
  );
  await user.click(screen.getByRole('button', { name: 'Move to trash' }));
  await user.click(
    screen.getByRole('button', { name: 'Confirm move to trash' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This person changed.',
  );
  expect(onComplete).not.toHaveBeenCalled();
});

it('restores a trashed person and announces it', async () => {
  mockTrashPage = {
    status: 'Exhausted',
    results: [
      {
        _id: CONTACT_ID,
        revision: 2,
        lastName: 'Synthetic',
        accountName: 'account-a',
      },
    ],
  };
  mockMutation.mockResolvedValue({ revision: 3, changed: true });
  const user = userEvent.setup();
  render(withI18n(<ContactTrash workspaceId={WORKSPACE_ID} />));
  const trashed = screen.getByRole('region', { name: 'Synthetic' });
  expect(trashed).toHaveTextContent('account-a');
  await user.click(screen.getByRole('button', { name: 'Restore' }));
  expect(mockMutation).toHaveBeenCalledWith({
    workspaceId: WORKSPACE_ID,
    contactId: CONTACT_ID,
    expectedRevision: 2,
    operationId: expect.any(String),
  });
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Person restored.',
  );
  expect(screen.getByRole('heading', { name: 'People trash' })).toHaveFocus();
});

it('does not call trash empty while a short page can load more', () => {
  mockTrashPage = { status: 'CanLoadMore', results: [] };
  render(withI18n(<ContactTrash workspaceId={WORKSPACE_ID} />));
  expect(screen.queryByText('Trash is empty')).toBeNull();
  expect(screen.getByRole('button', { name: 'Load more' })).toBeVisible();
});
