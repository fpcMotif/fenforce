import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { render, screen, within } from '@testing-library/react';

import {
  formatSalesMinor,
  SalesPipelineTotals,
  type SalesPipelineGroup,
} from '~/pages/convex-preview/SalesPipelineTotals';

const renderTotals = (groups: SalesPipelineGroup[], complete = true) =>
  render(
    <I18nProvider i18n={setupI18n({ locale: 'en', messages: { en: {} } })}>
      <SalesPipelineTotals groups={groups} complete={complete} />
    </I18nProvider>,
  );

it.each([
  [5, 'USD', '$0.05'],
  [2100, 'USD', '$21.00'],
  [9007199254740991, 'USD', '$90,071,992,547,409.91'],
  [333, 'EUR', '€3.33'],
])('formats %s minor units of %s exactly as %s', (amount, currency, text) => {
  expect(formatSalesMinor(amount, currency, 'en')).toBe(text);
});

it('lists each stage and currency separately instead of mixing currencies', () => {
  renderTotals([
    {
      stage: 'qualified',
      currency: 'CNY',
      count: 1,
      quotedCount: 1,
      totalMinor: 333,
    },
    {
      stage: 'qualified',
      currency: 'USD',
      count: 2,
      quotedCount: 1,
      totalMinor: 999,
    },
  ]);
  const rows = screen.getAllByRole('row', { name: /Qualified project/ });
  expect(rows).toHaveLength(2);
  expect(within(rows[0]).getByText('CN¥3.33')).toBeInTheDocument();
  expect(within(rows[1]).getByText('$9.99')).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('explains an empty pipeline and announces incomplete totals', () => {
  renderTotals([], false);
  expect(
    screen.getByText('No open opportunities you can access.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent(
    'Totals cover only the first 500 open opportunities.',
  );
});
