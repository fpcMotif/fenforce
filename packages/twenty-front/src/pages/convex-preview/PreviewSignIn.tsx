import { useAuthActions } from '@convex-dev/auth/react';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { MainButton } from 'twenty-ui/components';
import { IconBuildingSkyscraper } from 'twenty-ui/icon';
import { EMPLOYEE_SIGN_IN_ATTEMPT_KEY } from './signInAttempt';

export const PreviewSignIn = () => {
  const { t } = useLingui();
  const { signIn } = useAuthActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(() => {
    const startedAt = Number(
      sessionStorage.getItem(EMPLOYEE_SIGN_IN_ATTEMPT_KEY),
    );
    const age = Date.now() - startedAt;
    return startedAt > 0 && age >= 0 && age < 300_000;
  });
  useEffect(() => {
    sessionStorage.removeItem(EMPLOYEE_SIGN_IN_ATTEMPT_KEY);
  }, []);

  const submit = async () => {
    setHasError(false);
    setIsSubmitting(true);
    try {
      sessionStorage.setItem(EMPLOYEE_SIGN_IN_ATTEMPT_KEY, String(Date.now()));
      await signIn('employee-oidc', {
        redirectTo:
          window.location.pathname +
          window.location.search +
          window.location.hash,
      });
    } catch {
      sessionStorage.removeItem(EMPLOYEE_SIGN_IN_ATTEMPT_KEY);
      setHasError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fenforce-gate">
      <section className="fenforce-gate-card" aria-label={t`Fenforce sign in`}>
        <div className="fenforce-gate-mark">
          <IconBuildingSkyscraper size={22} />
        </div>
        <p className="fenforce-gate-brand">Fenforce</p>
        <h1>{t`Sign in`}</h1>
        <p className="fenforce-gate-copy">{t`Sign in with your invited employee identity to enter your workspace.`}</p>
        {hasError && (
          <p className="fenforce-form-error" role="alert">
            {t`Unable to sign in. Check your invitation or try again.`}
          </p>
        )}
        <MainButton
          type="button"
          fullWidth
          loading={isSubmitting}
          onClick={() => void submit()}
        >
          {t`Continue with employee identity`}
        </MainButton>
      </section>
    </div>
  );
};
