import { vi } from 'vite-plus/test';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConvexError } from 'convex/values';

import {
  CompanyTrash,
  CompanyTrashAction,
} from '~/pages/convex-preview/CompanyLifecycle';
import type { Id } from '../../../../../../deployments/convex/convex/_generated/dataModel';

const mutation = vi.fn();
vi.mock('convex/react', () => ({ useMutation: () => mutation }));
vi.mock('@convex-dev/react-query', () => ({
  useConvexPaginatedQuery: () => ({
    status: 'Exhausted',
    results: [
      {
        _id: 'company',
        revision: 2,
        name: 'Acme',
        accountOwnerName: 'Former owner',
        permissions: { canReassign: true },
        memberId: 'active-owner',
        displayName: 'Active owner',
      },
    ],
  }),
}));

const workspaceId = 'workspace' as Id<'workspaces'>;
const companyId = 'company' as Id<'workspaceCompanies'>;
const i18n = setupI18n({ locale: 'en', messages: { en: {} } });

it('captures the confirmed revision and keeps a stale trash failure visible', async () => {
  mutation.mockReset().mockRejectedValue(new ConvexError('COMPANY_CHANGED'));
  const user = userEvent.setup();
  const onComplete = vi.fn();
  const view = (revision: number) => (
    <I18nProvider i18n={i18n}>
      <CompanyTrashAction
        workspaceId={workspaceId}
        companyId={companyId}
        revision={revision}
        onComplete={onComplete}
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
  expect(mutation).toHaveBeenCalledWith({
    workspaceId,
    companyId,
    expectedRevision: 2,
  });
  expect(screen.getByRole('alert')).toHaveTextContent('This company changed');
  expect(onComplete).not.toHaveBeenCalled();
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
  });
  await user.click(screen.getByRole('button', { name: 'Restore' }));
  expect(screen.getByRole('status')).toHaveTextContent('Company restored');
  expect(screen.getByRole('heading', { name: 'Trash' })).toHaveFocus();
});
