import { vi } from 'vite-plus/test';

import { type NavigationMenuItem } from '~/generated-metadata/graphql';
import { NavigationMenuItemType } from 'twenty-shared/types';
import { useObjectRecordSearchRecords } from '@/object-record/hooks/useObjectRecordSearchRecords';
import { act, renderHook } from '@testing-library/react';
import { useNavigationMenuItemSearchRecords } from '@/navigation-menu-item/edit/hooks/useNavigationMenuItemSearchRecords';

vi.mock('@/side-panel/hooks/useSearchableObjectNameSingulars', () => ({
  useSearchableObjectNameSingulars: () => ['person'],
}));
vi.mock('@/object-record/hooks/useObjectRecordSearchRecords', () => ({
  useObjectRecordSearchRecords: vi.fn(() => ({
    loading: false,
    searchRecords: [],
  })),
}));

describe('navigation record search empty state', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(useObjectRecordSearchRecords).mockReturnValue({
      loading: false,
      searchRecords: [],
      error: undefined,
    });
  });
  afterEach(() => vi.useRealTimers());

  it('keeps loading between quick empty responses until the current search settles', () => {
    const { result, rerender } = renderHook(
      ({ searchInput }) =>
        useNavigationMenuItemSearchRecords({ searchInput, currentItems: [] }),
      { initialProps: { searchInput: '' } },
    );

    rerender({ searchInput: 'goo' });
    expect(result.current.recordSearchLoading).toBe(true);
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.recordSearchLoading).toBe(true);

    act(() => vi.advanceTimersByTime(100));
    rerender({ searchInput: 'goog' });
    expect(result.current.recordSearchLoading).toBe(true);
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.recordSearchLoading).toBe(true);
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.recordSearchLoading).toBe(false);
    expect(result.current.navigationMenuItemSearchRecords).toEqual([]);
  });
});

describe('navigation record search duplicates', () => {
  it('keeps an existing record visible and only marks it unavailable in its section', () => {
    const record = {
      recordId: 'ivan',
      objectNameSingular: 'person',
      label: 'Ivan Zhao',
      imageUrl: null,
    };
    vi.mocked(useObjectRecordSearchRecords).mockReturnValue({
      loading: false,
      searchRecords: [
        { ...record, objectLabelSingular: 'Person', tsRankCD: 1, tsRank: 1 },
      ],
      error: undefined,
    });
    const existingItem: NavigationMenuItem = {
      id: 'navigation-ivan',
      type: NavigationMenuItemType.RECORD,
      targetRecordId: record.recordId,
      folderId: 'folder',
      position: 0,
      createdAt: '',
      updatedAt: '',
    };
    const { result, rerender } = renderHook(
      ({ currentItems }: { currentItems: NavigationMenuItem[] }) =>
        useNavigationMenuItemSearchRecords({
          searchInput: 'Ivan',
          currentItems,
        }),
      { initialProps: { currentItems: [existingItem] } },
    );
    expect(result.current.navigationMenuItemSearchRecords).toEqual([
      { ...record, isAlreadyInSidebar: true },
    ]);

    rerender({ currentItems: [] });
    expect(result.current.navigationMenuItemSearchRecords).toEqual([
      { ...record, isAlreadyInSidebar: false },
    ]);
  });
});
