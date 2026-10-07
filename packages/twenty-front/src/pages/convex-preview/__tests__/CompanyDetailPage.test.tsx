import { vi } from 'vite-plus/test';

import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getFunctionName, type FunctionReference } from 'convex/server';
import { useSyncExternalStore } from 'react';

import {
  CompanyDetailPage,
  WorkspaceGate,
} from '~/pages/convex-preview/CompaniesWorkspace';

const mockUpdateCompany = vi.fn();
let mockRevision = 1;
let mockCanReassign = false;

vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signOut: vi.fn() }),
}));
vi.mock('@convex-dev/react-query', () => ({
  convexQuery: (reference: FunctionReference<'query'>) =>
    getFunctionName(reference),
  useConvexPaginatedQuery: () => ({
    status: 'Exhausted',
    results: [
      {
        workspaceId: 'workspace',
        name: 'Workspace',
        memberId: 'member',
        displayName: 'Member',
        role: 'seller',
      },
    ],
  }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ clear: vi.fn() }),
  useQuery: (functionName: string) => ({
    data:
      functionName === 'workspaces:getMine'
        ? { workspaceId: 'workspace', name: 'Workspace', role: 'seller' }
        : {
            _id: 'company',
            name: 'Original',
            industry: 'services',
            revision: mockRevision,
            domainName: { primaryLinkLabel: '', primaryLinkUrl: '' },
            accountOwnerId: 'original-member',
            accountOwnerName: 'Original owner',
            permissions: {
              canUpdate: true,
              canReassign: mockCanReassign,
              canTrash: true,
            },
            createdAt: 0,
          },
  }),
}));
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  useParams: () => ({ companyId: 'company' }),
  useNavigate: () => vi.fn(),
  useRouter: () => ({ state: { location: {} } }),
  useSearch: () => ({ workspace: 'workspace' }),
  useLocation: () => ({ pathname: '/objects/companies' }),
}));
let isWebSocketConnected = true;
const connectionListeners = new Set<() => void>();
const setWebSocketConnected = (connected: boolean) => {
  isWebSocketConnected = connected;
  connectionListeners.forEach((listener) => listener());
};
vi.mock('convex/react', () => ({
  useMutation: () => mockUpdateCompany,
  useConvexConnectionState: () => {
    const connected = useSyncExternalStore(
      (listener) => {
        connectionListeners.add(listener);
        return () => connectionListeners.delete(listener);
      },
      () => isWebSocketConnected,
    );
    return { isWebSocketConnected: connected, hasEverConnected: true };
  },
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
vi.mock('twenty-ui/icon', () => ({
  IconBuildingSkyscraper: () => null,
  IconChevronLeft: () => null,
  IconPlus: () => null,
  IconUsers: () => null,
  IconTrash: () => null,
}));

it('submits the revision at edit start even after a subscription updates', async () => {
  const user = userEvent.setup();
  const i18n = setupI18n({ locale: 'en', messages: { en: {} } });
  const view = () => (
    <I18nProvider i18n={i18n}>
      <WorkspaceGate>
        <CompanyDetailPage />
      </WorkspaceGate>
    </I18nProvider>
  );
  const { rerender } = render(view());
  expect(screen.getByText('Services')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Edit company' }));
  await user.clear(screen.getByRole('textbox', { name: 'Name' }));
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'My edit');
  mockRevision = 2;
  rerender(view());
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(mockUpdateCompany).toHaveBeenCalledWith({
    workspaceId: 'workspace',
    companyId: 'company',
    expectedRevision: 1,
    name: 'My edit',
    industry: 'services',
    operationId: expect.any(String),
  });
});

it('keeps an edit pending through an outage and confirms it once after reconnect', async () => {
  mockRevision = 1;
  let acknowledge: (value: unknown) => void = () => {};
  mockUpdateCompany.mockReset().mockImplementation(
    () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
  );
  const user = userEvent.setup();
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <WorkspaceGate>
        <CompanyDetailPage />
      </WorkspaceGate>
    </I18nProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Edit company' }));
  await user.clear(screen.getByRole('textbox', { name: 'Name' }));
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'My edit');
  await user.click(screen.getByRole('button', { name: 'Save changes' }));
  act(() => setWebSocketConnected(false));
  try {
    expect(
      await screen.findByText(
        'Reconnecting… Your change will be confirmed when the connection returns.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => {
      setWebSocketConnected(true);
      acknowledge(null);
    });
    expect(
      await screen.findByRole('button', { name: 'Edit company' }),
    ).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(mockUpdateCompany).toHaveBeenCalledTimes(1);
  } finally {
    setWebSocketConnected(true);
    mockUpdateCompany.mockReset();
  }
});

it('uses server permission to let a manager reassign the owner', async () => {
  mockCanReassign = true;
  mockUpdateCompany.mockClear();
  const user = userEvent.setup();
  try {
    render(
      <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
        <WorkspaceGate>
          <CompanyDetailPage />
        </WorkspaceGate>
      </I18nProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Edit company' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Account Owner' }),
      'member',
    );
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(mockUpdateCompany).toHaveBeenCalledWith(
      expect.objectContaining({ accountOwnerId: 'member' }),
    );
  } finally {
    mockCanReassign = false;
  }
});
