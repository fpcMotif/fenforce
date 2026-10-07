import { useLingui } from '@lingui/react/macro';

import type { SalesField } from './SalesForm';

export const useSalesActionFields = () => {
  const { t } = useLingui();
  const evidence: SalesField = {
    name: 'evidenceReference',
    label: t`Evidence reference`,
    maxLength: 500,
  };
  const date: SalesField = {
    name: 'deliveryDate',
    label: t`Delivery date`,
    type: 'date',
  };
  const quantity: SalesField = {
    name: 'quantity',
    label: t`Quantity`,
    type: 'number',
    step: '0.001',
    min: '0.001',
  };
  return {
    nextAction: [
      { name: 'text', label: t`Next action` },
      { name: 'dueDate', label: t`Follow-up date`, type: 'date' },
    ],
    sample: [
      {
        name: 'status',
        label: t`Sample status`,
        options: [
          { value: 'requested', label: t`Requested` },
          { value: 'shipped', label: t`Shipped` },
          { value: 'accepted', label: t`Customer accepted` },
          { value: 'rejected', label: t`Customer rejected` },
          { value: 'not-required', label: t`Not required` },
        ],
      },
      {
        name: 'batchReference',
        label: t`Sample batch reference`,
        required: false,
      },
      { name: 'coaReference', label: t`COA reference`, required: false },
      {
        name: 'trackingReference',
        label: t`Tracking reference`,
        required: false,
      },
      { name: 'notes', label: t`Feedback or reason`, type: 'textarea' },
    ],
    quote: [
      {
        name: 'unitPrice',
        label: t`Price per unit`,
        type: 'number',
        min: '0.01',
        step: '0.01',
      },
      {
        name: 'incoterm',
        label: t`Incoterm`,
        options: ['FOB', 'FCA', 'CIF', 'CFR', 'DDP', 'EXW'].map((value) => ({
          value,
          label: value,
        })),
      },
      { name: 'namedPlace', label: t`Named port or place` },
      {
        name: 'paymentTerms',
        label: t`Payment terms`,
        options: [
          { value: 'prepayment', label: t`Prepayment` },
          { value: 'net30', label: t`Net 30` },
          { value: 'net60', label: t`Net 60` },
        ],
      },
      { name: 'packaging', label: t`Packaging` },
      { name: 'validUntil', label: t`Quote valid until`, type: 'date' },
      date,
      {
        name: 'exceptionReason',
        label: t`Pricing or terms exception reason`,
        required: false,
        type: 'textarea',
      },
    ],
    evidence: [evidence],
    purchaseOrder: [
      { name: 'reference', label: t`Customer PO number` },
      {
        name: 'documentReference',
        label: t`PO document reference`,
        maxLength: 500,
      },
      {
        name: 'qualityReference',
        label: t`Product quality requirements reference`,
        maxLength: 500,
      },
      {
        name: 'orderType',
        label: t`Order type`,
        options: [
          { value: 'standard', label: t`Standard: one shipment` },
          { value: 'blanket', label: t`Blanket: scheduled releases` },
        ],
      },
    ],
    review: [
      {
        name: 'gate',
        label: t`Review responsibility`,
        options: [
          { value: 'pricing', label: t`Pricing exception` },
          { value: 'support', label: t`Co-worker review` },
          { value: 'management', label: t`Branch manager review` },
          { value: 'osbo', label: t`OSBO review` },
          { value: 'finance', label: t`Finance clearance` },
          { value: 'supply', label: t`Supply availability` },
        ],
      },
      {
        name: 'decision',
        label: t`Decision`,
        options: [
          { value: 'approved', label: t`Approve` },
          { value: 'rejected', label: t`Reject` },
        ],
      },
      evidence,
    ],
    release: [
      { name: 'reference', label: t`Customer release reference` },
      quantity,
      date,
    ],
    handoff: [
      { name: 'releaseReference', label: t`Release reference` },
      {
        name: 'outcome',
        label: t`Simulated SAP outcome`,
        options: [
          { value: 'accepted', label: t`Accepted` },
          { value: 'failed', label: t`Failed` },
          { value: 'uncertain', label: t`Uncertain: reconciliation needed` },
        ],
      },
      evidence,
    ],
    activity: [
      {
        name: 'kind',
        label: t`Activity type`,
        options: [
          { value: 'call', label: t`Call` },
          { value: 'meeting', label: t`Meeting` },
          { value: 'note', label: t`Note` },
          { value: 'delivery-followup', label: t`Delivery follow-up` },
        ],
      },
      { name: 'text', label: t`Activity notes`, type: 'textarea' },
    ],
    lost: [
      {
        name: 'reason',
        label: t`Reason for losing this project`,
        type: 'textarea',
      },
    ],
  } satisfies Record<string, SalesField[]>;
};
