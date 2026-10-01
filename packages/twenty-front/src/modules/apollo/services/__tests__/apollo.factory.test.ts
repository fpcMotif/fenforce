import { vi } from 'vite-plus/test';

import { gql, InMemoryCache } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';

import { ApolloFactory, type Options } from '@/apollo/services/apollo.factory';
import { clearSessionGeneration } from '@/auth/utils/clearSessionGeneration';
import { getSessionGeneration } from '@/auth/utils/getSessionGeneration';
import { rotateSessionGeneration } from '@/auth/utils/rotateSessionGeneration';
import { CUSTOM_WORKSPACE_APPLICATION_MOCK } from '@/object-metadata/hooks/__tests__/constants/CustomWorkspaceApplicationMock.test.constant';
import {
  AiModelTier,
  WorkspaceActivationStatus,
  WorkspaceDiscoverability,
} from '~/generated-metadata/graphql';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);
afterAll(() => vi.unstubAllGlobals());

vi.mock('~/utils/sleep', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

const UNAUTHENTICATED_RESPONSE = JSON.stringify({
  data: {},
  errors: [{ extensions: { code: 'UNAUTHENTICATED' } }],
});

const PERMISSION_DENIED_RESPONSE = JSON.stringify({
  data: { trackAnalytics: null },
  errors: [
    {
      message: 'Entity performing the request does not have permission',
      extensions: { code: 'FORBIDDEN' },
    },
  ],
});

const mockOnError = vi.fn();
const mockOnNetworkError = vi.fn();
const mockOnPayloadTooLarge = vi.fn();
const mockOnUnauthenticatedError = vi.fn();

const mockWorkspaceMember = {
  id: 'workspace-member-id',
  locale: 'en',
  name: {
    firstName: 'John',
    lastName: 'Doe',
  },
  colorScheme: 'Light' as const,
  userEmail: 'userEmail',
};

const mockWorkspace = {
  id: 'workspace-id',
  metadataVersion: 1,
  allowImpersonation: false,
  activationStatus: WorkspaceActivationStatus.ACTIVE,
  billingSubscriptions: [],
  billingEntitlements: [],
  currentBillingSubscription: null,
  workspaceMembersCount: 0,
  isPublicInviteLinkEnabled: false,
  workspaceDiscoverability: WorkspaceDiscoverability.PUBLIC,
  isGoogleAuthEnabled: false,
  isMicrosoftAuthEnabled: false,
  isPasswordAuthEnabled: false,
  isCustomDomainEnabled: false,
  isGoogleAuthBypassEnabled: false,
  isPasswordAuthBypassEnabled: false,
  isMicrosoftAuthBypassEnabled: false,
  hasActivatedAndValidEnterpriseKey: false,
  hasValidSignedEnterpriseKey: false,
  hasValidEnterpriseValidityToken: false,
  subdomain: 'test',
  customDomain: 'test.com',
  workspaceUrls: {
    subdomainUrl: 'test.com',
    customUrl: 'test.com',
  },
  isTwoFactorAuthenticationEnforced: false,
  trashRetentionDays: 14,
  eventLogRetentionDays: 365 * 3,
  aiChatModelTier: AiModelTier.fast,
  aiAgentModelTier: AiModelTier.fast,
  isAutoModelSelectionEnabled: true,
  aiModelIdByTier: {},
  isInternalMessagesImportEnabled: false,
  workspaceCustomApplication: CUSTOM_WORKSPACE_APPLICATION_MOCK,
  workspaceCustomApplicationId: CUSTOM_WORKSPACE_APPLICATION_MOCK.id,
  installedApplications: [],
};

const createMockOptions = (): Options => ({
  uri: 'http://localhost:3000',
  currentWorkspaceMember: mockWorkspaceMember,
  currentWorkspace: mockWorkspace,
  cache: new InMemoryCache(),
  isDebugMode: true,
  onError: mockOnError,
  onNetworkError: mockOnNetworkError,
  onPayloadTooLarge: mockOnPayloadTooLarge,
  onUnauthenticatedError: mockOnUnauthenticatedError,
  appVersion: '1.0.0',
});

const makeRequestWithContext = async (context?: Record<string, unknown>) => {
  const options = createMockOptions();
  const apolloFactory = new ApolloFactory(options);

  const client = apolloFactory.getClient();

  await client.mutate({
    context,
    mutation: gql`
      mutation TrackAnalytics(
        $type: AnalyticsType!
        $event: String
        $name: String
        $properties: JSON
      ) {
        trackAnalytics(
          type: $type
          event: $event
          name: $name
          properties: $properties
        ) {
          success
        }
      }
    `,
  });
};

const makeRequest = async () => makeRequestWithContext();

describe('ApolloFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    clearSessionGeneration();
  });

  it('should create an instance of ApolloFactory', () => {
    const options = createMockOptions();
    const apolloFactory = new ApolloFactory(options);
    expect(apolloFactory).toBeInstanceOf(ApolloFactory);
  });

  it('should initialize with the correct workspace member', () => {
    const options = createMockOptions();
    const apolloFactory = new ApolloFactory(options);
    expect(apolloFactory['currentWorkspaceMember']).toEqual(
      mockWorkspaceMember,
    );
  });

  it('should call onError when encountering "Unauthorized" error', async () => {
    const errors = [{ message: 'Unauthorized' }];
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: {},
            errors,
          }),
        ),
    );
    try {
      await makeRequest();
    } catch (error) {
      expect(error).toBeInstanceOf(CombinedGraphQLErrors);
      expect((error as CombinedGraphQLErrors).message).toBe('Unauthorized');
      expect(mockOnError).toHaveBeenCalledWith(errors);
    }
  }, 10000);

  it('should call onError when encountering "UNAUTHENTICATED" error', async () => {
    const errors = [
      {
        extensions: {
          code: 'UNAUTHENTICATED',
        },
      },
    ];
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: {},
            errors,
          }),
        ),
    );

    try {
      await makeRequest();
    } catch (error) {
      expect(error).toBeInstanceOf(CombinedGraphQLErrors);
      expect((error as CombinedGraphQLErrors).message).toBe(
        'Error message not found.',
      );
      expect(mockOnError).toHaveBeenCalledWith(errors);
    }
  }, 10000);

  it('should call onNetworkError when encountering a network error', async () => {
    const errors = [
      {
        message: 'Unknown error',
      },
    ];
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            data: {},
            errors,
          }),
        ),
    );

    try {
      await makeRequest();
    } catch (error) {
      expect(error).toBeInstanceOf(CombinedGraphQLErrors);
      expect((error as CombinedGraphQLErrors).message).toBe('Unknown error');
      expect(mockOnError).toHaveBeenCalledWith(errors);
    }
  }, 10000);

  it('should call onNetworkError when the request itself fails', async () => {
    fetchMock.mockRejectedValue({ message: 'Unknown error' });

    try {
      await makeRequest();
    } catch (error) {
      expect(error).toBeDefined();
      expect(mockOnNetworkError).toHaveBeenCalled();
    }
  }, 10000);

  it('should update workspace member when calling updateWorkspaceMember', () => {
    const options = createMockOptions();
    const apolloFactory = new ApolloFactory(options);

    const newWorkspaceMember = {
      id: 'new-workspace-member-id',
      locale: 'fr',
      name: {
        firstName: 'John',
        lastName: 'Doe',
      },
      colorScheme: 'Light' as const,
      userEmail: 'userEmail',
    };

    apolloFactory.updateWorkspaceMember(newWorkspaceMember);
    expect(apolloFactory['currentWorkspaceMember']).toEqual(newWorkspaceMember);
  });

  it('should call onPayloadTooLarge when encountering a 413 error', async () => {
    fetchMock.mockImplementation(
      async () => new Response('Payload Too Large', { status: 413 }),
    );

    try {
      await makeRequest();
    } catch {
      expect(mockOnPayloadTooLarge).toHaveBeenCalledWith(
        expect.stringContaining('Uploaded content is too large'),
      );
    }
  }, 10000);

  // fetch normalises header names, so assert case-insensitively rather than
  // depending on the casing the mock happens to expose.
  const readHeader = (
    headers: Record<string, string>,
    name: string,
  ): string | undefined =>
    Object.entries(headers).find(
      ([key]) => key.toLowerCase() === name.toLowerCase(),
    )?.[1];

  it('should not attach an Authorization header', async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ data: {} })),
    );

    await makeRequest();

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >;

    expect(readHeader(headers, 'authorization')).toBeUndefined();
    // Version-mismatch detection must keep working without one.
    expect(readHeader(headers, 'X-App-Version')).toBe('1.0.0');
  });

  // The session cookie is issued and refreshed server-side, so a rejection is
  // the end of the session rather than something the client can retry.
  it('should sign out on an unauthenticated response', async () => {
    fetchMock.mockImplementation(
      async () => new Response(UNAUTHENTICATED_RESPONSE),
    );
    mockOnUnauthenticatedError.mockImplementation(clearSessionGeneration);
    rotateSessionGeneration();

    expect(getSessionGeneration()).not.toBeNull();

    await expect(makeRequest()).rejects.toBeInstanceOf(CombinedGraphQLErrors);

    expect(mockOnUnauthenticatedError).toHaveBeenCalledTimes(1);
    expect(getSessionGeneration()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('should ignore an unauthenticated response from an older session', async () => {
    let markRequestStarted!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      markRequestStarted = resolve;
    });
    let releaseResponse!: (response: { body: string }) => void;
    const pendingResponse = new Promise<{ body: string }>((resolve) => {
      releaseResponse = resolve;
    });

    fetchMock.mockImplementation(async () => {
      markRequestStarted();
      const response = await pendingResponse;
      return new Response(response.body);
    });

    rotateSessionGeneration();
    const requestSessionGeneration = getSessionGeneration();
    const request = makeRequest();

    expect(requestSessionGeneration).not.toBeNull();

    await requestStarted;
    rotateSessionGeneration();

    expect(getSessionGeneration()).not.toBe(requestSessionGeneration);

    releaseResponse({ body: UNAUTHENTICATED_RESPONSE });

    await expect(request).rejects.toBeInstanceOf(CombinedGraphQLErrors);
    expect(mockOnUnauthenticatedError).not.toHaveBeenCalled();
  });

  it('should leave a permission denial alone', async () => {
    fetchMock.mockImplementation(
      async () => new Response(PERMISSION_DENIED_RESPONSE),
    );

    await expect(makeRequest()).rejects.toBeInstanceOf(CombinedGraphQLErrors);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mockOnUnauthenticatedError).not.toHaveBeenCalled();
  });
});
