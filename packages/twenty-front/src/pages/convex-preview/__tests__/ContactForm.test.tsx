import { vi } from 'vite-plus/test';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConvexError } from 'convex/values';

import type { Id } from '../../../../../../deployments/convex/convex/_generated/dataModel';
import { ContactForm } from '~/pages/convex-preview/ContactForm';

const mockCompanyQuery = vi.fn();
const COMPANIES = [
  { _id: 'account-a', name: 'account-a' },
  { _id: 'account-b', name: 'account-b' },
];

vi.mock('@convex-dev/react-query', () => ({
  useConvexPaginatedQuery: (
    _reference: unknown,
    args: { search?: string },
    options: { initialNumItems: number },
  ) => {
    mockCompanyQuery(args, options);
    return {
      status: 'CanLoadMore',
      loadMore: vi.fn(),
      results: COMPANIES.filter((company) =>
        company.name.includes(args.search ?? ''),
      ),
    };
  },
}));
vi.mock('twenty-ui/components', () => ({
  MainButton: ({
    loading,
    children,
    type,
  }: React.ComponentProps<'button'> & { loading?: boolean }) => (
    <button type={type} disabled={loading}>
      {children}
    </button>
  ),
}));

const WORKSPACE_ID = 'workspace' as Id<'workspaces'>;

const renderForm = ({
  onSave = vi.fn(),
  onCancel = vi.fn(),
  initialValues,
}: Partial<React.ComponentProps<typeof ContactForm>>) =>
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <ContactForm
        workspaceId={WORKSPACE_ID}
        initialValues={initialValues}
        onSave={onSave}
        onCancel={onCancel}
      />
    </I18nProvider>,
  );

it('creates a person linked to a company chosen through paginated search', async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  renderForm({ onSave });
  await user.type(
    screen.getByRole('textbox', { name: 'Last name' }),
    '  Synthetic ',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Email' }),
    'synthetic@example.test',
  );
  await user.type(
    screen.getByRole('searchbox', { name: 'Search companies' }),
    'account-b',
  );
  await waitFor(() =>
    expect(mockCompanyQuery).toHaveBeenLastCalledWith(
      { workspaceId: WORKSPACE_ID, search: 'account-b', sortDirection: 'asc' },
      { initialNumItems: 25 },
    ),
  );
  expect(screen.queryByRole('option', { name: 'account-a' })).toBeNull();
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Company' }),
    'account-b',
  );
  expect(
    screen.getByRole('button', { name: 'Load more companies' }),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Create person' }));
  expect(onSave).toHaveBeenCalledWith({
    lastName: 'Synthetic',
    email: 'synthetic@example.test',
    accountId: 'account-b',
  });
  expect(screen.getByRole('textbox', { name: 'Last name' })).toHaveAttribute(
    'maxlength',
    '100',
  );
});

it('does not submit without a company', async () => {
  const onSave = vi.fn();
  const user = userEvent.setup();
  renderForm({ onSave });
  await user.type(screen.getByRole('textbox', { name: 'Last name' }), 'Lee');
  screen
    .getByRole('button', { name: 'Create person' })
    .closest('form')
    ?.setAttribute('novalidate', '');
  await user.click(screen.getByRole('button', { name: 'Create person' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Choose a company for this person.',
  );
  expect(onSave).not.toHaveBeenCalled();
});

it('keeps the current company selected when it is outside the loaded page', () => {
  renderForm({
    initialValues: {
      lastName: 'Synthetic',
      email: null,
      company: {
        accountId: 'account-z' as Id<'workspaceCompanies'>,
        accountName: 'account-z',
      },
    },
  });
  expect(screen.getByRole('combobox', { name: 'Company' })).toHaveValue(
    'account-z',
  );
  expect(screen.getByRole('option', { name: 'account-z' })).toBeVisible();
});

it.each([
  {
    code: 'CONTACT_CHANGED',
    message: 'This person changed while you were editing.',
  },
  {
    code: 'COMPANY_NOT_FOUND',
    message: 'That company is unavailable. Choose another company.',
  },
  {
    code: 'INVALID_CONTACT_EMAIL',
    message: 'Enter a valid email address, or leave it blank.',
  },
  {
    code: 'INVALID_CONTACT_LAST_NAME',
    message: 'Enter a last name of up to 100 characters.',
  },
])(
  'keeps entered values and explains a $code rejection',
  async ({ code, message }) => {
    const onSave = vi.fn().mockRejectedValue(new ConvexError(code));
    const onCancel = vi.fn();
    const user = userEvent.setup();
    renderForm({
      onSave,
      onCancel,
      initialValues: {
        lastName: 'Synthetic',
        email: null,
        company: {
          accountId: 'account-a' as Id<'workspaceCompanies'>,
          accountName: 'account-a',
        },
      },
    });
    await user.type(
      screen.getByRole('textbox', { name: 'Email' }),
      'not-an-email',
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue(
      'not-an-email',
    );
    expect(onCancel).not.toHaveBeenCalled();
  },
);
