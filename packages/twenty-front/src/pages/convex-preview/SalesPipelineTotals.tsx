import { useLingui } from '@lingui/react/macro';

import type { SalesProject } from '../../../../../deployments/convex/convex/salesContract';
import { useSalesLabels } from './SalesLabels';

export type SalesPipelineGroup = {
  stage: SalesProject['stage'];
  currency: SalesProject['currency'];
  count: number;
  quotedCount: number;
  totalMinor: number;
};

export const formatSalesMinor = (
  amountMinor: number,
  currency: string,
  locale: string,
) => {
  const digits = String(amountMinor).padStart(3, '0');
  const decimal = `${digits.slice(0, -2)}.${digits.slice(-2)}` as `${number}`;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(decimal);
};

type SalesPipelineTotalsProps = {
  groups: SalesPipelineGroup[];
  complete: boolean;
};

export const SalesPipelineTotals = ({
  groups,
  complete,
}: SalesPipelineTotalsProps) => {
  const { t, i18n } = useLingui();
  const { label: stageLabel } = useSalesLabels();
  return (
    <section
      className="fenforce-sales-card"
      aria-label={t`Pipeline totals by stage`}
    >
      <h2>{t`Pipeline totals by stage`}</h2>
      {groups.length === 0 ? (
        <p>{t`No open opportunities you can access.`}</p>
      ) : (
        <div className="fenforce-table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">{t`Stage`}</th>
                <th scope="col">{t`Currency`}</th>
                <th scope="col">{t`Opportunities`}</th>
                <th scope="col">{t`Quoted`}</th>
                <th scope="col">{t`Quoted total`}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={`${group.stage}:${group.currency}`}>
                  <th scope="row">{stageLabel(group.stage)}</th>
                  <td>{group.currency}</td>
                  <td>{group.count}</td>
                  <td>{group.quotedCount}</td>
                  <td>
                    {formatSalesMinor(
                      group.totalMinor,
                      group.currency,
                      i18n.locale,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!complete && (
        <p role="status">{t`Totals cover only the first 500 open opportunities. The list below includes every opportunity you can access.`}</p>
      )}
    </section>
  );
};
