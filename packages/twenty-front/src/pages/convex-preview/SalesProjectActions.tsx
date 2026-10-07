import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import type { SalesCommand } from '../../../../../deployments/convex/convex/salesContract';
import { useSalesActionFields } from './SalesActionFields';
import {
  SalesForm,
  salesChoice,
  salesDecimal,
  salesText,
  type SalesField,
} from './SalesForm';

type ExecuteSalesCommand = (
  command: SalesCommand,
  revision: number,
) => Promise<{ revision: number }>;

type SalesActionProps = {
  title: string;
  description?: string;
  fields: SalesField[];
  revision: number;
  command: (values: FormData) => SalesCommand;
  onExecute: ExecuteSalesCommand;
};

const SalesAction = ({
  title,
  description,
  fields,
  revision,
  command,
  onExecute,
}: SalesActionProps) => {
  const [editingRevision, setEditingRevision] = useState(revision);
  const submit = async (values: FormData) => {
    const result = await onExecute(command(values), editingRevision);
    setEditingRevision(result.revision);
  };
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) setEditingRevision(revision);
      }}
    >
      <summary>{title}</summary>
      {description && <p>{description}</p>}
      <SalesForm fields={fields} onSubmit={submit} submitLabel={title} />
    </details>
  );
};

type SalesProjectActionsProps = {
  revision: number;
  isManager: boolean;
  onExecute: ExecuteSalesCommand;
};

export const SalesProjectActions = ({
  revision,
  isManager,
  onExecute,
}: SalesProjectActionsProps) => {
  const { t } = useLingui();
  const fields = useSalesActionFields();
  const common = { revision, onExecute };
  return (
    <section className="fenforce-sales-card" aria-label={t`Project actions`}>
      <h2>{t`Move the project forward`}</h2>
      <p>{t`Open an action to enter its evidence. The server checks access, order readiness and the version you reviewed.`}</p>
      <SalesAction
        {...common}
        title={t`Set next action`}
        fields={fields.nextAction}
        command={(values) => ({
          type: 'setNextAction',
          text: salesText(values, 'text'),
          dueDate: salesText(values, 'dueDate'),
        })}
      />
      <SalesAction
        {...common}
        title={t`Record sample progress`}
        fields={fields.sample}
        description={t`Shipped and accepted samples need batch, COA and tracking references. Explain why sampling is unnecessary for a repeat product.`}
        command={(values) => ({
          type: 'recordSample',
          status: salesChoice(values, 'status', [
            'requested',
            'shipped',
            'accepted',
            'rejected',
            'not-required',
          ]),
          batchReference: salesText(values, 'batchReference'),
          coaReference: salesText(values, 'coaReference'),
          trackingReference: salesText(values, 'trackingReference'),
          notes: salesText(values, 'notes'),
        })}
      />
      <SalesAction
        {...common}
        title={t`Prepare or revise quotation`}
        fields={fields.quote}
        description={t`The quote is indicative. Revising commercial terms requires fresh review before confirming an order.`}
        command={(values) => ({
          type: 'reviseQuote',
          unitPriceMinor: salesDecimal(values, 'unitPrice', 2),
          incoterm: salesText(values, 'incoterm'),
          namedPlace: salesText(values, 'namedPlace'),
          paymentTerms: salesChoice(values, 'paymentTerms', [
            'prepayment',
            'net30',
            'net60',
          ]),
          packaging: salesText(values, 'packaging'),
          validUntil: salesText(values, 'validUntil'),
          deliveryDate: salesText(values, 'deliveryDate'),
          exceptionReason: salesText(values, 'exceptionReason'),
        })}
      />
      <SalesAction
        {...common}
        title={t`Request pricing review`}
        fields={[]}
        description={t`Use this for a pricing or terms exception. A different manager reviews the exact quotation version in this demo.`}
        command={() => ({ type: 'submitPricingReview' })}
      />
      <SalesAction
        {...common}
        title={t`Record quote sent`}
        fields={fields.evidence}
        description={t`Record a communication reference. Fenforce does not send an email from this demo.`}
        command={(values) => ({
          type: 'markQuoteSent',
          evidenceReference: salesText(values, 'evidenceReference'),
        })}
      />
      <SalesAction
        {...common}
        title={t`Capture customer PO`}
        fields={fields.purchaseOrder}
        description={t`A received PO is under review. It is not an accepted order. Keep the PO and quality requirements in your approved document store.`}
        command={(values) => ({
          type: 'capturePurchaseOrder',
          reference: salesText(values, 'reference'),
          documentReference: salesText(values, 'documentReference'),
          qualityReference: salesText(values, 'qualityReference'),
          orderType: salesChoice(values, 'orderType', ['standard', 'blanket']),
        })}
      />
      <SalesAction
        {...common}
        title={t`Submit order for review`}
        fields={[]}
        description={t`Freeze the PO and quotation for co-worker, branch manager, OSBO, finance and supply review.`}
        command={() => ({ type: 'submitOrderReview' })}
      />
      {isManager && (
        <SalesAction
          {...common}
          title={t`Simulate review decision`}
          fields={fields.review}
          description={t`Demo only. Your manager account represents the selected review responsibility. Self-approval is rejected. No Feishu decision is submitted.`}
          command={(values) => ({
            type: 'simulateReviewDecision',
            gate: salesChoice(values, 'gate', [
              'pricing',
              'support',
              'management',
              'osbo',
              'finance',
              'supply',
            ]),
            decision: salesChoice(values, 'decision', ['approved', 'rejected']),
            evidenceReference: salesText(values, 'evidenceReference'),
          })}
        />
      )}
      <SalesAction
        {...common}
        title={t`Simulate customer confirmation`}
        fields={fields.evidence}
        description={t`Requires the reviewed terms, sample clearance, finance and supply approval. Records a simulated confirmation without sending an email.`}
        command={(values) => ({
          type: 'simulateCustomerConfirmation',
          evidenceReference: salesText(values, 'evidenceReference'),
        })}
      />
      <SalesAction
        {...common}
        title={t`Create blanket release`}
        fields={fields.release}
        description={t`Use a customer-confirmed delivery date and a quantity within the remaining order balance. Standard orders receive one release automatically.`}
        command={(values) => ({
          type: 'createBlanketRelease',
          reference: salesText(values, 'reference'),
          quantityMilli: salesDecimal(values, 'quantity', 3),
          deliveryDate: salesText(values, 'deliveryDate'),
        })}
      />
      <SalesAction
        {...common}
        title={t`Simulate SAP handoff`}
        fields={fields.handoff}
        description={t`No order is sent to SAP. An uncertain result must be reconciled using the same release reference.`}
        command={(values) => ({
          type: 'simulateSapHandoff',
          releaseReference: salesText(values, 'releaseReference'),
          outcome: salesChoice(values, 'outcome', [
            'accepted',
            'failed',
            'uncertain',
          ]),
          evidenceReference: salesText(values, 'evidenceReference'),
        })}
      />
      <SalesAction
        {...common}
        title={t`Log customer activity`}
        fields={fields.activity}
        command={(values) => ({
          type: 'logActivity',
          kind: salesChoice(values, 'kind', [
            'call',
            'meeting',
            'note',
            'delivery-followup',
          ]),
          text: salesText(values, 'text'),
        })}
      />
      <SalesAction
        {...common}
        title={t`Close project as lost`}
        fields={fields.lost}
        command={(values) => ({
          type: 'closeLost',
          reason: salesText(values, 'reason'),
        })}
      />
    </section>
  );
};
