import { useLingui } from '@lingui/react/macro';
import { useQueryClient } from '@tanstack/react-query';
import { useConvex } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useEffect, useState, type ReactNode } from 'react';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import { PreviewError } from './PreviewError';
import { EMPLOYEE_SIGN_IN_ATTEMPT_KEY } from './signInAttempt';

const SESSION_VERIFICATION_TIMEOUT_IN_MILLISECONDS = 4000;
const SESSION_HEARTBEAT_INTERVAL_IN_MILLISECONDS = 2000;

export const SessionGate = ({ children }: { children: ReactNode }) => {
  const { t } = useLingui();
  const convex = useConvex();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<
    'checking' | 'active' | 'ended' | 'unverified'
  >('checking');

  useEffect(() => {
    let closed = false;
    let pending = false;
    let connected = convex.connectionState().isWebSocketConnected;
    let verificationDeadline: ReturnType<typeof setTimeout> | undefined;
    let expiryDeadline: ReturnType<typeof setTimeout> | undefined;
    const clearDeadlines = () => {
      clearTimeout(verificationDeadline);
      clearTimeout(expiryDeadline);
    };
    const closeGate = (finalStatus: 'ended' | 'unverified') => {
      closed = true;
      clearDeadlines();
      setStatus(finalStatus);
      queryClient.clear();
    };
    const armVerificationDeadline = () => {
      clearTimeout(verificationDeadline);
      verificationDeadline = connected
        ? setTimeout(
            () => closeGate('unverified'),
            SESSION_VERIFICATION_TIMEOUT_IN_MILLISECONDS,
          )
        : undefined;
    };
    const checkSession = async () => {
      if (closed || pending) return;
      pending = true;
      try {
        const session = await convex.query(api.employeeIdentity.session, {});
        if (closed) return;
        if (session === null || session.expiresAt <= Date.now()) {
          closeGate('ended');
          return;
        }
        clearTimeout(expiryDeadline);
        expiryDeadline = setTimeout(
          () => closeGate('ended'),
          session.expiresAt - Date.now(),
        );
        armVerificationDeadline();
        setStatus('active');
        sessionStorage.removeItem(EMPLOYEE_SIGN_IN_ATTEMPT_KEY);
      } catch {
        if (!closed) closeGate('unverified');
      } finally {
        pending = false;
      }
    };
    const unsubscribeFromConnectionState = convex.subscribeToConnectionState(
      (connectionState) => {
        if (closed || connectionState.isWebSocketConnected === connected)
          return;
        connected = connectionState.isWebSocketConnected;
        armVerificationDeadline();
        if (connected) void checkSession();
      },
    );
    armVerificationDeadline();
    void checkSession();
    const heartbeat = setInterval(
      () => void checkSession(),
      SESSION_HEARTBEAT_INTERVAL_IN_MILLISECONDS,
    );
    return () => {
      closed = true;
      clearDeadlines();
      clearInterval(heartbeat);
      unsubscribeFromConnectionState();
      queryClient.clear();
    };
  }, [convex, queryClient]);

  if (status === 'ended')
    return <PreviewError error={new ConvexError('UNAUTHENTICATED')} />;
  if (status === 'unverified')
    return <PreviewError error={new Error('SESSION_UNVERIFIED')} />;
  if (status === 'checking')
    return (
      <div
        className="fenforce-gate"
        role="status"
      >{t`Checking your session…`}</div>
    );
  return children;
};
