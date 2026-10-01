import { type Mock, vi } from 'vite-plus/test';

import { useApolloCoreClient } from '@/object-metadata/hooks/useApolloCoreClient';
import { useRefetchAggregateQueries } from '@/object-record/hooks/useRefetchAggregateQueries';
import { getGroupByAggregateQueryName } from '@/object-record/record-aggregate/utils/getGroupByAggregateQueryName';
import { getAggregateQueryName } from '@/object-record/utils/getAggregateQueryName';
import { renderHook } from '@testing-library/react';

vi.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: vi.fn(),
}));

describe('useRefetchAggregateQueries', () => {
  const mockRefetchQueries = vi.fn();
  const mockApolloClient = {
    refetchQueries: mockRefetchQueries,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useApolloCoreClient as Mock).mockReturnValue(mockApolloClient);
  });

  it('should refetch queries', async () => {
    const objectMetadataNamePlural = 'opportunities';
    const expectedQueryName = getAggregateQueryName(objectMetadataNamePlural);
    const expectedQueryNameGroupBy = getGroupByAggregateQueryName({
      objectMetadataNamePlural,
    });

    const { result } = renderHook(() => useRefetchAggregateQueries());
    await result.current.refetchAggregateQueries({ objectMetadataNamePlural });

    expect(mockRefetchQueries).toHaveBeenCalledTimes(1);
    expect(mockRefetchQueries).toHaveBeenCalledWith({
      include: [expectedQueryName, expectedQueryNameGroupBy],
    });
  });

  it('should handle errors during refetch', async () => {
    const error = new Error('Refetch failed');
    mockRefetchQueries.mockRejectedValue(error);
    const objectMetadataNamePlural = 'opportunities';

    const { result } = renderHook(() => useRefetchAggregateQueries());

    await expect(
      result.current.refetchAggregateQueries({ objectMetadataNamePlural }),
    ).rejects.toThrow('Refetch failed');
  });
});
