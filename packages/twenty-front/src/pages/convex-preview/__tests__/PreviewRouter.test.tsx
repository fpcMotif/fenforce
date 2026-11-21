import { vi } from 'vite-plus/test';

import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConvexError } from 'convex/values';

import { PreviewRouter } from '~/pages/convex-preview/PreviewRouter';

const mockSignOut = vi.fn();
const mockSessionError = new ConvexError('UNAUTHENTICATED');
vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signOut: mockSignOut }),
}));
vi.mock('../CompaniesWorkspace', () => ({
  WorkspaceGate: ({ children }: { children: React.ReactNode }) => children,
  CompaniesPage: () => {
    throw mockSessionError;
  },
  CompanyDetailPage: () => null,
  CompanyTrashPage: () => null,
  WorkspaceAdministrationPage: () => null,
}));

it('clears protected cache and offers sign-out when the real router catches a session error', async () => {
  const errorLog = vi
    .spyOn(console, 'error')
    .mockImplementation(() => undefined);
  const warningLog = vi
    .spyOn(console, 'warn')
    .mockImplementation(() => undefined);
  const user = userEvent.setup();
  const queryClient = new QueryClient();
  queryClient.setQueryData(['company'], { name: 'Protected company' });
  const i18n = setupI18n({ locale: 'en', messages: { en: {} } });
  try {
    render(
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <PreviewRouter />
        </QueryClientProvider>
      </I18nProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session has ended',
    );
    await waitFor(() =>
      expect(queryClient.getQueryCache().getAll()).toHaveLength(0),
    );
    await user.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  } finally {
    errorLog.mockRestore();
    warningLog.mockRestore();
  }
});
