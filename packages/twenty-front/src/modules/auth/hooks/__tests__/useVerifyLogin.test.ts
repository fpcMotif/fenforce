import type * as ComponentsModule from 'twenty-ui/components';
import { type Mock, vi } from 'vite-plus/test';

import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { renderHook } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';

import { useAuth } from '@/auth/hooks/useAuth';
import { useVerifyLogin } from '@/auth/hooks/useVerifyLogin';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import { AppPath } from 'twenty-shared/types';
import { useNavigateApp } from '~/hooks/useNavigateApp';

import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { dynamicActivate } from '~/utils/i18n/dynamicActivate';

vi.mock('../useAuth', () => ({
  useAuth: vi.fn(),
}));

const mockEnqueueToast = vi.fn();

vi.mock('twenty-ui/components', async () => ({
  ...(await vi.importActual<typeof ComponentsModule>('twenty-ui/components')),
  useToast: () => ({ enqueueToast: mockEnqueueToast }),
}));

vi.mock('~/hooks/useNavigateApp', () => ({
  useNavigateApp: vi.fn(),
}));

dynamicActivate(SOURCE_LOCALE);

const renderHooks = () => {
  const { result } = renderHook(() => useVerifyLogin(), {
    wrapper: ({ children }) =>
      JotaiProvider({
        store: jotaiStore,
        children: I18nProvider({ i18n, children }),
      }),
  });
  return { result };
};

describe('useVerifyLogin', () => {
  const mockGetAuthTokensFromLoginToken = vi.fn();

  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetJotaiStore();

    (useAuth as Mock).mockReturnValue({
      getAuthTokensFromLoginToken: mockGetAuthTokensFromLoginToken,
    });

    (useNavigateApp as Mock).mockReturnValue(mockNavigate);
  });

  it('should verify login token', async () => {
    const { result } = renderHooks();

    await result.current.verifyLoginToken('test-token');

    expect(mockGetAuthTokensFromLoginToken).toHaveBeenCalledWith('test-token');
  });

  it('should handle a non-GraphQL verification error', async () => {
    const error = new Error('Verification failed');
    mockGetAuthTokensFromLoginToken.mockRejectedValueOnce(error);

    const { result } = renderHooks();

    await result.current.verifyLoginToken('test-token');

    expect(mockEnqueueToast).toHaveBeenCalledWith({
      variant: 'error',
      children: 'Authentication failed',
    });
    expect(mockNavigate).toHaveBeenCalledWith(AppPath.SignInUp);
  });

  it('should display the user-friendly GraphQL verification message', async () => {
    const error = new CombinedGraphQLErrors({
      errors: [
        {
          message: 'Session could not be created',
          extensions: {
            userFriendlyMessage:
              'Your session has expired. Please sign in again.',
          },
        },
      ],
    });
    mockGetAuthTokensFromLoginToken.mockRejectedValueOnce(error);

    const { result } = renderHooks();

    await result.current.verifyLoginToken('test-token');

    expect(mockEnqueueToast).toHaveBeenCalledWith({
      variant: 'error',
      children: 'Your session has expired. Please sign in again.',
    });
    expect(mockNavigate).toHaveBeenCalledWith(AppPath.SignInUp);
  });
});
