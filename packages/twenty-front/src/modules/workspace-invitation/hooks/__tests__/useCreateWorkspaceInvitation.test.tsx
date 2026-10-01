import type * as ReactModule from '@apollo/client/react';
import { vi } from 'vite-plus/test';

import { useCreateWorkspaceInvitation } from '@/workspace-invitation/hooks/useCreateWorkspaceInvitation';
import { renderHook } from '@testing-library/react';
import { GetWorkspaceInvitationsDocument } from '~/generated-metadata/graphql';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

const mutationCallSpy = vi.fn();

vi.mock('@apollo/client/react', async () => ({
  ...(await vi.importActual<typeof ReactModule>('@apollo/client/react')),
  useMutation: () => [mutationCallSpy],
}));

const Wrapper = getJestMetadataAndApolloMocksWrapper({
  apolloMocks: [],
});

describe('useCreateWorkspaceInvitation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('Send invitations with role', async () => {
    const params = { emails: ['test@test.com'], roleId: 'role-id' };
    renderHook(
      () => {
        const { sendInvitation } = useCreateWorkspaceInvitation();
        sendInvitation(params);
      },
      { wrapper: Wrapper },
    );

    expect(mutationCallSpy).toHaveBeenCalledWith({
      onError: expect.any(Function),
      refetchQueries: [GetWorkspaceInvitationsDocument],
      variables: params,
    });
  });

  it('Send invitations without role uses default', async () => {
    const params = { emails: ['test@test.com'] };
    renderHook(
      () => {
        const { sendInvitation } = useCreateWorkspaceInvitation();
        sendInvitation(params);
      },
      { wrapper: Wrapper },
    );

    expect(mutationCallSpy).toHaveBeenCalledWith({
      onError: expect.any(Function),
      refetchQueries: [GetWorkspaceInvitationsDocument],
      variables: params,
    });
  });
});
