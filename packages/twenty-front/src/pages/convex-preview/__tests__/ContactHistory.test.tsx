import { vi } from 'vite-plus/test';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Id } from '../../../../../../deployments/convex/convex/_generated/dataModel';
import { ContactHistory } from '~/pages/convex-preview/ContactHistory';

vi.mock('@convex-dev/react-query', () => ({
  useConvexPaginatedQuery: () => ({
    status: 'Exhausted',
    results: [
      {
        _id: 'audit-2',
        timestamp: 0,
        actorName: 'manager-a',
        before: {
          account: { restricted: true },
          lastName: 'Synthetic',
          email: null,
          revision: 1,
          deletedAt: null,
        },
        after: {
          account: {
            restricted: false,
            accountId: 'account-a',
            accountName: 'account-a',
          },
          lastName: 'Synthetic',
          email: 'synthetic@example.test',
          revision: 2,
          deletedAt: null,
        },
      },
    ],
  }),
}));

it('shows the actor and hides a company the reader cannot access', async () => {
  const user = userEvent.setup();
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <ContactHistory
        workspaceId={'workspace' as Id<'workspaces'>}
        contactId={'contact-a' as Id<'workspaceContacts'>}
      />
    </I18nProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Show history' }));
  const history = screen.getByRole('region', { name: 'Person history' });
  expect(history).toHaveTextContent('Changed by: manager-a');
  const entry = within(history).getByRole('article');
  expect(entry).toHaveTextContent('Company you cannot access');
  expect(entry).toHaveTextContent('account-a');
  expect(entry).not.toHaveTextContent('account-b');
});
