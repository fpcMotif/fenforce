import type * as ReactModule from '@apollo/client/react';
import { vi } from 'vite-plus/test';

import { useResendWorkspaceInvitation } from '@/workspace-invitation/hooks/useResendWorkspaceInvitation';
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

describe('useResendWorkspaceInvitation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('Resend Workspace Invitation', async () => {
    const params = { appTokenId: 'test' };
    renderHook(
      () => {
        const { resendInvitation } = useResendWorkspaceInvitation();
        resendInvitation(params);
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
