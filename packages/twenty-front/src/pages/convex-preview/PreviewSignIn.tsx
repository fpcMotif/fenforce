import { useAuthActions } from '@convex-dev/auth/react';
import { useLingui } from '@lingui/react/macro';
import { useState, type FormEvent } from 'react';
import { MainButton } from 'twenty-ui/components';
import { IconBuildingSkyscraper } from 'twenty-ui/icon';

export const PreviewSignIn = () => {
  const { t } = useLingui();
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHasError(false);
    setIsSubmitting(true);

    try {
      await signIn('preview-password', {
        flow,
        email: email.trim(),
        password,
        ...(flow === 'signUp' ? { inviteCode } : {}),
      });
    } catch {
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
        <h1>{flow === 'signIn' ? t`Sign in` : t`Create preview account`}</h1>
        <p className="fenforce-gate-copy">
          {flow === 'signIn'
            ? t`Sign in to your workspace.`
            : t`Preview access requires an invitation code.`}
        </p>
        <form className="fenforce-form" onSubmit={submit}>
          <label>
            <span>{t`Email`}</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            <span>{t`Password`}</span>
            <input
              type="password"
              name="password"
              autoComplete={
                flow === 'signIn' ? 'current-password' : 'new-password'
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={flow === 'signUp' ? 12 : undefined}
              required
            />
          </label>
          {flow === 'signUp' && (
            <label>
              <span>{t`Invitation code`}</span>
              <input
                type="text"
                name="inviteCode"
                autoComplete="off"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                required
              />
            </label>
          )}
          {hasError && (
            <p className="fenforce-form-error" role="alert">
              {flow === 'signIn'
                ? t`Unable to sign in. Check your email and password, then try again.`
                : t`Unable to create an account. Check your invitation details and try again.`}
            </p>
          )}
          <MainButton type="submit" fullWidth loading={isSubmitting}>
            {flow === 'signIn' ? t`Sign in` : t`Create account`}
          </MainButton>
        </form>
        <button
          className="fenforce-text-button"
          type="button"
          onClick={() => {
            setFlow(flow === 'signIn' ? 'signUp' : 'signIn');
            setHasError(false);
          }}
        >
          {flow === 'signIn'
            ? t`Have an invitation code? Create an account`
            : t`Already have an account? Sign in`}
        </button>
      </section>
    </div>
  );
};
