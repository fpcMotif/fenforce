import { vi } from 'vite-plus/test';

import { useAuth } from '@/auth/hooks/useAuth';

import { MockedProvider } from '@apollo/client/testing/react';
import { type ReactNode, act } from 'react';
import { MemoryRouter } from 'react-router-dom';

import {
  email,
  mocks,
  password,
  results,
  token,
} from '@/auth/hooks/__mocks__/useAuth';
import {
  type CurrentUser,
  currentUserState,
} from '@/auth/states/currentUserState';
import {
  type CurrentWorkspace,
  currentWorkspaceState,
} from '@/auth/states/currentWorkspaceState';
import { returnToPathState } from '@/auth/states/returnToPathState';
import { renderHook } from '@testing-library/react';
import { getDefaultStore } from 'jotai';
import { WorkspaceActivationStatus } from 'twenty-shared/workspace';
import { ToastProvider } from 'twenty-ui/components';

const redirectSpy = vi.fn();

vi.mock('@/domain-manager/hooks/useRedirect', () => ({
  useRedirect: vi.fn().mockImplementation(() => ({
    redirect: redirectSpy,
  })),
}));

vi.mock('@/domain-manager/hooks/useOrigin', () => ({
  useOrigin: vi.fn().mockImplementation(() => ({
    origin: 'http://localhost',
  })),
}));

vi.mock('@/captcha/hooks/useRequestFreshCaptchaToken', () => ({
  useRequestFreshCaptchaToken: vi.fn().mockImplementation(() => ({
    requestFreshCaptchaToken: vi.fn(),
  })),
}));

vi.mock('@/auth/sign-in-up/hooks/useSignUpInNewWorkspace', () => ({
  useSignUpInNewWorkspace: vi.fn().mockImplementation(() => ({
    createWorkspace: vi.fn(),
  })),
}));

vi.mock('@/domain-manager/hooks/useRedirectToWorkspaceDomain', () => ({
  useRedirectToWorkspaceDomain: vi.fn().mockImplementation(() => ({
    redirectToWorkspaceDomain: vi.fn(),
  })),
}));

vi.mock('@/domain-manager/hooks/useIsCurrentLocationOnAWorkspace', () => ({
  useIsCurrentLocationOnAWorkspace: vi.fn().mockImplementation(() => ({
    isOnAWorkspace: true,
  })),
}));

vi.mock('@/domain-manager/hooks/useLastAuthenticatedWorkspaceDomain', () => ({
  useLastAuthenticatedWorkspaceDomain: vi.fn().mockImplementation(() => ({
    setLastAuthenticateWorkspaceDomain: vi.fn(),
  })),
}));

const Wrapper = ({ children }: { children: ReactNode }) => (
  <MockedProvider mocks={Object.values(mocks)}>
    <MemoryRouter>
      <ToastProvider>{children}</ToastProvider>
    </MemoryRouter>
  </MockedProvider>
);

const renderHooks = () => {
  const { result } = renderHook(
    () => {
      return useAuth();
    },
    {
      wrapper: Wrapper,
    },
  );
  return { result };
};

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDefaultStore().set(returnToPathState.atom, '');
  });

  it('should return login token object', async () => {
    const { result } = renderHooks();

    await act(async () => {
      expect(
        await result.current.getLoginTokenFromCredentials(email, password),
      ).toStrictEqual(results.getLoginTokenFromCredentials);
    });

    expect(mocks.getLoginTokenFromCredentials.result).toHaveBeenCalled();
  });

  it('should verify user', async () => {
    const { result } = renderHooks();

    await act(async () => {
      await result.current.getAuthTokensFromLoginToken(token);
    });

    expect(mocks.getAuthTokensFromLoginToken.result).toHaveBeenCalled();
    expect(mocks.getCurrentUser.result).toHaveBeenCalled();
  });

  it('should handle credential sign-in', async () => {
    const { result } = renderHooks();

    await act(async () => {
      await result.current.signInWithCredentialsInWorkspace(email, password);
    });

    expect(mocks.getLoginTokenFromCredentials.result).toHaveBeenCalled();
    expect(mocks.getAuthTokensFromLoginToken.result).toHaveBeenCalled();
  });

  it('should handle google sign-in', async () => {
    const { result } = renderHooks();

    await act(async () => {
      await result.current.signInWithGoogle({
        workspaceInviteHash: 'workspaceInviteHash',
        action: 'join-workspace',
      });
    });

    expect(redirectSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '/auth/google?workspaceInviteHash=workspaceInviteHash',
      ),
    );
  });

  it('should forward returnToPath to /auth/google when set in state', async () => {
    getDefaultStore().set(
      returnToPathState.atom,
      '/authorize?response_type=code&client_id=abc&state=xyz',
    );

    const { result } = renderHooks();

    await act(async () => {
      await result.current.signInWithGoogle({
        action: 'list-available-workspaces',
      });
    });

    const calledWithUrl = redirectSpy.mock.calls[0]?.[0] as string;
    const parsed = new URL(calledWithUrl);

    expect(parsed.pathname).toBe('/auth/google');
    expect(parsed.searchParams.get('action')).toBe('list-available-workspaces');
    expect(parsed.searchParams.get('returnToPath')).toBe(
      '/authorize?response_type=code&client_id=abc&state=xyz',
    );
  });

  it('should not forward an invalid (protocol-relative) returnToPath', async () => {
    getDefaultStore().set(returnToPathState.atom, '//evil.example.com');

    const { result } = renderHooks();

    await act(async () => {
      await result.current.signInWithGoogle({
        action: 'list-available-workspaces',
      });
    });

    const calledWithUrl = redirectSpy.mock.calls[0]?.[0] as string;
    const parsed = new URL(calledWithUrl);

    expect(parsed.searchParams.has('returnToPath')).toBe(false);
  });

  it('should handle sign-out', async () => {
    sessionStorage.setItem('lingering-key', 'should-be-cleared');
    getDefaultStore().set(currentWorkspaceState.atom, {
      id: 'workspace-id',
      activationStatus: WorkspaceActivationStatus.SUSPENDED,
    } as CurrentWorkspace);
    getDefaultStore().set(currentUserState.atom, {
      id: 'user-id',
    } as CurrentUser);

    const { result } = renderHooks();

    await act(async () => {
      result.current.signOut();
    });

    expect(sessionStorage.length).toBe(0);
    expect(getDefaultStore().get(currentWorkspaceState.atom)).toBeNull();
    expect(getDefaultStore().get(currentUserState.atom)).toBeNull();
  });

  it('should handle credential sign-up', async () => {
    const { result } = renderHooks();

    await act(async () => {
      await result.current.signUpWithCredentialsInWorkspace({
        email,
        password,
      });
    });

    expect(mocks.signUpInWorkspace.result).toHaveBeenCalled();
  });
});
