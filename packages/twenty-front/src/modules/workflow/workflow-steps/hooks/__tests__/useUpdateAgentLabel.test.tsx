import type * as ReactModule from '@apollo/client/react';
import { vi } from 'vite-plus/test';

import { renderHook } from '@testing-library/react';
import { useUpdateAgentLabel } from '@/workflow/workflow-steps/hooks/useUpdateAgentLabel';

const mockUpdateAgent = vi.fn();
const mockUseFindOneAgentQuery = vi.fn();

vi.mock('@apollo/client/react', async () => ({
  ...(await vi.importActual<typeof ReactModule>('@apollo/client/react')),
  useQuery: (...args: unknown[]) => mockUseFindOneAgentQuery(...args),
  useMutation: () => [mockUpdateAgent],
}));

describe('useUpdateAgentLabel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFindOneAgentQuery.mockReturnValue({
      data: undefined,
    });
  });

  it('should skip query when agentId is undefined', () => {
    renderHook(() => useUpdateAgentLabel(undefined));

    expect(mockUseFindOneAgentQuery).toHaveBeenCalledWith(expect.anything(), {
      variables: { id: '' },
      skip: true,
    });
  });

  it('should fetch agent when agentId is provided', () => {
    const mockAgent = {
      id: 'agent-123',
      label: 'Original Label',
    };

    mockUseFindOneAgentQuery.mockReturnValue({
      data: {
        findOneAgent: mockAgent,
      },
    });

    renderHook(() => useUpdateAgentLabel('agent-123'));

    expect(mockUseFindOneAgentQuery).toHaveBeenCalledWith(expect.anything(), {
      variables: { id: 'agent-123' },
      skip: false,
    });
  });

  it('should update agent label when agent is defined', async () => {
    const mockAgent = {
      id: 'agent-123',
      label: 'Original Label',
    };

    mockUseFindOneAgentQuery.mockReturnValue({
      data: {
        findOneAgent: mockAgent,
      },
    });

    mockUpdateAgent.mockResolvedValue({});

    const { result } = renderHook(() => useUpdateAgentLabel('agent-123'));

    await result.current.updateAgentLabel('New Label');

    expect(mockUpdateAgent).toHaveBeenCalledWith({
      variables: {
        input: {
          id: 'agent-123',
          label: 'New Label',
        },
      },
      refetchQueries: ['FindOneAgent'],
    });
  });

  it('should not update agent label when agent is undefined', async () => {
    mockUseFindOneAgentQuery.mockReturnValue({
      data: {
        findOneAgent: undefined,
      },
    });

    const { result } = renderHook(() => useUpdateAgentLabel('agent-123'));

    await result.current.updateAgentLabel('New Label');

    expect(mockUpdateAgent).not.toHaveBeenCalled();
  });
});
