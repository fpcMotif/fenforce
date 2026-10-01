import { useAuthActions } from '@convex-dev/auth/react';
import { useLingui } from '@lingui/react/macro';
import { useQueryClient } from '@tanstack/react-query';
import { ConvexError } from 'convex/values';
import { useEffect } from 'react';

type PreviewErrorProps = { error?: unknown };

export const PreviewError = ({ error }: PreviewErrorProps) => {
  const { t } = useLingui();
  const { signOut } = useAuthActions();
  const queryClient = useQueryClient();
  const sessionEnded =
    error instanceof ConvexError && error.data === 'UNAUTHENTICATED';

  useEffect(() => queryClient.clear(), [queryClient]);

  return (
    <div className="fenforce-gate">
      <div className="fenforce-gate-card" role="alert">
        <h1>
          {sessionEnded
            ? t`Your session has ended`
            : t`Unable to load Fenforce`}
        </h1>
        <p>
          {sessionEnded
            ? t`Sign in again to continue.`
            : t`Check your connection and try again.`}
        </p>
        <div className="fenforce-form-actions">
          {!sessionEnded && (
            <button
              className="fenforce-secondary-button"
              type="button"
              onClick={() => window.location.reload()}
            >
              {t`Reload`}
            </button>
          )}
          <button
            className="fenforce-secondary-button"
            type="button"
            onClick={() => void signOut()}
          >
            {sessionEnded ? t`Sign in again` : t`Sign out`}
          </button>
        </div>
      </div>
    </div>
  );
};
