import { type Mock, vi } from 'vite-plus/test';

import { useAuth } from '@/auth/hooks/useAuth';
import { useSignInWithGoogle } from '@/auth/sign-in-up/hooks/useSignInWithGoogle';
import { renderHook } from '@testing-library/react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  BillingPlanKey,
  SubscriptionInterval,
} from '~/generated-metadata/graphql';
import { getJestMetadataAndApolloMocksWrapper } from '~/testing/jest/getJestMetadataAndApolloMocksWrapper';

vi.mock('react-router-dom', () => ({
  useParams: vi.fn(),
  useSearchParams: vi.fn(),
  Link: vi.fn(),
}));

vi.mock('@/auth/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

describe('useSignInWithGoogle', () => {
  const mockBillingCheckoutSession = {
    plan: BillingPlanKey.PRO,
    interval: SubscriptionInterval.Month,
    requirePaymentMethod: true,
  };

  const Wrapper = getJestMetadataAndApolloMocksWrapper({
    apolloMocks: [],
  });

  it('should call signInWithGoogle with correct params', () => {
    const signInWithGoogleMock = vi.fn();
    const mockUseParams = { workspaceInviteHash: 'testHash' };

    const mockSearchParams = new URLSearchParams(
      'inviteToken=testToken&billingCheckoutSessionState={"plan":"Pro","interval":"Month","requirePaymentMethod":true}',
    );

    (useParams as Mock).mockReturnValue(mockUseParams);
    (useSearchParams as Mock).mockReturnValue([mockSearchParams]);
    (useAuth as Mock).mockReturnValue({
      signInWithGoogle: signInWithGoogleMock,
    });

    const { result } = renderHook(() => useSignInWithGoogle(), {
      wrapper: Wrapper,
    });
    result.current.signInWithGoogle({
      action: 'join-workspace',
    });

    expect(signInWithGoogleMock).toHaveBeenCalledWith({
      action: 'join-workspace',
      workspaceInviteHash: 'testHash',
      workspacePersonalInviteToken: 'testToken',
      billingCheckoutSession: mockBillingCheckoutSession,
    });
  });

  it('should call signInWithGoogle with undefined invite token if not present', () => {
    const signInWithGoogleMock = vi.fn();
    const mockUseParams = { workspaceInviteHash: 'testHash' };
    const mockSearchParams = new URLSearchParams();

    (useParams as Mock).mockReturnValue(mockUseParams);
    (useSearchParams as Mock).mockReturnValue([mockSearchParams]);
    (useAuth as Mock).mockReturnValue({
      signInWithGoogle: signInWithGoogleMock,
    });

    const { result } = renderHook(() => useSignInWithGoogle(), {
      wrapper: Wrapper,
    });
    result.current.signInWithGoogle({
      action: 'join-workspace',
    });

    expect(signInWithGoogleMock).toHaveBeenCalledWith({
      action: 'join-workspace',
      workspaceInviteHash: 'testHash',
      workspacePersonalInviteToken: undefined,
      billingCheckoutSession: mockBillingCheckoutSession,
    });
  });
});
