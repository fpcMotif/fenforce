import { vi } from 'vite-plus/test';

import { renderHook } from '@testing-library/react';

import { useNotes } from '@/activities/notes/hooks/useNotes';
import { type ActivityTargetableObject } from '@/activities/types/ActivityTargetableEntity';

vi.mock('@/activities/hooks/useActivities', () => ({
  useActivities: vi.fn(() => ({
    activities: [{ id: '1', content: 'Example Note', __typename: 'Note' }],
    loading: false,
    fetchMoreActivities: vi.fn(),
  })),
}));

vi.mock('@/ui/utilities/state/jotai/hooks/useAtomState', () => ({
  useAtomState: vi.fn(() => {
    const mockCurrentNotesQueryVariables = {
      filter: {},
      orderBy: 'mockOrderBy',
    };
    return [mockCurrentNotesQueryVariables, vi.fn()];
  }),
}));

describe('useNotes', () => {
  it('should return notes, and loading as expected', () => {
    const mockTargetableObject: ActivityTargetableObject = {
      id: '1',
      targetObjectNameSingular: 'Example Target',
    };
    const { result } = renderHook(() => useNotes(mockTargetableObject));

    expect(result.current.notes).toEqual([
      { id: '1', content: 'Example Note', __typename: 'Note' },
    ]);
    expect(result.current.loading).toBe(false);
  });
});
