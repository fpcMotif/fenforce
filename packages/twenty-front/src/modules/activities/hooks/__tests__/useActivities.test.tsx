import { vi } from 'vite-plus/test';

import { renderHook } from '@testing-library/react';
import { useActivities } from '@/activities/hooks/useActivities';
import { type Task } from '@/activities/types/Task';
import { CoreObjectNameSingular } from 'twenty-shared/types';

vi.mock('@/activities/hooks/useActivityTargetsForTargetableObjects', () => ({
  useActivityTargetsForTargetableObjects: vi.fn(),
}));

vi.mock('@/object-record/hooks/useFindManyRecords', () => ({
  useFindManyRecords: vi.fn(),
}));

const mockActivityTarget = {
  __typename: 'TaskTarget',
  updatedAt: '2021-08-03T19:20:06.000Z',
  createdAt: '2021-08-03T19:20:06.000Z',
  personId: '1',
  companyId: '1',
  id: '123',
};

const mockActivity = {
  __typename: 'Task',
  updatedAt: '2021-08-03T19:20:06.000Z',
  createdAt: '2021-08-03T19:20:06.000Z',
  status: 'DONE',
  title: 'title',
  dueAt: '2021-08-03T19:20:06.000Z',
  assigneeId: '1',
  id: '234',
  bodyV2: {
    blocknote: 'My Body',
    markdown: 'My Body',
  },
  assignee: null,
} satisfies Task;

describe('useActivities', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('fetches activities', async () => {
    const useActivityTargetsForTargetableObjectsMock = await vi.importMock<{
      useActivityTargetsForTargetableObjects: ReturnType<typeof vi.fn>;
    }>('@/activities/hooks/useActivityTargetsForTargetableObjects');
    useActivityTargetsForTargetableObjectsMock.useActivityTargetsForTargetableObjects.mockReturnValue(
      {
        activityTargets: [{ ...mockActivityTarget, task: mockActivity }],
        loadingActivityTargets: false,
        activityRelationFieldName: 'task',
      },
    );

    const { result } = renderHook(() => {
      const activities = useActivities({
        objectNameSingular: CoreObjectNameSingular.Task,
        targetableObjects: [{ targetObjectNameSingular: 'company', id: '123' }],
        skip: false,
        limit: 10,
        activityTargetsOrderByVariables: [{}],
      });
      return activities;
    });

    expect(result.current.activities).toEqual([mockActivity]);
  });
});
