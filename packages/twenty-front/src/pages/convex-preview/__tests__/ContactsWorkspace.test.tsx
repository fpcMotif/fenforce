import { vi } from 'vite-plus/test';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getFunctionName, type FunctionReference } from 'convex/server';
import { ConvexError } from 'convex/values';

import { WorkspaceGate } from '~/pages/convex-preview/CompaniesWorkspace';
import {
  PeoplePage,
  PersonDetailPage,
} from '~/pages/convex-preview/ContactsWorkspace';

type PaginatedResult = {
  status: string;
  results: Array<Record<string, unknown>>;
  loadMore?: () => void;
};

const mockMutation = vi.fn();
const mockNavigate = vi.fn();
const mockLoadMore = vi.fn();
let mockListSearch: Record<string, string> = {};
let mockContactPage: PaginatedResult = { status: 'Exhausted', results: [] };
let mockContactListError: unknown = undefined;
let mockContact: Record<string, unknown> | null = null;
let mockContactError: unknown = undefined;

const argumentValidationError = (functionName: string, path: string) =>
  new Error(
    `[CONVEX Q(${functionName})] Server Error\nArgumentValidationError: Value does not match validator.\nPath: .${path}\nValue: "garbage"\nValidator: v.id("table")`,
  );

const contactRow = (overrides: Record<string, unknown> = {}) => ({
  _id: 'contact-a',
  accountId: 'account-a',
  accountName: 'account-a',
  lastName: 'Synthetic',
  email: null,
  revision: 1,
  createdByName: 'seller-b',
  createdAt: 0,
  deletedAt: null,
  permissions: { canUpdate: true, canTrash: true, canRestore: false },
  ...overrides,
});

vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signOut: vi.fn() }),
}));
vi.mock('@convex-dev/react-query', () => ({
  convexQuery: (reference: FunctionReference<'query'>) =>
    getFunctionName(reference),
  useConvexPaginatedQuery: (
    reference: FunctionReference<'query'>,
  ): PaginatedResult => {
    const name = getFunctionName(reference);
    if (name === 'workspaceContacts:list') {
      if (mockContactListError !== undefined) throw mockContactListError;
      return { ...mockContactPage, loadMore: mockLoadMore };
    }
    if (name === 'workspaceCompanies:list')
      return {
        status: 'Exhausted',
        results: [
          { _id: 'account-a', name: 'account-a' },
          { _id: 'account-b', name: 'account-b' },
        ],
      };
    return {
      status: 'Exhausted',
      results: [{ workspaceId: 'workspace', name: 'Workspace' }],
    };
  },
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ clear: vi.fn() }),
  useQuery: (functionName: string) =>
    functionName === 'workspaces:getMine'
      ? {
          isPending: false,
          data: { workspaceId: 'workspace', name: 'Workspace', role: 'seller' },
        }
      : mockContactError === undefined
        ? { isPending: false, isError: false, data: mockContact }
        : { isPending: false, isError: true, error: mockContactError },
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  useParams: () => ({ personId: 'contact-a' }),
  useNavigate: () => mockNavigate,
  useRouter: () => ({ state: { location: {} } }),
  useSearch: ({ from }: { from?: string } = {}) =>
    from === '/objects/people'
      ? mockListSearch
      : { workspace: 'workspace', ...mockListSearch },
  useLocation: () => ({ pathname: '/objects/people' }),
}));
vi.mock('convex/react', () => ({
  useMutation: () => mockMutation,
  useConvexConnectionState: () => ({
    isWebSocketConnected: true,
    hasEverConnected: true,
  }),
}));
vi.mock('twenty-ui/components', () => ({
  MainButton: ({
    loading,
    children,
    type,
    onClick,
  }: React.ComponentProps<'button'> & { loading?: boolean }) => (
    <button type={type} onClick={onClick} disabled={loading}>
      {children}
    </button>
  ),
}));

const renderPage = (page: React.ReactNode) =>
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <WorkspaceGate>{page}</WorkspaceGate>
    </I18nProvider>,
  );

beforeEach(() => {
  mockListSearch = {};
  mockContactPage = { status: 'Exhausted', results: [] };
  mockContactListError = undefined;
  mockContact = null;
  mockContactError = undefined;
  mockMutation.mockReset();
  mockNavigate.mockReset();
  mockLoadMore.mockReset();
});

it('lists permitted people with their company and offers navigation to them', () => {
  mockContactPage = { status: 'Exhausted', results: [contactRow()] };
  renderPage(<PeoplePage />);
  const table = screen.getByRole('table');
  expect(table).toHaveTextContent('Synthetic');
  expect(table).toHaveTextContent('account-a');
  expect(screen.queryByText('No people yet')).toBeNull();
});

