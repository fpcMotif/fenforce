import { vi } from 'vite-plus/test';

import { render, waitFor } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { AppPath } from 'twenty-shared/types';

import { VerifyLoginTokenEffect } from '@/auth/components/VerifyLoginTokenEffect';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';

const verifyLoginTokenMock = vi.fn();
const navigateMock = vi.fn();

vi.mock('@/auth/hooks/useVerifyLogin', () => ({
  useVerifyLogin: () => ({ verifyLoginToken: verifyLoginTokenMock }),
}));

vi.mock('~/hooks/useNavigateApp', () => ({
  useNavigateApp: () => navigateMock,
}));

const renderEffect = (initialEntry: string) =>
  render(
    <JotaiProvider store={jotaiStore}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <StrictMode>
          <VerifyLoginTokenEffect />
        </StrictMode>
      </MemoryRouter>
    </JotaiProvider>,
  );

describe('VerifyLoginTokenEffect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetJotaiStore();
  });

  it('verifies the login token at most once under StrictMode', async () => {
    renderEffect('/verify?loginToken=login-token');

    await waitFor(() => {
      expect(verifyLoginTokenMock).toHaveBeenCalledWith('login-token');
    });
    expect(verifyLoginTokenMock).toHaveBeenCalledTimes(1);
  });

  it('navigates to sign in up when no login token is present', async () => {
    renderEffect('/verify');

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(AppPath.SignInUp);
    });
    expect(verifyLoginTokenMock).not.toHaveBeenCalled();
  });
});
