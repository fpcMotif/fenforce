import type * as ReactRouterDomModule from 'react-router-dom';
import { vi } from 'vite-plus/test';

import { WorkspaceSurfaceContext } from '@/ui/layout/contexts/WorkspaceSurfaceContext';
import { RecordIndexPage } from '~/pages/object-record/RecordIndexPage';
import { render, screen } from '@testing-library/react';

const mockIsCoreWorkflowsIndexEnabled = vi.fn();
let mockObjectNamePlural = 'people';

vi.mock('react-router-dom', async () => ({
  ...(await vi.importActual<typeof ReactRouterDomModule>('react-router-dom')),
  useParams: () => ({ objectNamePlural: mockObjectNamePlural }),
}));

vi.mock('@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue', () => ({
  useAtomComponentStateValue: () => 'person-object-metadata-id',
}));

vi.mock('@/ui/utilities/state/jotai/hooks/useAtomFamilyStateValue', () => ({
  useAtomFamilyStateValue: () => ({ status: 'up-to-date' }),
}));

vi.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({
    objectMetadataItems: [
      {
        id: 'person-object-metadata-id',
        nameSingular: 'person',
        namePlural: 'people',
      },
    ],
  }),
}));

vi.mock('@/workspace/hooks/useIsFeatureEnabled', () => ({
  useIsFeatureEnabled: () => false,
}));

vi.mock('@/object-core/workflows/utils/isCoreWorkflowsIndexEnabled', () => ({
  isCoreWorkflowsIndexEnabled: () => mockIsCoreWorkflowsIndexEnabled(),
}));

vi.mock(
  '@/object-record/record-index/components/RecordIndexContainerGater',
  () => ({
    RecordIndexContainerGater: () => <div data-testid="record-index-gater" />,
  }),
);

vi.mock('@/ui/layout/page/components/PageContainer', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-container">{children}</div>
  ),
}));

vi.mock('@/app/routing/components/WorkspaceRouteUnavailable', () => ({
  WorkspaceRouteUnavailable: () => <div data-testid="route-unavailable" />,
}));

vi.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({
    objectMetadataItem: { labelPlural: 'Workflows' },
  }),
}));

vi.mock('@/object-core/workflows/hooks/useCoreWorkflows', () => ({
  CORE_WORKFLOWS_INITIAL_SORT: [],
  CORE_WORKFLOWS_TABLE_ID: 'workflow-table',
  useCoreWorkflows: () => ({
    coreWorkflows: [{ id: 'workflow-1' }],
    hasNextPage: false,
    loading: false,
    error: undefined,
    fetchNextPage: vi.fn(),
  }),
}));

vi.mock('@/object-core/workflows/hooks/useCreateCoreWorkflow', () => ({
  useCreateCoreWorkflow: () => ({
    createCoreWorkflow: vi.fn(),
    canCreateCoreWorkflow: false,
    isCreatingCoreWorkflow: false,
  }),
}));

vi.mock('react-intersection-observer', () => ({
  useInView: () => ({ ref: vi.fn(), inView: false }),
}));

vi.mock('@/ui/utilities/state/jotai/hooks/useAtomStateValue', () => ({
  useAtomStateValue: () => ({}),
}));

vi.mock('@/object-core/workflows/hooks/useListenToCoreWorkflowEvents', () => ({
  useListenToCoreWorkflowEvents: () => undefined,
}));

vi.mock('@/object-core/components/CoreObjectTable', () => ({
  CoreObjectTable: () => <div data-testid="workflow-core-index" />,
}));

vi.mock('@/ui/layout/page/components/PageCardHeader', () => ({
  PageCardHeader: () => null,
}));

vi.mock('@/ui/layout/page/components/PageCardLayout', () => ({
  PageCardLayout: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/ui/utilities/page-title/components/PageTitle', () => ({
  PageTitle: () => null,
}));

describe('RecordIndexPage workspace surface composition', () => {
  beforeEach(() => {
    mockIsCoreWorkflowsIndexEnabled.mockReturnValue(false);
    mockObjectNamePlural = 'people';
  });

  it('keeps the main page container', () => {
    render(<RecordIndexPage />);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('record-index-gater')).toBeInTheDocument();
  });

  it('hosts the same specialized workflow index on a secondary surface', async () => {
    mockIsCoreWorkflowsIndexEnabled.mockReturnValue(true);

    render(
      <WorkspaceSurfaceContext.Provider
        value={{
          type: 'side-panel',
          instanceId: 'side-panel-page-1',
          ownsRouteLocation: true,
        }}
      >
        <RecordIndexPage />
      </WorkspaceSurfaceContext.Provider>,
    );

    expect(screen.queryByTestId('page-container')).not.toBeInTheDocument();
    expect(
      await screen.findByTestId('workflow-core-index', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('record-index-gater')).not.toBeInTheDocument();
  });

  it('renders a panel-local fallback for a removed object', () => {
    mockObjectNamePlural = 'removedObjects';

    render(
      <WorkspaceSurfaceContext.Provider
        value={{
          type: 'side-panel',
          instanceId: 'side-panel-page-1',
          ownsRouteLocation: true,
        }}
      >
        <RecordIndexPage />
      </WorkspaceSurfaceContext.Provider>,
    );

    expect(screen.getByTestId('route-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('record-index-gater')).not.toBeInTheDocument();
  });
});
