import { vi } from 'vite-plus/test';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CompanyHistory } from '~/pages/convex-preview/CompanyHistory';
import type { Id } from '../../../../../../deployments/convex/convex/_generated/dataModel';

vi.mock('@convex-dev/react-query', () => ({
  useConvexPaginatedQuery: () => ({
    status: 'Exhausted',
    results: [
      {
        _id: 'audit',
        actorId: 'employee-1',
        actorName: 'Jane Seller',
        beforeOwnerName: null,
        afterOwnerName: 'Jane Seller',
        timestamp: 0,
        before: null,
        after: {
          revision: 1,
          name: 'Acme',
          industry: 'services',
          accountOwnerId: 'employee-1',
          domainName: {
            primaryLinkLabel: 'example.test',
            primaryLinkUrl: 'https://example.test',
            secondaryLinks: [],
          },
          deletedAt: null,
        },
      },
    ],
  }),
}));

it('reveals actor, revision and before/after values on demand', async () => {
  const user = userEvent.setup();
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <CompanyHistory
        workspaceId={'workspace' as Id<'workspaces'>}
        companyId={'company' as Id<'workspaceCompanies'>}
      />
    </I18nProvider>,
  );
  expect(screen.queryByText('Revision 1')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Show history' }));
  expect(screen.getByRole('heading', { name: 'Revision 1' })).toBeVisible();
  expect(screen.getByText(/Changed by: Jane Seller/)).toBeVisible();
  await user.click(screen.getByText('Before', { selector: 'summary' }));
  expect(screen.getByText('Not created yet')).toBeVisible();
  await user.click(screen.getByText('After', { selector: 'summary' }));
  expect(screen.getByText('Acme')).toBeVisible();
  expect(screen.getByText('Jane Seller', { selector: 'dd' })).toBeVisible();
  expect(screen.queryByText('employee-1')).toBeNull();
});
