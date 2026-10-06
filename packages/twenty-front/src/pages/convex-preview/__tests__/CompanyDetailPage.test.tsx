import { vi } from 'vite-plus/test';

import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  CompanyDetailPage,
  WorkspaceGate,
} from '~/pages/convex-preview/CompaniesWorkspace';

const mockUpdateCompany = vi.fn();
let mockRevision = 1;

vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signOut: vi.fn() }),
}));
vi.mock('@convex-dev/react-query', () => ({
  convexQuery: vi.fn(),
  useConvexPaginatedQuery: () => ({
    status: 'Exhausted',
    results: [
      {
        workspaceId: 'workspace',
        name: 'Workspace',
        memberId: 'member',
        displayName: 'Member',
      },
    ],
  }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ clear: vi.fn() }),
  useQuery: () => ({
    data: {
      _id: 'company',
      name: 'Original',
      industry: 'services',
      revision: mockRevision,
      domainName: { primaryLinkLabel: '', primaryLinkUrl: '' },
      accountOwnerId: null,
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
  useSearch: () => ({ workspace: 'workspace' }),
  useLocation: () => ({ pathname: '/objects/companies' }),
}));
vi.mock('convex/react', () => ({
  useMutation: () => mockUpdateCompany,
  useConvexConnectionState: () => ({ isWebSocketConnected: true }),
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
  });
});
