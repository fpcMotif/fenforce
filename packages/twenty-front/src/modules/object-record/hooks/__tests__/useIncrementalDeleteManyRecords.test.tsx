import { vi } from 'vite-plus/test';

import { dispatchObjectRecordOperationBrowserEvent } from '@/browser-event/utils/dispatchObjectRecordOperationBrowserEvent';
import { useRemoveNavigationMenuItemByTargetRecordId } from '@/navigation-menu-item/common/hooks/useRemoveNavigationMenuItemByTargetRecordId';
import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useObjectMetadataItem } from '@/object-metadata/hooks/useObjectMetadataItem';
import { useIncrementalDeleteManyRecords } from '@/object-record/hooks/useIncrementalDeleteManyRecords';
import { useIncrementalFetchAndMutateRecords } from '@/object-record/hooks/useIncrementalFetchAndMutateRecords';
import { useRefetchAggregateQueries } from '@/object-record/hooks/useRefetchAggregateQueries';
import { renderHook } from '@testing-library/react';
import { getMockObjectMetadataItemOrThrow } from '~/testing/utils/getMockObjectMetadataItemOrThrow';

vi.mock('@/object-metadata/hooks/useObjectMetadataItem');
vi.mock('@/object-metadata/hooks/useApolloCoreClient');
vi.mock('@/object-record/hooks/useIncrementalFetchAndMutateRecords');
vi.mock('@/object-record/hooks/useRefetchAggregateQueries');
vi.mock('@/browser-event/utils/dispatchObjectRecordOperationBrowserEvent');
vi.mock(
  '@/navigation-menu-item/common/hooks/useRemoveNavigationMenuItemByTargetRecordId',
);
vi.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({ objectMetadataItems: [] }),
}));
vi.mock('@/object-record/hooks/useDeleteManyRecordsMutation', () => ({
  useDeleteManyRecordsMutation: () => ({ deleteManyRecordsMutation: {} }),
}));
vi.mock('@/object-record/cache/hooks/useGetRecordFromCache', () => ({
  useGetRecordFromCache: () => () => undefined,
}));
vi.mock('@/object-record/hooks/useObjectPermissions', () => ({
  useObjectPermissions: () => ({ objectPermissionsByObjectMetadataId: {} }),
}));
vi.mock('@/object-record/record-store/hooks/useUpsertRecordsInStore', () => ({
  useUpsertRecordsInStore: () => ({ upsertRecordsInStore: vi.fn() }),
}));
vi.mock(
  '@/apollo/optimistic-effect/utils/triggerUpdateRecordOptimisticEffectByBatch',
  () => ({
    triggerUpdateRecordOptimisticEffectByBatch: vi.fn(),
  }),
);

const mockUseObjectMetadataItem = vi.mocked(useObjectMetadataItem);
const mockUseApolloCoreClient = vi.mocked(useApolloCoreClient);
const mockUseIncrementalFetchAndMutateRecords = vi.mocked(
  useIncrementalFetchAndMutateRecords,
);
const mockUseRefetchAggregateQueries = vi.mocked(useRefetchAggregateQueries);
const mockDispatchObjectRecordOperationBrowserEvent = vi.mocked(
  dispatchObjectRecordOperationBrowserEvent,
);
const mockUseRemoveNavigationMenuItemByTargetRecordId = vi.mocked(
  useRemoveNavigationMenuItemByTargetRecordId,
);

const objectMetadataItem = getMockObjectMetadataItemOrThrow('company');

