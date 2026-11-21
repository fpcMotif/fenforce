import { vi } from 'vite-plus/test';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getFunctionName } from 'convex/server';

import type { Id } from '../../../../../../deployments/convex/convex/_generated/dataModel';
import { MemberAdministration } from '~/pages/convex-preview/MemberAdministration';

const invite = vi.fn().mockResolvedValue('invitation');
const disableMember = vi.fn().mockResolvedValue(null);
vi.mock('convex/react', () => ({
  useMutation: (reference: Parameters<typeof getFunctionName>[0]) =>
    getFunctionName(reference) === 'employeeIdentity:invite'
      ? invite
      : disableMember,
}));
vi.mock('@convex-dev/react-query', () => ({
  useConvexPaginatedQuery: () => ({
    status: 'Exhausted',
    results: [
      {
        memberId: 'seller-member',
        displayName: 'Seller A',
        role: 'seller',
        active: true,
      },
      {
        memberId: 'former-member',
        displayName: 'Former Seller',
        role: 'seller',
        active: false,
      },
    ],
  }),
}));

it('invites an exact employee subject and revokes an active membership without removing history', async () => {
  const user = userEvent.setup();
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <MemberAdministration workspaceId={'workspace' as Id<'workspaces'>} />
    </I18nProvider>,
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Employee subject' }),
    'seller-new',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Display name' }),
    'New Seller',
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Role' }),
    'seller',
  );
  await user.click(screen.getByRole('button', { name: 'Invite employee' }));
  expect(invite).toHaveBeenCalledWith({
    workspaceId: 'workspace',
    subject: 'seller-new',
    displayName: 'New Seller',
    role: 'seller',
  });
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Invitation created',
  );
  await user.click(
    screen.getByRole('button', { name: 'Revoke access for Seller A' }),
  );
  expect(disableMember).toHaveBeenCalledWith({
    workspaceId: 'workspace',
    memberId: 'seller-member',
  });
  expect(screen.getByText('Former Seller')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Revoke access for Former Seller' }),
  ).toBeNull();
});
