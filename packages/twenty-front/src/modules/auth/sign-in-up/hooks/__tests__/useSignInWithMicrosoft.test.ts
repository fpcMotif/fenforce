import { type Mock, vi } from 'vite-plus/test';

import { useAuth } from '@/auth/hooks/useAuth';
import { useSignInWithMicrosoft } from '@/auth/sign-in-up/hooks/useSignInWithMicrosoft';
import { renderHook } from '@testing-library/react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

vi.mock('react-router-dom', () => ({
  useParams: vi.fn(),
  useSearchParams: vi.fn(),
  Link: vi.fn(),
}));

vi.mock('@/auth/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

describe('useSignInWithMicrosoft', () => {
  const Wrapper = getJestMetadataAndApolloMocksWrapper({
    apolloMocks: [],
  });

  const mockBillingCheckoutSession = {
    plan: 'PRO',
    interval: 'Month',
    requirePaymentMethod: true,
  };

  it('should call signInWithMicrosoft with the correct parameters', () => {
    const workspaceInviteHashMock = 'testHash';
    const inviteTokenMock = 'testToken';
    const signInWithMicrosoftMock = vi.fn();

    (useParams as Mock).mockReturnValue({
      workspaceInviteHash: workspaceInviteHashMock,
    });
    (useSearchParams as Mock).mockReturnValue([
      new URLSearchParams(`inviteToken=${inviteTokenMock}`),
    ]);
    (useAuth as Mock).mockReturnValue({
      signInWithMicrosoft: signInWithMicrosoftMock,
    });

    const { result } = renderHook(() => useSignInWithMicrosoft(), {
      wrapper: Wrapper,
    });
    result.current.signInWithMicrosoft({
      action: 'join-workspace',
    });

    expect(signInWithMicrosoftMock).toHaveBeenCalledWith({
      action: 'join-workspace',
      workspaceInviteHash: workspaceInviteHashMock,
      workspacePersonalInviteToken: inviteTokenMock,
      billingCheckoutSession: mockBillingCheckoutSession,
    });
  });

  it('should handle missing inviteToken gracefully', () => {
    const workspaceInviteHashMock = 'testHash';
    const signInWithMicrosoftMock = vi.fn();

    (useParams as Mock).mockReturnValue({
      workspaceInviteHash: workspaceInviteHashMock,
    });
    (useSearchParams as Mock).mockReturnValue([new URLSearchParams('')]);
    (useAuth as Mock).mockReturnValue({
      signInWithMicrosoft: signInWithMicrosoftMock,
    });

    const { result } = renderHook(() => useSignInWithMicrosoft(), {
      wrapper: Wrapper,
    });
    result.current.signInWithMicrosoft({
      action: 'join-workspace',
    });

    expect(signInWithMicrosoftMock).toHaveBeenCalledWith({
      action: 'join-workspace',
      billingCheckoutSession: mockBillingCheckoutSession,
      workspaceInviteHash: workspaceInviteHashMock,
      workspacePersonalInviteToken: undefined,
    });
  });
});