describe('useIncrementalDeleteManyRecords', () => {
  const mockIncrementalFetchAndMutate = vi.fn();
  const mockRemoveNavigationMenuItemsByTargetRecordIds = vi.fn();
  const mockRefetchAggregateQueries = vi.fn();
  const mockMutate = vi.fn();

  const renderDeleteHook = () =>
    renderHook(() =>
      useIncrementalDeleteManyRecords({
        objectNameSingular: 'company',
        delayInMsBetweenMutations: 0,
      }),
    );

  const deleteBatchOf = (recordIds: string[]) => ({
    recordIds,
    totalFetchedCount: recordIds.length,
    totalCount: recordIds.length,
    abortSignal: new AbortController().signal,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockUseObjectMetadataItem.mockReturnValue({ objectMetadataItem });

    mockMutate.mockResolvedValue({});
    mockUseApolloCoreClient.mockReturnValue({
      mutate: mockMutate,
      cache: {},
    } as unknown as ReturnType<typeof useApolloCoreClient>);

    mockUseIncrementalFetchAndMutateRecords.mockReturnValue({
      incrementalFetchAndMutate: mockIncrementalFetchAndMutate,
      progress: { displayType: 'number' },
      isProcessing: false,
      updateProgress: vi.fn(),
      cancel: vi.fn(),
    });

    mockRefetchAggregateQueries.mockResolvedValue(undefined);
    mockUseRefetchAggregateQueries.mockReturnValue({
      refetchAggregateQueries: mockRefetchAggregateQueries,
    });

    mockUseRemoveNavigationMenuItemByTargetRecordId.mockReturnValue({
      removeNavigationMenuItemsByTargetRecordIds:
        mockRemoveNavigationMenuItemsByTargetRecordIds,
    });
  });

  it('should report every deleted record when all batches succeed', async () => {
    mockIncrementalFetchAndMutate.mockImplementation(async (mutateBatch) => {
      await mutateBatch(deleteBatchOf(['record-1', 'record-2']));
      await mutateBatch(deleteBatchOf(['record-3']));
    });

    const { result } = renderDeleteHook();

    await expect(result.current.incrementalDeleteManyRecords()).resolves.toBe(
      3,
    );

    expect(mockDispatchObjectRecordOperationBrowserEvent).toHaveBeenCalledTimes(
      1,
    );
    expect(mockDispatchObjectRecordOperationBrowserEvent).toHaveBeenCalledWith({
      objectMetadataItem,
      operation: {
        type: 'delete-many',
        deletedRecordIds: ['record-1', 'record-2', 'record-3'],
      },
    });
    expect(
      mockRemoveNavigationMenuItemsByTargetRecordIds,
    ).toHaveBeenCalledTimes(1);
    expect(mockRemoveNavigationMenuItemsByTargetRecordIds).toHaveBeenCalledWith(
      ['record-1', 'record-2', 'record-3'],
    );
    expect(mockRefetchAggregateQueries).toHaveBeenCalledTimes(1);
    expect(mockRefetchAggregateQueries).toHaveBeenCalledWith({
      objectMetadataNamePlural: objectMetadataItem.namePlural,
    });
  });

  it('should report the records a failing run already deleted', async () => {
    mockIncrementalFetchAndMutate.mockImplementation(async (mutateBatch) => {
      await mutateBatch(deleteBatchOf(['record-1', 'record-2']));

      throw new Error('Deletion failed');
    });

    const { result } = renderDeleteHook();

    await expect(result.current.incrementalDeleteManyRecords()).rejects.toThrow(
      'Deletion failed',
    );

    expect(mockDispatchObjectRecordOperationBrowserEvent).toHaveBeenCalledTimes(
      1,
    );
    expect(mockDispatchObjectRecordOperationBrowserEvent).toHaveBeenCalledWith({
      objectMetadataItem,
      operation: {
        type: 'delete-many',
        deletedRecordIds: ['record-1', 'record-2'],
      },
    });
    expect(
      mockRemoveNavigationMenuItemsByTargetRecordIds,
    ).toHaveBeenCalledTimes(1);
    expect(mockRemoveNavigationMenuItemsByTargetRecordIds).toHaveBeenCalledWith(
      ['record-1', 'record-2'],
    );
    expect(mockRefetchAggregateQueries).toHaveBeenCalledTimes(1);
  });

  it('should not report a deletion when no record was deleted', async () => {
    mockIncrementalFetchAndMutate.mockRejectedValue(new Error('Fetch failed'));

    const { result } = renderDeleteHook();

    await expect(result.current.incrementalDeleteManyRecords()).rejects.toThrow(
      'Fetch failed',
    );

    expect(
      mockDispatchObjectRecordOperationBrowserEvent,
    ).not.toHaveBeenCalled();
    expect(
      mockRemoveNavigationMenuItemsByTargetRecordIds,
    ).not.toHaveBeenCalled();
  });

  it('should keep the deletion error when the aggregate refetch also fails', async () => {
    mockIncrementalFetchAndMutate.mockImplementation(async (mutateBatch) => {
      await mutateBatch(deleteBatchOf(['record-1']));

      throw new Error('Deletion failed');
    });
    mockRefetchAggregateQueries.mockRejectedValue(new Error('Refetch failed'));

    const { result } = renderDeleteHook();

    await expect(result.current.incrementalDeleteManyRecords()).rejects.toThrow(
      'Deletion failed',
    );

    expect(mockDispatchObjectRecordOperationBrowserEvent).toHaveBeenCalledTimes(
      1,
    );
  });

  it('should surface a failing aggregate refetch when the deletion succeeded', async () => {
    mockIncrementalFetchAndMutate.mockImplementation(async (mutateBatch) => {
      await mutateBatch(deleteBatchOf(['record-1']));
    });
    mockRefetchAggregateQueries.mockRejectedValue(new Error('Refetch failed'));

    const { result } = renderDeleteHook();

    await expect(result.current.incrementalDeleteManyRecords()).rejects.toThrow(
      'Refetch failed',
    );
  });
});
