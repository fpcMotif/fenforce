import { useLingui } from '@lingui/react/macro';
import { useQueryClient } from '@tanstack/react-query';
import { useConvex } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useEffect, useState, type ReactNode } from 'react';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import { PreviewError } from './PreviewError';
import { EMPLOYEE_SIGN_IN_ATTEMPT_KEY } from './signInAttempt';

export const SessionGate = ({ children }: { children: ReactNode }) => {
  const { t } = useLingui();
  const convex = useConvex();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'checking' | 'active' | 'ended'>(
    'checking',
  );

  useEffect(() => {
    let closed = false;
    let pending = false;
    const endSession = () => {
      closed = true;
      setStatus('ended');
      queryClient.clear();
    };
    let deadline = setTimeout(endSession, 4000);
    const checkSession = async () => {
      if (closed || pending) return;
      pending = true;
      try {
        const session = await convex.query(api.employeeIdentity.session, {});
        if (closed) return;
        if (session === null || session.expiresAt <= Date.now()) {
          endSession();
          return;
        }
        clearTimeout(deadline);
        deadline = setTimeout(
          endSession,
          Math.min(4000, session.expiresAt - Date.now()),
        );
        setStatus('active');
        sessionStorage.removeItem(EMPLOYEE_SIGN_IN_ATTEMPT_KEY);
      } catch {
        if (!closed) endSession();
      } finally {
        pending = false;
      }
    };
    void checkSession();
    const heartbeat = setInterval(() => void checkSession(), 2000);
    return () => {
      closed = true;
      clearTimeout(deadline);
      clearInterval(heartbeat);
      queryClient.clear();
    };
  }, [convex, queryClient]);

  if (status === 'ended')
    return <PreviewError error={new ConvexError('UNAUTHENTICATED')} />;
  if (status === 'checking')
    return (
      <div
        className="fenforce-gate"
        role="status"
      >{t`Checking your session…`}</div>
    );
  return children;
};
