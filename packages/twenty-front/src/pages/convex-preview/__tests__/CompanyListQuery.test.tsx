import { vi } from 'vite-plus/test';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getFunctionName, type FunctionReference } from 'convex/server';
import { ConvexError } from 'convex/values';

import { PreviewRouter } from '~/pages/convex-preview/PreviewRouter';

type PaginatedCall = { name: string; args: Record<string, unknown> | 'skip' };

const FOREIGN_OWNER_ID = 'foreign-owner';
const MALFORMED_OWNER_ID = 'not-a-member-id';
const FAILING_OWNER_ID = 'owner-with-failing-query';
const mutation = vi.fn();
const loadMoreCompanies = vi.fn();
const paginatedCalls: PaginatedCall[] = [];
let workspaceRole = 'manager';
let companyStatus = 'Exhausted';

const savedView = {
  _id: 'view-1',
  name: 'Unassigned services',
  scope: 'private',
  revision: 3,
  configuration: {
    columns: ['account.name'],
    search: 'acme',
    filters: { industry: 'services', ownerId: 'owner-2' },
    sort: { field: 'account.name', direction: 'desc' },
  },
};
const sharedView = {
  _id: 'view-2',
  name: 'Team pipeline',
  scope: 'workspace',
  revision: 1,
  configuration: {
    columns: ['account.name'],
    search: '',
    filters: { industry: null },
    sort: { field: 'account.name', direction: 'asc' },
  },
};

vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signOut: vi.fn() }),
}));
vi.mock('convex/react', () => ({
  useMutation: () => mutation,
  useConvexConnectionState: () => ({ isWebSocketConnected: true }),
}));
vi.mock('@convex-dev/react-query', () => ({
  convexQuery: (
    reference: FunctionReference<'query'>,
    args: { workspaceId: string } | 'skip',
  ) => ({
    queryKey: [getFunctionName(reference), args],
    enabled: args !== 'skip',
    queryFn: () => ({
      workspaceId: 'workspace-a',
      name: 'Workspace A',
      role: workspaceRole,
    }),
  }),
  useConvexPaginatedQuery: (
    reference: FunctionReference<'query'>,
    args: Record<string, unknown> | 'skip',
  ) => {
    const name = getFunctionName(reference);
    paginatedCalls.push({ name, args });
    if (name === 'workspaces:listMine')
      return {
        status: 'Exhausted',
        results: [
          {
            workspaceId: 'workspace-a',
            name: 'Workspace A',
            role: workspaceRole,
          },
        ],
      };
    if (name === 'accountViews:list')
      return { status: 'Exhausted', results: [savedView, sharedView] };
    if (name === 'workspaceCompanies:listEligibleOwners')
      return {
        status: 'Exhausted',
        results:
          args === 'skip'
            ? []
            : [
                { memberId: 'owner-1', displayName: 'Olivia Owner' },
                { memberId: 'owner-2', displayName: 'Peter Partner' },
              ],
      };
    const ownerId =
      args === 'skip'
        ? undefined
        : (args.filters as { ownerId?: string } | undefined)?.ownerId;
    if (ownerId === FOREIGN_OWNER_ID) throw new ConvexError('FORBIDDEN');
    if (ownerId === MALFORMED_OWNER_ID)
      throw new Error(
        `[CONVEX Q(workspaceCompanies:list)] Server Error\nArgumentValidationError: Value does not match validator.\nPath: .filters.ownerId\nValue: "${MALFORMED_OWNER_ID}"\nValidator: v.id("workspaceMembers")`,
      );
    if (ownerId === FAILING_OWNER_ID)
      throw new ConvexError('ACCOUNT_QUERY_INDEX_NOT_READY');
    return {
      status: companyStatus,
      loadMore: loadMoreCompanies,
      results: [
        {
          _id: 'company-1',
          name: 'Acme',
          industry: 'services',
          domainName: {},
          accountOwnerName: 'Olivia Owner',
          createdByName: 'Olivia Owner',
          createdAt: 0,
        },
      ],
    };
  },
}));

const lastListArgs = () =>
  paginatedCalls
    .filter((call) => call.name === 'workspaceCompanies:list')
    .at(-1)?.args;

const renderAt = (url: string) => {
  window.history.replaceState({}, '', url);
  return render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <QueryClientProvider client={new QueryClient()}>
        <PreviewRouter />
      </QueryClientProvider>
    </I18nProvider>,
  );
};

const currentSearch = () =>
  Object.fromEntries(new URLSearchParams(window.location.search));

beforeEach(() => {
  paginatedCalls.length = 0;
  mutation.mockReset();
  loadMoreCompanies.mockReset();
  workspaceRole = 'manager';
  companyStatus = 'Exhausted';
});

