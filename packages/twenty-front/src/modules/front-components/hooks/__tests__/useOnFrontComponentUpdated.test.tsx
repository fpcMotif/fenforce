import { vi } from 'vite-plus/test';

import { renderHook } from '@testing-library/react';

import { useOnFrontComponentUpdated } from '@/front-components/hooks/useOnFrontComponentUpdated';
import { AllMetadataName } from '~/generated-metadata/graphql';

const mockUseListenToEventsForQuery = vi.fn();
const mockUseListenToMetadataOperationBrowserEvent = vi.fn();
const mockUpdateFrontComponentApolloCache = vi.fn();

vi.mock('@/sse-db-event/hooks/useListenToEventsForQuery', () => ({
  useListenToEventsForQuery: (...args: unknown[]) =>
    mockUseListenToEventsForQuery(...args),
}));

vi.mock(
  '@/browser-event/hooks/useListenToMetadataOperationBrowserEvent',
  () => ({
    useListenToMetadataOperationBrowserEvent: (...args: unknown[]) =>
      mockUseListenToMetadataOperationBrowserEvent(...args),
  }),
);

vi.mock('@/front-components/hooks/useUpdateFrontComponentApolloCache', () => ({
  useUpdateFrontComponentApolloCache: () => ({
    updateFrontComponentApolloCache: mockUpdateFrontComponentApolloCache,
  }),
}));

const FRONT_COMPONENT_ID = 'fc-test-id';

describe('useOnFrontComponentUpdated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call useListenToEventsForQuery with correct queryId and operationSignature', () => {
    renderHook(() =>
      useOnFrontComponentUpdated({
        frontComponentId: FRONT_COMPONENT_ID,
      }),
    );

    expect(mockUseListenToEventsForQuery).toHaveBeenCalledWith({
      queryId: `front-component-updated-${FRONT_COMPONENT_ID}`,
      operationSignature: {
        metadataName: AllMetadataName.frontComponent,
        variables: {
          filter: { id: { eq: FRONT_COMPONENT_ID } },
        },
      },
    });
  });

  it('should call useListenToMetadataOperationBrowserEvent with frontComponent metadata name', () => {
    renderHook(() =>
      useOnFrontComponentUpdated({
        frontComponentId: FRONT_COMPONENT_ID,
      }),
    );

    expect(mockUseListenToMetadataOperationBrowserEvent).toHaveBeenCalledWith({
      metadataName: AllMetadataName.frontComponent,
      onMetadataOperationBrowserEvent: mockUpdateFrontComponentApolloCache,
    });
  });

  it('should derive queryId from frontComponentId', () => {
    const customId = 'custom-fc-123';

    renderHook(() =>
      useOnFrontComponentUpdated({
        frontComponentId: customId,
      }),
    );

    expect(mockUseListenToEventsForQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryId: `front-component-updated-${customId}`,
      }),
    );
  });
});
