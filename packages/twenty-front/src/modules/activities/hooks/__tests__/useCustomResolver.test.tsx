import { vi } from 'vite-plus/test';

import { renderHook } from '@testing-library/react';

import { getTimelineThreadsFromObjectRecord } from '@/activities/emails/graphql/queries/getTimelineThreadsFromObjectRecord';
import { useCustomResolver } from '@/activities/hooks/useCustomResolver';

vi.mock('@apollo/client/react', () => ({
  useQuery: vi.fn(),
}));

vi.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: vi.fn(() => ({})),
}));

const useQueryMock = (
  await vi.importMock<{ useQuery: ReturnType<typeof vi.fn> }>(
    '@apollo/client/react',
  )
).useQuery;

describe('useCustomResolver', () => {
  beforeEach(() => {
    useQueryMock.mockReturnValue({
      data: undefined,
      loading: false,
      fetchMore: vi.fn(),
      error: undefined,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('queries the timeline resolver by object name and record id for any object', () => {
    renderHook(() =>
      useCustomResolver({
        query: getTimelineThreadsFromObjectRecord,
        queryName: 'getTimelineThreadsFromObjectRecord',
        objectName: 'timelineThreads',
        activityTargetableObject: {
          id: 'record-id',
          targetObjectNameSingular: 'peopleList',
        },
        pageSize: 10,
      }),
    );

    expect(useQueryMock).toHaveBeenCalledWith(
      getTimelineThreadsFromObjectRecord,
      expect.objectContaining({
        variables: {
          objectNameSingular: 'peopleList',
          recordId: 'record-id',
          page: 1,
          pageSize: 10,
        },
      }),
    );
  });
});