it('restores the search, filters, and sort from the URL into the list query', async () => {
  renderAt(
    '/objects/companies?workspace=workspace-a&q=acme&industry=none&owner=owner-1&sort=desc',
  );
  expect(await screen.findByText('Acme')).toBeVisible();
  expect(lastListArgs()).toEqual({
    workspaceId: 'workspace-a',
    search: 'acme',
    filters: { industry: null, ownerId: 'owner-1' },
    sortDirection: 'desc',
  });
  expect(
    screen.getByRole('searchbox', { name: 'Search companies' }),
  ).toHaveValue('acme');
  expect(
    screen.getByRole('combobox', { name: 'Filter by industry' }),
  ).toHaveValue('none');
  expect(
    screen.getByRole('combobox', { name: 'Filter by account owner' }),
  ).toHaveValue('owner-1');
  expect(screen.getByRole('button', { name: 'Sort: Name Z–A' })).toBeVisible();
});

it('sends the search, industry, owner, and sort direction to the list query and the URL', async () => {
  const user = userEvent.setup();
  renderAt('/objects/companies?workspace=workspace-a');
  expect(await screen.findByText('Acme')).toBeVisible();
  expect(lastListArgs()).toEqual({
    workspaceId: 'workspace-a',
    sortDirection: 'asc',
  });

  await user.type(
    screen.getByRole('searchbox', { name: 'Search companies' }),
    '  acme {Enter}',
  );
  await waitFor(() =>
    expect(lastListArgs()).toEqual({
      workspaceId: 'workspace-a',
      search: 'acme',
      sortDirection: 'asc',
    }),
  );
  expect(
    screen.getByRole('searchbox', { name: 'Search companies' }),
  ).toHaveFocus();

  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Filter by industry' }),
    'No industry',
  );
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Filter by account owner' }),
    'Peter Partner',
  );
  await user.click(screen.getByRole('button', { name: 'Sort: Name A–Z' }));
  await waitFor(() =>
    expect(lastListArgs()).toEqual({
      workspaceId: 'workspace-a',
      search: 'acme',
      filters: { industry: null, ownerId: 'owner-2' },
      sortDirection: 'desc',
    }),
  );
  expect(currentSearch()).toEqual({
    workspace: 'workspace-a',
    q: 'acme',
    industry: 'none',
    owner: 'owner-2',
    sort: 'desc',
  });
  expect(screen.getByText('Filtered companies')).toBeVisible();

  await user.click(screen.getByRole('button', { name: 'Clear search' }));
  await waitFor(() =>
    expect(lastListArgs()).toEqual({
      workspaceId: 'workspace-a',
      filters: { industry: null, ownerId: 'owner-2' },
      sortDirection: 'desc',
    }),
  );
});

it.each([
  ['a forbidden', FOREIGN_OWNER_ID],
  ['a malformed', MALFORMED_OWNER_ID],
])(
  'drops %s owner filter from the URL and shows the unfiltered list',
  async (_, ownerId) => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    try {
      renderAt(
        `/objects/companies?workspace=workspace-a&q=acme&owner=${ownerId}`,
      );
      expect(
        await screen.findByText(
          'That owner filter is unavailable, so all companies are shown.',
        ),
      ).toBeVisible();
      expect(screen.getByText('Acme')).toBeVisible();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(lastListArgs()).toEqual({
        workspaceId: 'workspace-a',
        search: 'acme',
        sortDirection: 'asc',
      });
      expect(currentSearch()).toEqual({ workspace: 'workspace-a', q: 'acme' });
    } finally {
      consoleError.mockRestore();
    }
  },
);

it('shows the error page and keeps the owner filter when the list fails for another reason', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    renderAt(
      `/objects/companies?workspace=workspace-a&owner=${FAILING_OWNER_ID}`,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Unable to load Fenforce',
    );
    expect(
      screen.queryByText(
        'That owner filter is unavailable, so all companies are shown.',
      ),
    ).toBeNull();
    expect(currentSearch()).toEqual({
      workspace: 'workspace-a',
      owner: FAILING_OWNER_ID,
    });
  } finally {
    consoleError.mockRestore();
  }
});

it('keeps loading more companies with the active query', async () => {
  companyStatus = 'CanLoadMore';
  const user = userEvent.setup();
  renderAt('/objects/companies?workspace=workspace-a&industry=services');
  await user.click(await screen.findByRole('button', { name: 'Load more' }));
  expect(loadMoreCompanies).toHaveBeenCalledWith(25);
  expect(lastListArgs()).toEqual({
    workspaceId: 'workspace-a',
    filters: { industry: 'services' },
    sortDirection: 'asc',
  });
});

it('does not offer or send an owner filter for a seller', async () => {
  workspaceRole = 'seller';
  renderAt('/objects/companies?workspace=workspace-a&owner=owner-1');
  expect(await screen.findByText('Acme')).toBeVisible();
  expect(
    screen.queryByRole('combobox', { name: 'Filter by account owner' }),
  ).toBeNull();
  expect(lastListArgs()).toEqual({
    workspaceId: 'workspace-a',
    sortDirection: 'asc',
  });
  expect(
    screen.queryByRole('button', { name: 'Delete view Team pipeline' }),
  ).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Delete view Unassigned services' }),
  ).toBeVisible();
});

