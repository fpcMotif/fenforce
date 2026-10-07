import { vi } from 'vite-plus/test';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getFunctionName, type FunctionReference } from 'convex/server';

import { PreviewRouter } from '~/pages/convex-preview/PreviewRouter';

const signOut = vi.fn(() => new Promise<void>(() => undefined));
const mutation = vi.fn();
let workspaceRole = 'seller';
vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signOut }),
}));
vi.mock('convex/react', () => ({
  useMutation: () => mutation,
  useConvexConnectionState: () => ({ isWebSocketConnected: true }),
}));
const FIRST_PAGE_WORKSPACE_IDS = ['workspace-a', 'workspace-b'];
const LATER_PAGE_WORKSPACE_ID = 'workspace-c';
const assignedWorkspace = (workspaceId: string) => ({
  workspaceId,
  name: `Workspace ${workspaceId.slice(-1).toUpperCase()}`,
  role: workspaceRole,
});
vi.mock('@convex-dev/react-query', () => ({
  convexQuery: (
    reference: FunctionReference<'query'>,
    args: { workspaceId: string } | 'skip',
  ) =>
    args === 'skip'
      ? { queryKey: [getFunctionName(reference), 'skip'], enabled: false }
      : {
          queryKey: [getFunctionName(reference), args.workspaceId],
          queryFn: () =>
            [...FIRST_PAGE_WORKSPACE_IDS, LATER_PAGE_WORKSPACE_ID].includes(
              args.workspaceId,
            )
              ? assignedWorkspace(args.workspaceId)
              : null,
        },
  useConvexPaginatedQuery: (
    reference: FunctionReference<'query'>,
    args: { workspaceId?: string },
  ) => ({
    status: 'Exhausted',
    results:
      getFunctionName(reference) === 'accountViews:list'
        ? []
        : args.workspaceId
          ? [
              {
                _id: `${args.workspaceId}-company`,
                memberId: 'seller',
                displayName: 'Seller',
                name: `${args.workspaceId} company`,
                domainName: {},
                createdByName: 'Seller',
                createdAt: 0,
              },
            ]
          : FIRST_PAGE_WORKSPACE_IDS.map(assignedWorkspace),
  }),
}));

it('selects the first assigned workspace after sign-in without a workspace parameter', async () => {
  window.history.replaceState({}, '', '/objects/companies');
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <QueryClientProvider client={new QueryClient()}>
        <PreviewRouter />
      </QueryClientProvider>
    </I18nProvider>,
  );
  expect(await screen.findByText('workspace-a company')).toBeVisible();
  expect(window.location.pathname).toBe('/objects/companies');
  expect(window.location.search).toBe('?workspace=workspace-a');
});

it('restores the workspace from a deep link, switches safely, follows history and hides data immediately on logout', async () => {
  window.history.replaceState(
    {},
    '',
    '/objects/companies?workspace=workspace-b',
  );
  const user = userEvent.setup();
  const queryClient = new QueryClient();
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <QueryClientProvider client={queryClient}>
        <PreviewRouter />
      </QueryClientProvider>
    </I18nProvider>,
  );
  expect(await screen.findByText('workspace-b company')).toBeVisible();
  expect(screen.queryByText('workspace-a company')).toBeNull();
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Workspace' }),
    'workspace-a',
  );
  expect(await screen.findByText('workspace-a company')).toBeVisible();
  expect(window.location.search).toBe('?workspace=workspace-a');
  expect(screen.queryByText('workspace-b company')).toBeNull();
  await act(async () => window.history.back());
  expect(await screen.findByText('workspace-b company')).toBeVisible();
  queryClient.setQueryData(['protected'], 'workspace-b company');
  await user.click(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() =>
    expect(screen.queryByText('workspace-b company')).toBeNull(),
  );
  expect(
    queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => query.state.data !== undefined),
  ).toHaveLength(0);
});

it('shows administration instead of sales records for an administrator', async () => {
  workspaceRole = 'admin';
  window.history.replaceState(
    {},
    '',
    '/objects/companies?workspace=workspace-a',
  );
  try {
    render(
      <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
        <QueryClientProvider client={new QueryClient()}>
          <PreviewRouter />
        </QueryClientProvider>
      </I18nProvider>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Members' }),
    ).toBeVisible();
    expect(window.location.pathname).toBe('/settings/members');
    expect(screen.queryByText('workspace-a company')).toBeNull();
    expect(screen.queryByRole('button', { name: 'New company' })).toBeNull();
  } finally {
    workspaceRole = 'seller';
  }
});

it('does not show sales records or creation controls without a sales role', async () => {
  workspaceRole = 'member';
  window.history.replaceState(
    {},
    '',
    '/objects/companies?workspace=workspace-a',
  );
  try {
    render(
      <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
        <QueryClientProvider client={new QueryClient()}>
          <PreviewRouter />
        </QueryClientProvider>
      </I18nProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sales access is required',
    );
    expect(screen.queryByText('workspace-a company')).toBeNull();
    expect(screen.queryByRole('button', { name: 'New company' })).toBeNull();
  } finally {
    workspaceRole = 'seller';
  }
});

it('does not silently select another workspace for an unauthorized deep link', async () => {
  window.history.replaceState(
    {},
    '',
    '/objects/companies?workspace=foreign-workspace',
  );
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <QueryClientProvider client={new QueryClient()}>
        <PreviewRouter />
      </QueryClientProvider>
    </I18nProvider>,
  );
  expect(
    await screen.findByRole('heading', { name: 'Workspace unavailable' }),
  ).toBeVisible();
  expect(screen.queryByText('workspace-a company')).toBeNull();
  expect(screen.queryByText('workspace-b company')).toBeNull();
  expect(window.location.search).toBe('?workspace=foreign-workspace');
});

it('opens a requested workspace that is not on the first page of the workspace list', async () => {
  window.history.replaceState(
    {},
    '',
    `/objects/companies?workspace=${LATER_PAGE_WORKSPACE_ID}`,
  );
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <QueryClientProvider client={new QueryClient()}>
        <PreviewRouter />
      </QueryClientProvider>
    </I18nProvider>,
  );
  expect(await screen.findByText('workspace-c company')).toBeVisible();
  expect(screen.getByRole('combobox', { name: 'Workspace' })).toHaveValue(
    LATER_PAGE_WORKSPACE_ID,
  );
  expect(
    screen.queryByRole('heading', { name: 'Workspace unavailable' }),
  ).toBeNull();
});

it('does not return to an old workspace when its pending create completes after switching', async () => {
  let finish: ((value: string) => void) | undefined;
  mutation.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  window.history.replaceState(
    {},
    '',
    '/objects/companies?workspace=workspace-a',
  );
  const user = userEvent.setup();
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <QueryClientProvider client={new QueryClient()}>
        <PreviewRouter />
      </QueryClientProvider>
    </I18nProvider>,
  );
  await user.click(await screen.findByRole('button', { name: 'New company' }));
  await user.type(
    screen.getByRole('textbox', { name: 'Name' }),
    'Pending company',
  );
  await user.click(screen.getByRole('button', { name: 'Create company' }));
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Workspace' }),
    'workspace-b',
  );
  expect(await screen.findByText('workspace-b company')).toBeVisible();
  await act(async () => {
    finish?.('created-company');
  });
  expect(window.location.pathname).toBe('/objects/companies');
  expect(window.location.search).toBe('?workspace=workspace-b');
  expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull();
});
