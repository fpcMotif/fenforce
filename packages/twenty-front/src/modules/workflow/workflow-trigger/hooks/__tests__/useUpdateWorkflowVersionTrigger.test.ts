import type * as ComponentsModule from 'twenty-ui/components';
import { vi } from 'vite-plus/test';

import { type WorkflowTrigger } from '@/workflow/types/Workflow';
import { WorkflowVisualizerComponentInstanceContext } from '@/workflow/workflow-diagram/states/contexts/WorkflowVisualizerComponentInstanceContext';
import { useUpdateWorkflowVersionTrigger } from '@/workflow/workflow-trigger/hooks/useUpdateWorkflowVersionTrigger';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { TRIGGER_STEP_ID } from 'twenty-shared/workflow';

const mockMutate = vi.fn();
const mockGetUpdatableWorkflowVersion = vi.fn();
const mockGetRecordFromCache = vi.fn();
const mockMarkStepForRecomputation = vi.fn();

vi.mock('@/object-metadata/hooks/useApolloCoreClient', () => ({
  useApolloCoreClient: () => ({ cache: {} }),
}));

vi.mock('@/object-metadata/hooks/useObjectMetadataItems', () => ({
  useObjectMetadataItems: () => ({ objectMetadataItems: [] }),
}));

vi.mock('@/object-metadata/hooks/useObjectMetadataItem', () => ({
  useObjectMetadataItem: () => ({ objectMetadataItem: {} }),
}));

vi.mock('@/object-record/hooks/useObjectPermissions', () => ({
  useObjectPermissions: () => ({ objectPermissionsByObjectMetadataId: {} }),
}));

const mockEnqueueToast = vi.fn();

vi.mock('twenty-ui/components', async () => ({
  ...(await vi.importActual<typeof ComponentsModule>('twenty-ui/components')),
  useToast: () => ({ enqueueToast: mockEnqueueToast }),
}));

vi.mock('@/object-record/cache/hooks/useGetRecordFromCache', () => ({
  useGetRecordFromCache: () => mockGetRecordFromCache,
}));

vi.mock('@/object-record/cache/utils/updateRecordFromCache', () => ({
  updateRecordFromCache: vi.fn(),
}));

vi.mock('@/workflow/hooks/useGetUpdatableWorkflowVersionOrThrow', () => ({
  useGetUpdatableWorkflowVersionOrThrow: vi.fn(() => ({
    getUpdatableWorkflowVersion: mockGetUpdatableWorkflowVersion,
  })),
}));

vi.mock('@/workflow/workflow-variables/hooks/useStepsOutputSchema', () => ({
  useStepsOutputSchema: vi.fn(() => ({
    markStepForRecomputation: mockMarkStepForRecomputation,
  })),
}));

vi.mock('@apollo/client/react', () => ({
  useMutation: () => [mockMutate],
}));

const Wrapper = ({ children }: { children: ReactNode }) =>
  createElement(
    WorkflowVisualizerComponentInstanceContext.Provider,
    { value: { instanceId: 'workflow-visualizer-test' } },
    children,
  );

describe('useUpdateWorkflowVersionTrigger', () => {
  const trigger: WorkflowTrigger = {
    name: 'Company created',
    type: 'DATABASE_EVENT',
    settings: {
      eventName: 'company.created',
      outputSchema: {},
    },
    nextStepIds: ['step1'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate.mockResolvedValue({
      data: { updateWorkflowVersionTrigger: { trigger } },
    });
    mockGetRecordFromCache.mockReturnValue(undefined);
  });

  it('updates the trigger via the dedicated mutation and marks it for recomputation', async () => {
    mockGetUpdatableWorkflowVersion.mockResolvedValue('version-id');

    const { result } = renderHook(() => useUpdateWorkflowVersionTrigger(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.updateTrigger(trigger);
    });

    expect(mockGetUpdatableWorkflowVersion).toHaveBeenCalled();
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          input: {
            workflowVersionId: 'version-id',
            trigger,
          },
        },
      }),
    );
    expect(mockMarkStepForRecomputation).toHaveBeenCalledWith({
      stepId: TRIGGER_STEP_ID,
      workflowVersionId: 'version-id',
    });
  });

  it('marks for recomputation for all trigger types', async () => {
    const triggerTypes = ['DATABASE_EVENT', 'MANUAL', 'CRON', 'WEBHOOK'];

    for (const triggerType of triggerTypes) {
      mockMarkStepForRecomputation.mockClear();
      mockGetUpdatableWorkflowVersion.mockResolvedValue('version-id');

      const testTrigger = {
        name: `${triggerType} Trigger`,
        type: triggerType,
        settings: {
          outputSchema: {},
        },
        nextStepIds: [],
      } as unknown as WorkflowTrigger;

      const { result } = renderHook(() => useUpdateWorkflowVersionTrigger(), {
        wrapper: Wrapper,
      });

      await act(async () => {
        await result.current.updateTrigger(testTrigger);
      });

      expect(mockMarkStepForRecomputation).toHaveBeenCalledWith({
        stepId: TRIGGER_STEP_ID,
        workflowVersionId: 'version-id',
      });
    }
  });
});