it('applies a saved view and keeps it applied after a page refresh', async () => {
  const user = userEvent.setup();
  const rendered = renderAt('/objects/companies?workspace=workspace-a');
  const views = await screen.findByRole('navigation', { name: 'Saved views' });
  await user.click(
    within(views).getByRole('button', { name: 'Unassigned services' }),
  );
  const appliedArgs = {
    workspaceId: 'workspace-a',
    search: 'acme',
    filters: { industry: 'services', ownerId: 'owner-2' },
    sortDirection: 'desc',
  };
  await waitFor(() => expect(lastListArgs()).toEqual(appliedArgs));
  expect(
    screen.getByRole('searchbox', { name: 'Search companies' }),
  ).toHaveValue('acme');
  expect(currentSearch()).toEqual({
    workspace: 'workspace-a',
    q: 'acme',
    industry: 'services',
    owner: 'owner-2',
    sort: 'desc',
    view: 'view-1',
  });

  rendered.unmount();
  paginatedCalls.length = 0;
  renderAt(`${window.location.pathname}${window.location.search}`);
  expect(
    await screen.findByRole('button', { name: 'Unassigned services' }),
  ).toHaveAttribute('aria-current', 'true');
  expect(lastListArgs()).toEqual(appliedArgs);

  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Filter by industry' }),
    'All industries',
  );
  await waitFor(() => expect(currentSearch().view).toBeUndefined());
  expect(
    screen.getByRole('button', { name: 'Unassigned services' }),
  ).not.toHaveAttribute('aria-current');

  await user.click(screen.getByRole('button', { name: 'All companies' }));
  await waitFor(() =>
    expect(currentSearch()).toEqual({ workspace: 'workspace-a' }),
  );
});

it('saves the current query as a named view and applies it', async () => {
  mutation.mockResolvedValue('view-new');
  const user = userEvent.setup();
  renderAt(
    '/objects/companies?workspace=workspace-a&q=acme&industry=none&sort=desc',
  );
  await user.click(
    await screen.findByRole('button', { name: 'Save current view' }),
  );
  await user.type(screen.getByRole('textbox', { name: 'View name' }), ' Mine ');
  await user.click(
    screen.getByRole('checkbox', { name: 'Share with workspace' }),
  );
  await user.click(screen.getByRole('button', { name: 'Save view' }));
  expect(mutation).toHaveBeenCalledWith({
    workspaceId: 'workspace-a',
    name: 'Mine',
    scope: 'workspace',
    configuration: {
      columns: ['account.name', 'account.industry', 'account.owner'],
      search: 'acme',
      filters: { industry: null },
      sort: { field: 'account.name', direction: 'desc' },
    },
  });
  await waitFor(() => expect(currentSearch().view).toBe('view-new'));
  expect(screen.queryByRole('form', { name: 'Save view' })).toBeNull();
});

it('shows a save failure without leaving the form', async () => {
  mutation.mockRejectedValue(new ConvexError('INVALID_VIEW_NAME'));
  const user = userEvent.setup();
  renderAt('/objects/companies?workspace=workspace-a');
  await user.click(
    await screen.findByRole('button', { name: 'Save current view' }),
  );
  await user.type(screen.getByRole('textbox', { name: 'View name' }), 'x');
  await user.click(screen.getByRole('button', { name: 'Save view' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Enter a view name of up to 100 characters.',
  );
  expect(screen.getByRole('form', { name: 'Save view' })).toBeVisible();
});

it('deletes a saved view after confirmation and detaches it from the URL', async () => {
  mutation.mockResolvedValue(null);
  const user = userEvent.setup();
  renderAt(
    '/objects/companies?workspace=workspace-a&q=acme&industry=services&owner=owner-2&sort=desc&view=view-1',
  );
  await user.click(
    await screen.findByRole('button', {
      name: 'Delete view Unassigned services',
    }),
  );
  const confirmation = screen.getByRole('region', {
    name: 'Confirm delete view',
  });
  expect(
    within(confirmation).getByRole('button', { name: 'Cancel' }),
  ).toHaveFocus();
  await user.click(
    within(confirmation).getByRole('button', { name: 'Delete view' }),
  );
  expect(mutation).toHaveBeenCalledWith({
    workspaceId: 'workspace-a',
    viewId: 'view-1',
    expectedRevision: 3,
  });
  await waitFor(() => expect(currentSearch().view).toBeUndefined());
  expect(currentSearch()).toEqual({
    workspace: 'workspace-a',
    q: 'acme',
    industry: 'services',
    owner: 'owner-2',
    sort: 'desc',
  });
});
