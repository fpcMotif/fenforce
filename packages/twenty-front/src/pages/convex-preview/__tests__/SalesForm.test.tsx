import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { vi } from 'vite-plus/test';

import { SalesForm, salesDecimal } from '~/pages/convex-preview/SalesForm';

vi.mock('twenty-ui/components', () => ({
  MainButton: ({
    children,
    loading,
    type,
  }: ComponentProps<'button'> & { loading?: boolean }) => (
    <button type={type} disabled={loading}>
      {children}
    </button>
  ),
}));

it('preserves the salesperson draft after a rejected save and announces recovery', async () => {
  const user = userEvent.setup();
  const onSubmit = vi
    .fn<(values: FormData) => Promise<void>>()
    .mockRejectedValueOnce(
      new Error('This quote changed. Review the latest version.'),
    )
    .mockResolvedValueOnce(undefined);
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <SalesForm
        fields={[{ name: 'reference', label: 'PO reference' }]}
        submitLabel="Save PO"
        onSubmit={onSubmit}
      />
    </I18nProvider>,
  );
  await user.type(
    screen.getByRole('textbox', { name: 'PO reference' }),
    'DEMO-PO-100',
  );
  await user.click(screen.getByRole('button', { name: 'Save PO' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'This quote changed. Review the latest version.',
  );
  expect(screen.getByRole('textbox', { name: 'PO reference' })).toHaveValue(
    'DEMO-PO-100',
  );
  await user.click(screen.getByRole('button', { name: 'Save PO' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Saved.');
  expect(onSubmit.mock.calls[1]?.[0].get('reference')).toBe('DEMO-PO-100');
});

it.each([
  ['0.29', 2, 29],
  ['12.345', 3, 12345],
  ['1000', 3, 1000000],
])(
  'preserves decimal input %s exactly at precision %s',
  (value, precision, expected) => {
    const form = new FormData();
    form.set('value', value);
    expect(salesDecimal(form, 'value', precision)).toBe(expected);
  },
);

it.each(['1.234', '-1', 'NaN', '1e6', '9007199254740992', '1.2.3', ''])(
  'rejects ambiguous or excessive money precision: %s',
  (value) => {
    const form = new FormData();
    form.set('value', value);
    expect(() => salesDecimal(form, 'value', 2)).toThrow('INVALID_DECIMAL');
  },
);
