import { vi } from 'vite-plus/test';

import React from 'react';

import { useDeleteStep } from '@/workflow/workflow-steps/hooks/useDeleteStep';
import { renderHook } from '@testing-library/react';
import { WorkflowVisualizerComponentInstanceContext } from '@/workflow/workflow-diagram/states/contexts/WorkflowVisualizerComponentInstanceContext';

const mockDeleteWorkflowVersionStep = vi.fn();
const mockGetUpdatableWorkflowVersion = vi.fn();
const mockDeleteStepsOutputSchema = vi.fn();
const mockCloseSidePanel = vi.fn();

vi.mock('@/workflow/workflow-steps/hooks/useDeleteWorkflowVersionStep', () => ({
  useDeleteWorkflowVersionStep: () => ({
    deleteWorkflowVersionStep: mockDeleteWorkflowVersionStep,
  }),
}));

vi.mock('@/workflow/hooks/useGetUpdatableWorkflowVersionOrThrow', () => ({
  useGetUpdatableWorkflowVersionOrThrow: () => ({
    getUpdatableWorkflowVersion: mockGetUpdatableWorkflowVersion,
  }),
}));

vi.mock('@/workflow/workflow-variables/hooks/useStepsOutputSchema', () => ({
  useStepsOutputSchema: () => ({
    deleteStepsOutputSchema: mockDeleteStepsOutputSchema,
  }),
}));

vi.mock('@/side-panel/hooks/useSidePanelMenu', () => ({
  useSidePanelMenu: () => ({
    closeSidePanelMenu: mockCloseSidePanel,
  }),
}));

vi.mock('@/workflow/hooks/useWorkflowWithCurrentVersion', () => ({
  useWorkflowWithCurrentVersion: () => undefined,
}));

vi.mock(
  '@/workflow/workflow-steps/workflow-actions/ai-agent-action/hooks/useResetWorkflowAiAgentPermissionsStateOnSidePanelClose',
  () => ({
    useResetWorkflowAiAgentPermissionsStateOnSidePanelClose: () => ({
      resetPermissionState: vi.fn(),
    }),
  }),
);

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const workflowVisualizerComponentInstanceId =
    'workflow-visualizer-instance-id';

  return (
    <WorkflowVisualizerComponentInstanceContext.Provider
      value={{
        instanceId: workflowVisualizerComponentInstanceId,
      }}
    >
      {children}
    </WorkflowVisualizerComponentInstanceContext.Provider>
  );
};

describe('useDeleteStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete step and clean up dependencies', async () => {
    const mockWorkflowVersionId = 'version-123';
    const mockStepId = 'step-1';

    mockGetUpdatableWorkflowVersion.mockResolvedValue(mockWorkflowVersionId);
    mockDeleteWorkflowVersionStep.mockResolvedValue({
      deletedStepIds: {
        stepsDiff: [
          {
            type: 'DELETE',
            path: ['steps', 0],
            value: mockStepId,
          },
        ],
      },
    });

    const { result } = renderHook(() => useDeleteStep(), {
      wrapper,
    });
    await result.current.deleteStep(mockStepId);

    expect(mockGetUpdatableWorkflowVersion).toHaveBeenCalled();
    expect(mockDeleteWorkflowVersionStep).toHaveBeenCalledWith({
      workflowVersionId: mockWorkflowVersionId,
      stepId: mockStepId,
    });
    expect(mockCloseSidePanel).toHaveBeenCalled();
    expect(mockDeleteStepsOutputSchema).toHaveBeenCalledWith({
      stepIds: [mockStepId],
      workflowVersionId: mockWorkflowVersionId,
    });
  });
});