it('does not report an empty list while a short page can still load more', async () => {
  mockContactPage = { status: 'CanLoadMore', results: [] };
  const user = userEvent.setup();
  renderPage(<PeoplePage />);
  expect(screen.queryByText('No people yet')).toBeNull();
  expect(
    screen.getByText('No people loaded yet. Load more to keep searching.'),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Load more' }));
  expect(mockLoadMore).toHaveBeenCalledWith(25);
});

it('shows the empty state only once every page is exhausted', () => {
  renderPage(<PeoplePage />);
  expect(screen.getByText('No people yet')).toBeVisible();
});

it('searches by last name through the URL', async () => {
  const user = userEvent.setup();
  renderPage(<PeoplePage />);
  await user.type(
    screen.getByRole('searchbox', { name: 'Search people' }),
    ' synth ',
  );
  await user.click(screen.getByRole('button', { name: 'Search' }));
  expect(mockNavigate).toHaveBeenCalledWith({
    to: '/objects/people',
    search: { workspace: 'workspace', q: 'synth', company: undefined },
  });
});

it('recovers from an unavailable company filter without revealing it', async () => {
  mockListSearch = { company: 'account-b' };
  mockContactListError = new ConvexError('COMPANY_NOT_FOUND');
  const errorLog = vi
    .spyOn(console, 'error')
    .mockImplementation(() => undefined);
  const user = userEvent.setup();
  try {
    renderPage(<PeoplePage />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'That company is unavailable',
    );
    await user.click(screen.getByRole('button', { name: 'Show all people' }));
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/objects/people',
      search: { workspace: 'workspace', q: undefined, company: undefined },
    });
  } finally {
    errorLog.mockRestore();
  }
});

it('treats a malformed company filter as an unavailable company', () => {
  mockListSearch = { company: 'garbage' };
  mockContactListError = argumentValidationError(
    'workspaceContacts:list',
    'accountId',
  );
  const errorLog = vi
    .spyOn(console, 'error')
    .mockImplementation(() => undefined);
  try {
    renderPage(<PeoplePage />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'That company is unavailable',
    );
    expect(
      screen.getByRole('button', { name: 'Show all people' }),
    ).toBeVisible();
  } finally {
    errorLog.mockRestore();
  }
});

it('shows a malformed person link as not found', () => {
  mockContactError = argumentValidationError(
    'workspaceContacts:get',
    'contactId',
  );
  renderPage(<PersonDetailPage />);
  expect(
    screen.getByRole('heading', { name: 'Person not found' }),
  ).toBeVisible();
  expect(screen.queryByText('Unable to load person')).toBeNull();
});

it('still reports a person load failure that is not a malformed link', () => {
  mockContactError = new Error('Network failure');
  renderPage(<PersonDetailPage />);
  expect(
    screen.getByRole('heading', { name: 'Unable to load person' }),
  ).toBeVisible();
});

it('creates a person once with an operation ID and opens it', async () => {
  mockMutation.mockResolvedValue('contact-new');
  const user = userEvent.setup();
  renderPage(<PeoplePage />);
  await user.click(screen.getByRole('button', { name: 'New person' }));
  await user.type(screen.getByRole('textbox', { name: 'Last name' }), 'Lee');
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Company' }),
    'account-a',
  );
  await user.click(screen.getByRole('button', { name: 'Create person' }));
  expect(mockMutation).toHaveBeenCalledTimes(1);
  expect(mockMutation).toHaveBeenCalledWith({
    workspaceId: 'workspace',
    lastName: 'Lee',
    email: '',
    accountId: 'account-a',
    operationId: expect.any(String),
  });
  expect(mockNavigate).toHaveBeenCalledWith({
    to: '/object/person/$personId',
    params: { personId: 'contact-new' },
    search: { workspace: 'workspace' },
  });
});

it('shows a person that is missing or not permitted as not found', () => {
  renderPage(<PersonDetailPage />);
  expect(
    screen.getByRole('heading', { name: 'Person not found' }),
  ).toBeVisible();
});

it('relinks a person with the revision from edit start', async () => {
  mockContact = contactRow({ email: 'old@example.test' });
  mockMutation.mockResolvedValue({ revision: 2 });
  const user = userEvent.setup();
  const view = renderPage(<PersonDetailPage />);
  const details = screen.getByRole('region', { name: 'Person details' });
  expect(details).toHaveTextContent('old@example.test');
  expect(details).toHaveTextContent('account-a');
  await user.click(screen.getByRole('button', { name: 'Edit person' }));
  mockContact = contactRow({ revision: 2 });
  view.rerender(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <WorkspaceGate>
        <PersonDetailPage />
      </WorkspaceGate>
    </I18nProvider>,
  );
  await user.clear(screen.getByRole('textbox', { name: 'Email' }));
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Company' }),
    'account-b',
  );
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(mockMutation).toHaveBeenCalledWith({
    workspaceId: 'workspace',
    contactId: 'contact-a',
    expectedRevision: 1,
    lastName: 'Synthetic',
    email: '',
    accountId: 'account-b',
    operationId: expect.any(String),
  });
});

it('omits the company on an edit that keeps the same company', async () => {
  mockContact = contactRow();
  mockMutation.mockResolvedValue({ revision: 2 });
  const user = userEvent.setup();
  renderPage(<PersonDetailPage />);
  await user.click(screen.getByRole('button', { name: 'Edit person' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Email' }),
    'new@example.test',
  );
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(mockMutation).toHaveBeenCalledWith({
    workspaceId: 'workspace',
    contactId: 'contact-a',
    expectedRevision: 1,
    lastName: 'Synthetic',
    email: 'new@example.test',
    operationId: expect.any(String),
  });
  expect(
    await screen.findByRole('button', { name: 'Edit person' }),
  ).toBeVisible();
});
