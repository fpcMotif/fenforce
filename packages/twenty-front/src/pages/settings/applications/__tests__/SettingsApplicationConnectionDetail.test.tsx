import type * as ReactModule from '@apollo/client/react';
import { type MockedFunction, vi } from 'vite-plus/test';

import { useMutation, useQuery } from '@apollo/client/react';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { SettingsApplicationConnectionDetail } from '~/pages/settings/applications/SettingsApplicationConnectionDetail';
import { useFindApplicationConnectionProviders } from '~/pages/settings/applications/hooks/useFindApplicationConnectionProviders';
import { useApplicationConnectedAccounts } from '~/pages/settings/applications/hooks/useApplicationConnectedAccounts';

const mockTriggerAppOAuth = vi.fn();
const mockDeleteConnectedAccount = vi.fn();
const mockOpenModal = vi.fn();

vi.mock('@apollo/client/react', async () => ({
  ...(await vi.importActual<typeof ReactModule>('@apollo/client/react')),
  useMutation: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock(
  '~/pages/settings/applications/hooks/useFindApplicationConnectionProviders',
  () => ({
    useFindApplicationConnectionProviders: vi.fn(),
  }),
);

vi.mock(
  '~/pages/settings/applications/hooks/useApplicationConnectedAccounts',
  () => ({
    useApplicationConnectedAccounts: vi.fn(),
  }),
);

vi.mock('~/pages/settings/applications/hooks/useTriggerAppOAuth', () => ({
  useTriggerAppOAuth: vi.fn(() => ({
    triggerAppOAuth: mockTriggerAppOAuth,
  })),
}));

vi.mock('~/hooks/useNavigateSettings', () => ({
  useNavigateSettings: vi.fn(() => vi.fn()),
}));

vi.mock('@/ui/layout/dialog/hooks/useDialog', () => ({
  useDialog: vi.fn(() => ({
    openDialog: mockOpenModal,
  })),
}));

vi.mock('@/ui/layout/dialog/components/ConfirmationDialog', () => ({
  ConfirmationDialog: ({
    confirmButtonText,
    onConfirmClick,
  }: {
    confirmButtonText: string;
    onConfirmClick: () => void;
  }) => <button onClick={onConfirmClick}>{confirmButtonText}</button>,
}));

vi.mock('@/settings/components/SettingsPageContainer', () => ({
  SettingsPageContainer: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/settings/components/layout/SettingsPageLayout', () => ({
  SettingsPageLayout: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

const mockedUseMutation = useMutation as MockedFunction<typeof useMutation>;
const mockedUseQuery = useQuery as MockedFunction<typeof useQuery>;
const mockedUseFindApplicationConnectionProviders =
  useFindApplicationConnectionProviders as MockedFunction<
    typeof useFindApplicationConnectionProviders
  >;
const mockedUseApplicationConnectedAccounts =
  useApplicationConnectedAccounts as MockedFunction<
    typeof useApplicationConnectedAccounts
  >;

const renderDetailPage = () =>
  render(
    <I18nProvider i18n={i18n}>
      <MemoryRouter
        initialEntries={['/settings/applications/app-1/connections/account-1']}
      >
        <Routes>
          <Route
            path="/settings/applications/:applicationId/connections/:connectedAccountId"
            element={<SettingsApplicationConnectionDetail />}
          />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );

describe('SettingsApplicationConnectionDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedUseQuery.mockReturnValue({
      data: {
        findOneApplication: {
          id: 'app-1',
          name: 'Calendar app',
        },
      },
      loading: false,
    } as never);
    mockedUseMutation.mockReturnValue([
      mockDeleteConnectedAccount,
      { loading: false },
    ] as never);
    mockedUseFindApplicationConnectionProviders.mockReturnValue({
      connectionProviders: [
        {
          id: 'provider-1',
          applicationId: 'app-1',
          type: 'oauth',
          name: 'google-calendar',
          displayName: 'Google Calendar',
          logoUrl: null,
          oauth: {
            scopes: ['calendar.readonly'],
            isClientCredentialsConfigured: true,
          },
        },
      ],
      loading: false,
      refetch: vi.fn(),
    });
    mockedUseApplicationConnectedAccounts.mockReturnValue({
      accounts: [
        {
          __typename: 'ApplicationConnectedAccountDTO',
          id: 'account-1',
          handle: 'workspace@example.com',
          authFailedAt: null,
          scopes: ['calendar.readonly'],
          lastSignedInAt: null,
          connectionProviderId: 'provider-1',
          name: 'Original name',
          visibility: 'user',
          lastCredentialsRefreshedAt: null,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      loading: false,
      refetch: vi.fn(),
    });
  });

  it('changes visibility by reconnecting with the opposite visibility', () => {
    renderDetailPage();

    fireEvent.click(
      screen.getByRole('button', {
        name: /Share with workspace/,
      }),
    );

    expect(mockOpenModal).toHaveBeenCalledWith(
      'share-application-connection-with-workspace-modal-account-1',
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Reconnect and share',
      }),
    );

    expect(mockTriggerAppOAuth).toHaveBeenCalledWith({
      applicationId: 'app-1',
      providerName: 'google-calendar',
      visibility: 'workspace',
      reconnectingConnectedAccountId: 'account-1',
      redirectLocation: '/settings/applications/app-1/connections/account-1',
    });
  });

  it('offers reconnect and disconnect on a failed workspace shared connection', () => {
    mockedUseApplicationConnectedAccounts.mockReturnValue({
      accounts: [
        {
          __typename: 'ApplicationConnectedAccountDTO',
          id: 'account-1',
          handle: 'workspace@example.com',
          authFailedAt: '2026-05-01T00:00:00.000Z',
          scopes: ['calendar.readonly'],
          lastSignedInAt: null,
          connectionProviderId: 'provider-1',
          name: 'Shared connection',
          visibility: 'workspace',
          lastCredentialsRefreshedAt: null,
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      loading: false,
      refetch: vi.fn(),
    });

    renderDetailPage();

    expect(screen.getByText('Workspace shared')).toBeVisible();
    expect(screen.getByText('Reconnect needed')).toBeVisible();

    fireEvent.click(screen.getByText('Reconnect'));

    expect(mockTriggerAppOAuth).toHaveBeenCalledTimes(1);
    expect(mockTriggerAppOAuth).toHaveBeenCalledWith({
      applicationId: 'app-1',
      providerName: 'google-calendar',
      visibility: 'workspace',
      reconnectingConnectedAccountId: 'account-1',
      redirectLocation: '/settings/applications/app-1/connections/account-1',
    });

    const [disconnectButton] = screen.getAllByText('Disconnect');

    fireEvent.click(disconnectButton);

    expect(mockOpenModal).toHaveBeenCalledTimes(1);
    expect(mockOpenModal).toHaveBeenCalledWith(
      'delete-application-connection-modal-account-1',
    );
  });
});
