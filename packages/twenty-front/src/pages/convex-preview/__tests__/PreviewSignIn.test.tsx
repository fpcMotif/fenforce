import { vi } from 'vite-plus/test';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PreviewSignIn } from '~/pages/convex-preview/PreviewSignIn';

const signIn = vi.fn();

vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signIn }),
}));

it('starts employee sign-in with the protected URL and allows retry after failure', async () => {
  window.history.replaceState(
    {},
    '',
    '/object/company/account-a?workspace=workspace-demo',
  );
  signIn
    .mockRejectedValueOnce(new Error('Provider unavailable'))
    .mockResolvedValueOnce({ signingIn: false });
  const user = userEvent.setup();
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <PreviewSignIn />
    </I18nProvider>,
  );
  await user.click(
    screen.getByRole('button', { name: 'Continue with employee identity' }),
  );
  expect(signIn).toHaveBeenCalledWith('employee-oidc', {
    redirectTo: '/object/company/account-a?workspace=workspace-demo',
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Unable to sign in',
  );
  await user.click(
    screen.getByRole('button', { name: 'Continue with employee identity' }),
  );
  expect(signIn).toHaveBeenCalledTimes(2);
});
