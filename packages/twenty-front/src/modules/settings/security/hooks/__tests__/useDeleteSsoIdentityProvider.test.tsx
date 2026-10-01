import type * as ReactModule from '@apollo/client/react';
import { vi } from 'vite-plus/test';

/* @license Enterprise */

import { renderHook } from '@testing-library/react';

import { useDeleteSsoIdentityProvider } from '@/settings/security/hooks/useDeleteSsoIdentityProvider';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

const mutationDeleteSsoIdpCallSpy = vi.fn();

vi.mock('@apollo/client/react', async () => ({
  ...(await vi.importActual<typeof ReactModule>('@apollo/client/react')),
  useMutation: () => [mutationDeleteSsoIdpCallSpy],
}));

const Wrapper = getJestMetadataAndApolloMocksWrapper({
  apolloMocks: [],
});

describe('useDeleteSsoIdentityProvider', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delete SSO identity provider', async () => {
    const params = { identityProviderId: 'test' };
    renderHook(
      () => {
        const { deleteSsoIdentityProvider } = useDeleteSsoIdentityProvider();
        deleteSsoIdentityProvider(params);
      },
      { wrapper: Wrapper },
    );

    expect(mutationDeleteSsoIdpCallSpy).toHaveBeenCalledWith({
      onCompleted: expect.any(Function),
      variables: {
        input: params,
      },
    });
  });
});
