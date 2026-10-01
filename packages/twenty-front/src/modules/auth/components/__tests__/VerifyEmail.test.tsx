import type * as ComponentsModule from 'twenty-ui/components';
import { vi } from 'vite-plus/test';

import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, waitFor } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { MemoryRouter } from 'react-router-dom';
import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { AppPath } from 'twenty-shared/types';
import { ThemeProvider } from 'twenty-ui/theme';

import { VerifyEmail } from '@/auth/components/VerifyEmail';
import { clientConfigApiStatusState } from '@/client-config/states/clientConfigApiStatusState';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { dynamicActivate } from '~/utils/i18n/dynamicActivate';

const navigateMock = vi.fn();
const verifyEmailAndGetWorkspaceAgnosticTokenMock = vi.fn();
const verifyEmailAndGetLoginTokenMock = vi.fn();
const verifyLoginTokenMock = vi.fn();
const redirectToWorkspaceDomainMock = vi.fn();

let isOnAWorkspaceValue = false;

vi.mock('@/auth/hooks/useAuth', () => ({
  useAuth: () => ({
    verifyEmailAndGetWorkspaceAgnosticToken:
      verifyEmailAndGetWorkspaceAgnosticTokenMock,
    verifyEmailAndGetLoginToken: verifyEmailAndGetLoginTokenMock,
  }),
}));

vi.mock('@/auth/hooks/useVerifyLogin', () => ({
  useVerifyLogin: () => ({ verifyLoginToken: verifyLoginTokenMock }),
}));

vi.mock('@/domain-manager/hooks/useIsCurrentLocationOnAWorkspace', () => ({
  useIsCurrentLocationOnAWorkspace: () => ({
    isOnAWorkspace: isOnAWorkspaceValue,
  }),
}));

vi.mock('@/domain-manager/hooks/useRedirectToWorkspaceDomain', () => ({
  useRedirectToWorkspaceDomain: () => ({
    redirectToWorkspaceDomain: redirectToWorkspaceDomainMock,
  }),
}));

vi.mock('~/hooks/useNavigateApp', () => ({
  useNavigateApp: () => navigateMock,
}));

const mockEnqueueToast = vi.fn();

vi.mock('twenty-ui/components', async () => ({
  ...(await vi.importActual<typeof ComponentsModule>('twenty-ui/components')),
  useToast: () => ({ enqueueToast: mockEnqueueToast }),
}));

// Rendered by VerifyEmail in the error state; isolate it from Apollo.
vi.mock(
  '@/auth/sign-in-up/hooks/useHandleResendEmailVerificationToken',
  () => ({
    useHandleResendEmailVerificationToken: () => ({
      handleResendEmailVerificationToken: () => () => {},
      loading: false,
    }),
  }),
);

dynamicActivate(SOURCE_LOCALE);

const VERIFY_EMAIL_URL =
  '/verify-email?email=user%40example.com&emailVerificationToken=valid-token';

const renderVerifyEmail = (initialEntry: string) =>
  render(
    <JotaiProvider store={jotaiStore}>
      <ThemeProvider colorScheme="light">
        <I18nProvider i18n={i18n}>
          <MemoryRouter initialEntries={[initialEntry]}>
            <VerifyEmail />
          </MemoryRouter>
        </I18nProvider>
      </ThemeProvider>
    </JotaiProvider>,
  );

describe('VerifyEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetJotaiStore();
    isOnAWorkspaceValue = false;
    // The verification effect is gated on the client config having loaded.
    jotaiStore.set(clientConfigApiStatusState.atom, {
      isLoadedOnce: true,
      isLoading: false,
      isErrored: false,
      isSaved: false,
    });
  });

  it('navigates to the SignInUp page after a successful workspace-agnostic verification on the central domain', async () => {
    verifyEmailAndGetWorkspaceAgnosticTokenMock.mockResolvedValue(undefined);

    renderVerifyEmail(VERIFY_EMAIL_URL);

    await waitFor(() => {
      expect(verifyEmailAndGetWorkspaceAgnosticTokenMock).toHaveBeenCalledWith(
        'valid-token',
        'user@example.com',
      );
    });

    // The workspace-agnostic flow only sets the next sign-in-up step, so the
    // effect must hand off to the SignInUp page for that step to render.
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(AppPath.SignInUp);
    });
    expect(mockEnqueueToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success' }),
    );
  });

  it('does not hand off to the SignInUp page when the verification fails', async () => {
    verifyEmailAndGetWorkspaceAgnosticTokenMock.mockRejectedValue(
      new Error('verification failed'),
    );

    renderVerifyEmail(VERIFY_EMAIL_URL);

    await waitFor(() => {
      expect(mockEnqueueToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'error' }),
      );
    });
    expect(navigateMock).not.toHaveBeenCalledWith(AppPath.SignInUp);
  });

  it('keeps the workspace-scoped verification path untouched when already on a workspace', async () => {
    isOnAWorkspaceValue = true;
    verifyEmailAndGetLoginTokenMock.mockResolvedValue({
      loginToken: { token: 'login-token' },
      workspaceUrls: { subdomainUrl: 'https://foo.twenty.com/' },
    });

    renderVerifyEmail(VERIFY_EMAIL_URL);

    await waitFor(() => {
      expect(verifyEmailAndGetLoginTokenMock).toHaveBeenCalledWith(
        'valid-token',
        'user@example.com',
      );
    });

    expect(verifyEmailAndGetWorkspaceAgnosticTokenMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalledWith(AppPath.SignInUp);
  });

  it('exchanges the login token without redirecting when already on the workspace origin', async () => {
    isOnAWorkspaceValue = true;
    verifyEmailAndGetLoginTokenMock.mockResolvedValue({
      loginToken: { token: 'login-token' },
      workspaceUrls: { subdomainUrl: `${window.location.origin}/` },
    });

    renderVerifyEmail(VERIFY_EMAIL_URL);

    await waitFor(() => {
      expect(verifyLoginTokenMock).toHaveBeenCalledWith('login-token');
    });
    expect(redirectToWorkspaceDomainMock).not.toHaveBeenCalled();
  });
});
