import type * as UseWorkflowWithCurrentVersionModule from '@/workflow/hooks/useWorkflowWithCurrentVersion';
import { vi } from 'vite-plus/test';

import { useGetUpdatableWorkflowVersionOrThrow } from '@/workflow/hooks/useGetUpdatableWorkflowVersionOrThrow';
import { type WorkflowWithCurrentVersion } from '@/workflow/types/Workflow';
import { renderHook } from '@testing-library/react';

const mockCreateDraftFromWorkflowVersion = vi.fn().mockResolvedValue('457');
const mockWorkflowId = '123';
const mockWorkflow = {
  id: mockWorkflowId,
  currentVersion: {
    id: '456',
    status: 'DRAFT',
  },
} as WorkflowWithCurrentVersion;

vi.mock('@/workflow/hooks/useCreateDraftFromWorkflowVersion', () => ({
  useCreateDraftFromWorkflowVersion: () => ({
    createDraftFromWorkflowVersion: mockCreateDraftFromWorkflowVersion,
  }),
}));

vi.mock('@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue', () => ({
  useAtomComponentStateValue: vi.fn(() => mockWorkflowId),
}));

vi.mock('@/workflow/hooks/useWorkflowWithCurrentVersion', () => ({
  useWorkflowWithCurrentVersion: vi.fn((workflowId) =>
    workflowId === mockWorkflowId ? mockWorkflow : undefined,
  ),
}));

describe('useGetUpdatableWorkflowVersionOrThrow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return draft version id when current version is draft', async () => {
    const { result } = renderHook(() =>
      useGetUpdatableWorkflowVersionOrThrow(),
    );
    const workflowVersionId =
      await result.current.getUpdatableWorkflowVersion();

    expect(mockCreateDraftFromWorkflowVersion).not.toHaveBeenCalled();
    expect(workflowVersionId).toEqual('456');
  });

  it('should create draft from active version when current version is active', async () => {
    const mockActiveWorkflow = {
      ...mockWorkflow,
      currentVersion: {
        ...mockWorkflow.currentVersion,
        status: 'ACTIVE',
      },
    } as WorkflowWithCurrentVersion;

    const { useWorkflowWithCurrentVersion } = await vi.importMock<
      typeof UseWorkflowWithCurrentVersionModule
    >('@/workflow/hooks/useWorkflowWithCurrentVersion');
    useWorkflowWithCurrentVersion.mockReturnValue(mockActiveWorkflow);

    const { result } = renderHook(() =>
      useGetUpdatableWorkflowVersionOrThrow(),
    );
    const workflowVersionId =
      await result.current.getUpdatableWorkflowVersion();

    expect(mockCreateDraftFromWorkflowVersion).toHaveBeenCalledWith({
      workflowId: mockWorkflowId,
      workflowVersionIdToCopy: '456',
    });
    expect(workflowVersionId).toEqual('457');
  });

  it('should throw an error when workflow is not found', async () => {
    const { useWorkflowWithCurrentVersion } = await vi.importMock<
      typeof UseWorkflowWithCurrentVersionModule
    >('@/workflow/hooks/useWorkflowWithCurrentVersion');
    useWorkflowWithCurrentVersion.mockReturnValue(undefined);

    const { result } = renderHook(() =>
      useGetUpdatableWorkflowVersionOrThrow(),
    );

    await expect(result.current.getUpdatableWorkflowVersion()).rejects.toThrow(
      'Failed to get updatable workflow version',
    );
  });
});
