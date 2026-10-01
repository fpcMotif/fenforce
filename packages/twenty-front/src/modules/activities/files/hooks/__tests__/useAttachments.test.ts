import { vi } from 'vite-plus/test';

import { renderHook } from '@testing-library/react';

import { useAttachments } from '@/activities/files/hooks/useAttachments';

vi.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: vi.fn(),
}));
vi.mock('@/workspace/hooks/useIsFeatureEnabled', () => ({
  useIsFeatureEnabled: vi.fn(),
}));

describe('useAttachments', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches attachments correctly for a given targetableObject', async () => {
    const mockAttachments = [
      { id: '1', name: 'Attachment 1' },
      { id: 2, name: 'Attachment 2' },
    ];
    const mockTargetableObject = {
      id: '1',
      targetObjectNameSingular: 'SomeObject',
    };

    const useFindManyRecordsMock = await vi.importMock<{
      useFindManyRecords: ReturnType<typeof vi.fn>;
    }>('@/object-record/hooks/useFindManyRecords');
    const useIsFeatureEnabledMock = await vi.importMock<{
      useIsFeatureEnabled: ReturnType<typeof vi.fn>;
    }>('@/workspace/hooks/useIsFeatureEnabled');
    useFindManyRecordsMock.useFindManyRecords.mockReturnValue({
      records: mockAttachments,
    });
    useIsFeatureEnabledMock.useIsFeatureEnabled.mockReturnValue(false);

    const { result } = renderHook(() => useAttachments(mockTargetableObject));

    expect(result.current.attachments).toEqual(mockAttachments);
  });

  it('handles case when there are no attachments', async () => {
    const mockTargetableObject = {
      id: '1',
      targetObjectNameSingular: 'SomeObject',
    };

    const useFindManyRecordsMock = await vi.importMock<{
      useFindManyRecords: ReturnType<typeof vi.fn>;
    }>('@/object-record/hooks/useFindManyRecords');
    const useIsFeatureEnabledMock = await vi.importMock<{
      useIsFeatureEnabled: ReturnType<typeof vi.fn>;
    }>('@/workspace/hooks/useIsFeatureEnabled');
    useFindManyRecordsMock.useFindManyRecords.mockReturnValue({ records: [] });
    useIsFeatureEnabledMock.useIsFeatureEnabled.mockReturnValue(false);

    const { result } = renderHook(() => useAttachments(mockTargetableObject));

    expect(result.current.attachments).toEqual([]);
  });
});
