import { useLingui } from '@lingui/react/macro';
import { Fragment } from 'react';

import type { SalesProject } from '../../../../../deployments/convex/convex/salesContract';
import { useSalesLabels } from './SalesLabels';

type SalesProjectSummaryProps = { project: SalesProject };

export const SalesProjectSummary = ({ project }: SalesProjectSummaryProps) => {
  const { t } = useLingui();
  const { label } = useSalesLabels();
  const quote = project.quote;
  const money = (minor: number) =>
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency: project.currency,
    }).format(minor / 100);
  return (
    <>
      <section
        className="fenforce-sales-card"
        aria-label={t`Sampling and quality`}
      >
        <h2>{t`Sampling and quality`}</h2>
        {project.sample ? (
          <>
            <p>{label(project.sample.status)}</p>
            <p>{project.sample.notes}</p>
            <dl className="fenforce-sales-facts">
              <dt>{t`Batch`}</dt>
              <dd>{project.sample.batchReference || t`Not recorded`}</dd>
              <dt>{t`COA`}</dt>
              <dd>{project.sample.coaReference || t`Not recorded`}</dd>
              <dt>{t`Tracking`}</dt>
              <dd>{project.sample.trackingReference || t`Not recorded`}</dd>
            </dl>
          </>
        ) : (
          <p>{t`Record sampling progress, or explain why this customer does not need a sample.`}</p>
        )}
      </section>
      <section
        className="fenforce-sales-card"
        aria-label={t`Quotation and purchase order`}
      >
        <h2>{t`Quotation and purchase order`}</h2>
        {quote ? (
          <>
            <p>
              {project.confirmation
                ? t`The confirmed order uses this quotation version.`
                : t`This quotation does not itself confirm an order. Formal confirmation is recorded separately.`}
            </p>
            <dl className="fenforce-sales-facts">
              <dt>{t`Quote version`}</dt>
              <dd>{quote.version}</dd>
              <dt>{t`Unit price`}</dt>
              <dd>
                {money(quote.unitPriceMinor)} / {project.unit}
              </dd>
              <dt>{t`Order value`}</dt>
              <dd>{money(quote.totalMinor)}</dd>
              <dt>{t`Delivery terms`}</dt>
              <dd>
                {quote.incoterm} {quote.namedPlace}
              </dd>
              <dt>{t`Payment terms`}</dt>
              <dd>{label(quote.paymentTerms)}</dd>
              <dt>{t`Packaging`}</dt>
              <dd>{quote.packaging}</dd>
              <dt>{t`Valid until`}</dt>
              <dd>{quote.validUntil}</dd>
              <dt>{t`Delivery date`}</dt>
              <dd>{quote.deliveryDate}</dd>
              <dt>{t`Exception`}</dt>
              <dd>{quote.exceptionReason || t`None recorded`}</dd>
              <dt>{t`Quote communication`}</dt>
              <dd>{quote.simulatedSentEvidence || t`Not recorded`}</dd>
              {project.purchaseOrder && (
                <>
                  <dt>{t`Customer PO`}</dt>
                  <dd>{project.purchaseOrder.reference}</dd>
                  <dt>{t`Order type`}</dt>
                  <dd>{label(project.purchaseOrder.orderType)}</dd>
                  <dt>{t`PO document`}</dt>
                  <dd>{project.purchaseOrder.documentReference}</dd>
                  <dt>{t`Quality requirements`}</dt>
                  <dd>{project.purchaseOrder.qualityReference}</dd>
                </>
              )}
            </dl>
          </>
        ) : (
          <p>{t`Ask support for pricing, then prepare the first quotation.`}</p>
        )}
      </section>
      {project.pricingReview && (
        <section className="fenforce-sales-card" aria-label={t`Pricing review`}>
          <h2>{t`Pricing review`}</h2>
          <p>{label(project.pricingReview.status)}</p>
          {project.pricingReview.decisions.map((decision) => (
            <p key={decision.gate}>
              {label(decision.gate)}: {label(decision.decision)} ·{' '}
              {decision.evidenceReference}
            </p>
          ))}
        </section>
      )}
      {project.orderReview && (
        <section
          className="fenforce-sales-card"
          aria-label={t`Review responsibilities`}
        >
          <h2>{t`Review responsibilities`}</h2>
          <p>{t`Demo responsibilities represented by manager accounts.`}</p>
          <dl className="fenforce-sales-facts">
            {['support', 'management', 'osbo', 'finance', 'supply'].map(
              (gate) => {
                const decision = project.orderReview?.decisions.find(
                  (item) => item.gate === gate,
                );
                return (
                  <Fragment key={gate}>
                    <dt>{label(gate)}</dt>
                    <dd>
                      {decision ? (
                        <>
                          {label(decision.decision)} ·{' '}
                          {decision.evidenceReference}
                        </>
                      ) : (
                        t`Pending`
                      )}
                    </dd>
                  </Fragment>
                );
              },
            )}
          </dl>
        </section>
      )}
      {project.confirmation && (
        <section
          className="fenforce-sales-card"
          aria-label={t`Customer confirmation`}
        >
          <h2>{t`Customer confirmation`}</h2>
          <p>{t`Simulated confirmation recorded. No email was sent.`}</p>
          <p>{project.confirmation.evidenceReference}</p>
        </section>
      )}
    </>
  );
};
