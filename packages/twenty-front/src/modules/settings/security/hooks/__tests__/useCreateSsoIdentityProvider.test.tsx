import type * as ReactModule from '@apollo/client/react';
import { vi } from 'vite-plus/test';

/* @license Enterprise */

import { renderHook } from '@testing-library/react';

import { useCreateSsoIdentityProvider } from '@/settings/security/hooks/useCreateSsoIdentityProvider';
import {
  CreateOidcIdentityProviderDocument,
  CreateSamlIdentityProviderDocument,
} from '~/generated-metadata/graphql';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

const mutationOidcCallSpy = vi.fn();
const mutationSamlCallSpy = vi.fn();

vi.mock('@apollo/client/react', async () => ({
  ...(await vi.importActual<typeof ReactModule>('@apollo/client/react')),
  useMutation: (document: unknown) => {
    if (document === CreateOidcIdentityProviderDocument) {
      return [mutationOidcCallSpy];
    }
    if (document === CreateSamlIdentityProviderDocument) {
      return [mutationSamlCallSpy];
    }
    return [vi.fn()];
  },
}));

const Wrapper = getJestMetadataAndApolloMocksWrapper({
  apolloMocks: [],
});

describe('useCreateSsoIdentityProvider', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('create OIDC sso identity provider', async () => {
    const OidcParams = {
      type: 'OIDC' as const,
      name: 'test',
      clientID: 'test',
      clientSecret: 'test',
      issuer: 'test',
    };
    renderHook(
      () => {
        const { createSsoIdentityProvider } = useCreateSsoIdentityProvider();
        createSsoIdentityProvider(OidcParams);
      },
      { wrapper: Wrapper },
    );

    // oxlint-disable-next-line unused-imports/no-unused-vars
    const { type, ...input } = OidcParams;
    expect(mutationOidcCallSpy).toHaveBeenCalledWith({
      onCompleted: expect.any(Function),
      variables: {
        input,
      },
    });
  });
  it('create SAML sso identity provider', async () => {
    const SamlParams = {
      type: 'SAML' as const,
      name: 'test',
      metadata: 'test',
      certificate: 'test',
      id: 'test',
      issuer: 'test',
      ssoURL: 'test',
    };
    renderHook(
      () => {
        const { createSsoIdentityProvider } = useCreateSsoIdentityProvider();
        createSsoIdentityProvider(SamlParams);
      },
      { wrapper: Wrapper },
    );

    // oxlint-disable-next-line unused-imports/no-unused-vars
    const { type, ...input } = SamlParams;
    expect(mutationOidcCallSpy).not.toHaveBeenCalled();
    expect(mutationSamlCallSpy).toHaveBeenCalledWith({
      onCompleted: expect.any(Function),
      variables: {
        input,
      },
    });
  });
  it('throw error if provider is not SAML or OIDC', async () => {
    const OTHERParams = {
      type: 'OTHER' as const,
    };
    const { result } = renderHook(() => useCreateSsoIdentityProvider(), {
      wrapper: Wrapper,
    });

    await expect(
      // @ts-expect-error - It's expected to throw an error
      result.current.createSsoIdentityProvider(OTHERParams),
    ).rejects.toThrow('Invalid IdpType');
  });
});
