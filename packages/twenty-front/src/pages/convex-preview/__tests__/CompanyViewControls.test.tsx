import { vi } from 'vite-plus/test';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CompanyViewControls } from '~/pages/convex-preview/CompanyViewControls';
import type { CompanyViewConfiguration } from '~/pages/convex-preview/companyViewConfiguration';
import type { Id } from '../../../../../../deployments/convex/convex/_generated/dataModel';

const mutation = vi.fn().mockResolvedValue('saved-view');
const configuration: CompanyViewConfiguration = {
  columns: ['account.name', 'account.owner'],
  search: 'acme',
  filters: { industry: 'services' },
  sort: { field: 'account.name', direction: 'desc' },
};
vi.mock('convex/react', () => ({ useMutation: () => mutation }));
vi.mock('@convex-dev/react-query', () => ({
  useConvexPaginatedQuery: () => ({
    status: 'Exhausted',
    results: [
      {
        _id: 'shared-view',
        name: 'Team accounts',
        scope: 'workspace',
        revision: 2,
        configuration,
        memberId: 'seller',
        displayName: 'Seller',
      },
    ],
  }),
}));

it('saves stable field identities and applies a shared view without exposing seller management controls', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <CompanyViewControls
        workspaceId={'workspace' as Id<'workspaces'>}
        manager={false}
        configuration={configuration}
        selectedViewId="shared-view"
        onChange={onChange}
      />
    </I18nProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Saved views' }));
  expect(
    screen.queryByRole('button', { name: 'Remove selected view' }),
  ).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Update selected view' }),
  ).toBeNull();
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Saved view' }),
    'shared-view',
  );
  expect(onChange).toHaveBeenCalledWith(configuration, 'shared-view');
  await user.type(
    screen.getByRole('textbox', { name: 'View name' }),
    'My accounts',
  );
  await user.click(screen.getByRole('button', { name: 'Save as new view' }));
  expect(mutation).toHaveBeenCalledWith({
    workspaceId: 'workspace',
    name: 'My accounts',
    scope: 'private',
    configuration,
  });
  expect(onChange).toHaveBeenLastCalledWith(configuration, 'saved-view');
});
