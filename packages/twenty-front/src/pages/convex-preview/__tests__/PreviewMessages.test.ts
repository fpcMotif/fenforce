import { setupI18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';

import { messages } from '../locales/en';

it('renders compiled sign-in and recovery messages without development fallbacks', () => {
  const i18n = setupI18n({ locale: 'en', messages: { en: messages } });
  const cases = [
    [msg`Sign in`, 'Sign in'],
    [msg`Email`, 'Email'],
    [msg`Password`, 'Password'],
    [msg`Create preview account`, 'Create preview account'],
    [msg`Your session has ended`, 'Your session has ended'],
    [msg`Sign in again`, 'Sign in again'],
  ] as const;

  for (const [descriptor, expected] of cases) {
    expect(i18n._(descriptor.id)).toBe(expected);
  }
});
