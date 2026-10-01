import { vi } from 'vite-plus/test';

import { render } from '@testing-library/react';

import { RecordIndexLoadBaseOnContextStoreEffect } from '@/object-record/record-index/components/RecordIndexLoadBaseOnContextStoreEffect';

vi.mock('@/object-record/record-index/hooks/useLoadRecordIndexStates', () => ({
  useLoadRecordIndexStates: vi.fn(),
}));
vi.mock('@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue', () => ({
  useAtomComponentStateValue: vi.fn(),
}));
vi.mock('@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue', () => ({
  useAtomFamilySelectorValue: vi.fn(),
}));
vi.mock(
  '@/context-store/hooks/useContextStoreObjectMetadataItemOrThrow',
  () => ({
    useContextStoreObjectMetadataItemOrThrow: vi.fn(),
  }),
);

const useLoadRecordIndexStatesMock = (
  await vi.importMock<{ useLoadRecordIndexStates: ReturnType<typeof vi.fn> }>(
    '@/object-record/record-index/hooks/useLoadRecordIndexStates',
  )
).useLoadRecordIndexStates;
const useAtomComponentStateValueMock = (
  await vi.importMock<{ useAtomComponentStateValue: ReturnType<typeof vi.fn> }>(
    '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue',
  )
).useAtomComponentStateValue;
const useAtomFamilySelectorValueMock = (
  await vi.importMock<{ useAtomFamilySelectorValue: ReturnType<typeof vi.fn> }>(
    '@/ui/utilities/state/jotai/hooks/useAtomFamilySelectorValue',
  )
).useAtomFamilySelectorValue;
const useContextStoreObjectMetadataItemOrThrowMock = (
  await vi.importMock<{
    useContextStoreObjectMetadataItemOrThrow: ReturnType<typeof vi.fn>;
  }>('@/context-store/hooks/useContextStoreObjectMetadataItemOrThrow')
).useContextStoreObjectMetadataItemOrThrow;

describe('RecordIndexLoadBaseOnContextStoreEffect', () => {
  const loadRecordIndexStates = vi.fn();
  const view = { id: 'view-id' };
  const objectMetadataItem = { id: 'object-metadata-id' };

  beforeEach(() => {
    vi.clearAllMocks();
    useLoadRecordIndexStatesMock.mockReturnValue({ loadRecordIndexStates });
    useAtomComponentStateValueMock.mockReturnValue('view-id');
    useAtomFamilySelectorValueMock.mockReturnValue(view);
    useContextStoreObjectMetadataItemOrThrowMock.mockReturnValue({
      objectMetadataItem,
    });
  });

  it('does not reload an unchanged view', () => {
    const { rerender } = render(<RecordIndexLoadBaseOnContextStoreEffect />);

    expect(loadRecordIndexStates).toHaveBeenCalledTimes(1);
    expect(loadRecordIndexStates).toHaveBeenLastCalledWith(
      view,
      objectMetadataItem,
    );

    rerender(<RecordIndexLoadBaseOnContextStoreEffect />);

    expect(loadRecordIndexStates).toHaveBeenCalledTimes(1);
  });

  it('reloads the persisted view state when the view groups change', () => {
    const viewWithGroups = {
      id: 'view-id',
      viewGroups: [{ id: 'group-1' }],
    };
    useAtomFamilySelectorValueMock.mockReturnValue(viewWithGroups);

    const { rerender } = render(<RecordIndexLoadBaseOnContextStoreEffect />);

    expect(loadRecordIndexStates).toHaveBeenCalledTimes(1);

    rerender(<RecordIndexLoadBaseOnContextStoreEffect />);

    expect(loadRecordIndexStates).toHaveBeenCalledTimes(1);

    useAtomFamilySelectorValueMock.mockReturnValue({
      ...viewWithGroups,
      viewGroups: [...viewWithGroups.viewGroups, { id: 'group-2' }],
    });
    rerender(<RecordIndexLoadBaseOnContextStoreEffect />);

    expect(loadRecordIndexStates).toHaveBeenCalledTimes(2);
  });

  it('does not reload when the view groups are only reordered', () => {
    useAtomFamilySelectorValueMock.mockReturnValue({
      id: 'view-id',
      viewGroups: [{ id: 'group-1' }, { id: 'group-2' }],
    });

    const { rerender } = render(<RecordIndexLoadBaseOnContextStoreEffect />);

    expect(loadRecordIndexStates).toHaveBeenCalledTimes(1);

    useAtomFamilySelectorValueMock.mockReturnValue({
      id: 'view-id',
      viewGroups: [{ id: 'group-2' }, { id: 'group-1' }],
    });
    rerender(<RecordIndexLoadBaseOnContextStoreEffect />);

    expect(loadRecordIndexStates).toHaveBeenCalledTimes(1);
  });
});
