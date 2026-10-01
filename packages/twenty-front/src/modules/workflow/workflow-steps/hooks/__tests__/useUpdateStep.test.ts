import { vi } from 'vite-plus/test';

import { useUpdateStep } from '@/workflow/workflow-steps/hooks/useUpdateStep';
import { act, renderHook } from '@testing-library/react';

const mockUpdateWorkflowVersionStep = vi.fn();
const mockGetUpdatableWorkflowVersion = vi.fn();

vi.mock('@/workflow/workflow-steps/hooks/useUpdateWorkflowVersionStep', () => ({
  useUpdateWorkflowVersionStep: () => ({
    updateWorkflowVersionStep: mockUpdateWorkflowVersionStep,
  }),
}));

vi.mock('@/workflow/hooks/useGetUpdatableWorkflowVersionOrThrow', () => ({
  useGetUpdatableWorkflowVersionOrThrow: () => ({
    getUpdatableWorkflowVersion: mockGetUpdatableWorkflowVersion,
  }),
}));

describe('useUpdateStep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update step in workflow version', async () => {
    const mockWorkflowVersionId = 'version-123';
    const mockStep = {
      id: '1',
      name: 'name',
      valid: true,
      type: 'CODE' as const,
      settings: {
        input: {
          logicFunctionId: 'id',
          logicFunctionInput: {},
        },
        outputSchema: {},
        errorHandlingOptions: {
          retryOnFailure: {
            value: 3,
          },
          continueOnFailure: {
            value: true,
          },
        },
      },
    };

    mockGetUpdatableWorkflowVersion.mockResolvedValue(mockWorkflowVersionId);

    const { result } = renderHook(() => useUpdateStep());
    await act(async () => {
      await result.current.updateStep(mockStep);
    });

    expect(mockGetUpdatableWorkflowVersion).toHaveBeenCalled();
    expect(mockUpdateWorkflowVersionStep).toHaveBeenCalledWith({
      workflowVersionId: mockWorkflowVersionId,
      step: mockStep,
    });
  });
});
