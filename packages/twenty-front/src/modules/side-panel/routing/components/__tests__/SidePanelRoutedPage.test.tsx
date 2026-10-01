import type * as ReactErrorBoundaryModule from 'react-error-boundary';
import { vi } from 'vite-plus/test';

import { render, screen } from '@testing-library/react';
import { type FallbackProps } from 'react-error-boundary';

import { SidePanelRoutedPage } from '@/side-panel/routing/components/SidePanelRoutedPage';

let mockLocation = {
  pathname: '/object/person/record-1',
  search: '',
  hash: '',
  state: null,
  key: 'route-1',
};
let mockShouldThrow = true;

vi.mock('@/side-panel/routing/hooks/useCurrentSidePanelRoutedPath', () => ({
  useCurrentSidePanelRoutedLocation: () => mockLocation,
}));

vi.mock(
  '@/ui/utilities/state/component-state/hooks/useComponentInstanceStateContext',
  () => ({
    useComponentInstanceStateContext: () => ({ instanceId: 'panel-page-1' }),
  }),
);

vi.mock(
  '@/side-panel/routing/components/SidePanelRouteNavigatorProvider',
  () => ({
    SidePanelRouteNavigatorProvider: ({
      children,
    }: {
      children: React.ReactNode;
    }) => children,
  }),
);

vi.mock('@/app/routing/components/WorkspaceRoutes', () => ({
  WorkspaceRoutes: () => {
    if (mockShouldThrow) {
      throw new Error('stale routed resource');
    }

    return <div data-testid="routed-page" />;
  },
}));

vi.mock('@/app/routing/components/WorkspaceRouteUnavailable', () => ({
  WorkspaceRouteUnavailable: () => <div data-testid="route-unavailable" />,
}));

vi.mock('@/error-handler/components/AppErrorBoundary', async () => {
  const { ErrorBoundary: MockErrorBoundary } = await vi.importActual<
    typeof ReactErrorBoundaryModule
  >('react-error-boundary');

  return {
    AppErrorBoundary: ({
      children,
      FallbackComponent,
    }: {
      children: React.ReactNode;
      FallbackComponent: React.ComponentType<FallbackProps>;
    }) => (
      <MockErrorBoundary FallbackComponent={FallbackComponent}>
        {children}
      </MockErrorBoundary>
    ),
  };
});

describe('SidePanelRoutedPage', () => {
  beforeEach(() => {
    mockLocation = {
      pathname: '/object/person/record-1',
      search: '',
      hash: '',
      state: null,
      key: 'route-1',
    };
    mockShouldThrow = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('contains route errors and resets the boundary for the next location', () => {
    const { rerender } = render(<SidePanelRoutedPage />);

    expect(screen.getByTestId('route-unavailable')).toBeInTheDocument();

    mockLocation = { ...mockLocation, key: 'route-2' };
    mockShouldThrow = false;
    rerender(<SidePanelRoutedPage />);

    expect(screen.getByTestId('routed-page')).toBeInTheDocument();
    expect(screen.queryByTestId('route-unavailable')).not.toBeInTheDocument();
  });
});
