import { v, type Infer } from 'convex/values';

export const salesUnitValidator = v.union(
  v.literal('kg'),
  v.literal('t'),
  v.literal('L'),
  v.literal('piece'),
);
export const salesCurrencyValidator = v.union(
  v.literal('USD'),
  v.literal('CNY'),
  v.literal('EUR'),
);
export const salesSampleValidator = v.object({
  status: v.union(
    v.literal('requested'),
    v.literal('shipped'),
    v.literal('accepted'),
    v.literal('rejected'),
    v.literal('not-required'),
  ),
  batchReference: v.string(),
  coaReference: v.string(),
  trackingReference: v.string(),
  notes: v.string(),
});
export const salesQuoteTermsValidator = v.object({
  unitPriceMinor: v.number(),
  incoterm: v.string(),
  namedPlace: v.string(),
  paymentTerms: v.union(
    v.literal('prepayment'),
    v.literal('net30'),
    v.literal('net60'),
  ),
  packaging: v.string(),
  validUntil: v.string(),
  deliveryDate: v.string(),
  exceptionReason: v.string(),
});
export const salesQuoteValidator = v.object({
  ...salesQuoteTermsValidator.fields,
  version: v.number(),
  totalMinor: v.number(),
  indicative: v.literal(true),
  rounding: v.literal('half-up-minor-unit'),
  simulatedSentEvidence: v.union(v.string(), v.null()),
});
export const salesPurchaseOrderInputValidator = v.object({
  reference: v.string(),
  documentReference: v.string(),
  qualityReference: v.string(),
  orderType: v.union(v.literal('standard'), v.literal('blanket')),
});
export const salesPurchaseOrderValidator = v.object({
  ...salesPurchaseOrderInputValidator.fields,
  quoteVersion: v.number(),
});
export const salesGateValidator = v.union(
  v.literal('pricing'),
  v.literal('support'),
  v.literal('management'),
  v.literal('osbo'),
  v.literal('finance'),
  v.literal('supply'),
);
export const salesDecisionInputValidator = v.object({
  gate: salesGateValidator,
  decision: v.union(v.literal('approved'), v.literal('rejected')),
  evidenceReference: v.string(),
});
export const salesDecisionValidator = v.object({
  ...salesDecisionInputValidator.fields,
  actorId: v.id('workspaceMembers'),
  timestamp: v.number(),
  simulation: v.boolean(),
});
export const salesReviewStateValidator = v.object({
  snapshotId: v.id('salesReviewSnapshots'),
  requesterId: v.id('workspaceMembers'),
  quoteVersion: v.number(),
  status: v.union(
    v.literal('pending'),
    v.literal('approved'),
    v.literal('rejected'),
  ),
  decisions: v.array(salesDecisionValidator),
  recordedRevision: v.number(),
  simulation: v.literal(true),
});
export const salesReleaseValidator = v.object({
  reference: v.string(),
  quantityMilli: v.number(),
  deliveryDate: v.string(),
  erpState: v.union(
    v.literal('ready'),
    v.literal('accepted'),
    v.literal('failed'),
    v.literal('uncertain'),
  ),
  simulatedSapReference: v.union(v.string(), v.null()),
  evidenceReference: v.union(v.string(), v.null()),
  simulation: v.literal(true),
});
export const salesProductFields = {
  title: v.string(),
  materialCode: v.string(),
  productName: v.string(),
  specification: v.string(),
  application: v.string(),
  quantityMilli: v.number(),
  unit: salesUnitValidator,
  currency: salesCurrencyValidator,
};
export const salesProductValidator = v.object(salesProductFields);
export const SALES_OPEN_STAGES = [
  'qualified',
  'quoted',
  'po-received',
  'review',
] as const;
export const salesOpenStageValidator = v.union(
  ...SALES_OPEN_STAGES.map((stage) => v.literal(stage)),
);
export const salesStageValidator = v.union(
  salesOpenStageValidator,
  v.literal('confirmed'),
  v.literal('lost'),
);
export const salesProjectFields = {
  mode: v.literal('demo'),
  simulation: v.literal(true),
  workspaceId: v.id('workspaces'),
  accountId: v.id('workspaceCompanies'),
  primaryContactId: v.union(v.id('workspaceContacts'), v.null()),
  sourceId: v.union(v.string(), v.null()),
  ...salesProductFields,
  revision: v.number(),
  quoteVersion: v.number(),
  nextAction: v.string(),
  nextActionDate: v.string(),
  closeDate: v.union(v.string(), v.null()),
  ownerCheckedId: v.id('workspaceMembers'),
  ownerCheckedAt: v.number(),
  stage: salesStageValidator,
  outcome: v.union(v.literal('open'), v.literal('won'), v.literal('lost')),
  sample: v.union(salesSampleValidator, v.null()),
  quote: v.union(salesQuoteValidator, v.null()),
  purchaseOrder: v.union(salesPurchaseOrderValidator, v.null()),
  pricingReview: v.union(salesReviewStateValidator, v.null()),
  orderReview: v.union(salesReviewStateValidator, v.null()),
  confirmation: v.union(
    v.object({
      evidenceReference: v.string(),
      timestamp: v.number(),
      actorId: v.id('workspaceMembers'),
      simulation: v.literal(true),
    }),
    v.null(),
  ),
  releases: v.array(salesReleaseValidator),
  lostReason: v.union(v.string(), v.null()),
  createdBy: v.id('workspaceMembers'),
  updatedBy: v.id('workspaceMembers'),
  createdAt: v.number(),
  updatedAt: v.number(),
};
export const salesProjectValidator = v.object({
  ...salesProjectFields,
  _id: v.id('salesProjects'),
  _creationTime: v.number(),
});
export const salesSnapshotFields = {
  mode: v.literal('demo'),
  simulation: v.literal(true),
  workspaceId: v.id('workspaces'),
  projectId: v.id('salesProjects'),
  accountId: v.id('workspaceCompanies'),
  accountName: v.string(),
  ownerId: v.id('workspaceMembers'),
  requesterId: v.id('workspaceMembers'),
  timestamp: v.number(),
  projectRevision: v.number(),
  kind: v.union(v.literal('pricing'), v.literal('order')),
  ...salesProductFields,
  quote: salesQuoteValidator,
  purchaseOrder: v.union(salesPurchaseOrderValidator, v.null()),
};
export const salesSnapshotValidator = v.object({
  ...salesSnapshotFields,
  _id: v.id('salesReviewSnapshots'),
  _creationTime: v.number(),
});
export const salesCommandValidator = v.union(
  v.object({
    type: v.literal('setNextAction'),
    text: v.string(),
    dueDate: v.string(),
  }),
  v.object({
    type: v.literal('setCloseDate'),
    closeDate: v.union(v.string(), v.null()),
  }),
  v.object({
    type: v.literal('setPrimaryContact'),
    contactId: v.union(v.id('workspaceContacts'), v.null()),
  }),
  v.object({ type: v.literal('recordSample'), ...salesSampleValidator.fields }),
  v.object({
    type: v.literal('reviseQuote'),
    ...salesQuoteTermsValidator.fields,
  }),
  v.object({ type: v.literal('submitPricingReview') }),
  v.object({
    type: v.literal('simulateReviewDecision'),
    ...salesDecisionInputValidator.fields,
  }),
  v.object({ type: v.literal('markQuoteSent'), evidenceReference: v.string() }),
  v.object({
    type: v.literal('capturePurchaseOrder'),
    ...salesPurchaseOrderInputValidator.fields,
  }),
  v.object({ type: v.literal('submitOrderReview') }),
  v.object({
    type: v.literal('simulateCustomerConfirmation'),
    evidenceReference: v.string(),
  }),
  v.object({
    type: v.literal('createBlanketRelease'),
    reference: v.string(),
    quantityMilli: v.number(),
    deliveryDate: v.string(),
  }),
  v.object({
    type: v.literal('simulateSapHandoff'),
    releaseReference: v.string(),
    outcome: v.union(
      v.literal('accepted'),
      v.literal('failed'),
      v.literal('uncertain'),
    ),
    evidenceReference: v.string(),
  }),
  v.object({
    type: v.literal('logActivity'),
    kind: v.union(
      v.literal('call'),
      v.literal('meeting'),
      v.literal('note'),
      v.literal('delivery-followup'),
    ),
    text: v.string(),
  }),
  v.object({ type: v.literal('closeLost'), reason: v.string() }),
);
export const salesEventFields = {
  mode: v.literal('demo'),
  simulation: v.literal(true),
  workspaceId: v.id('workspaces'),
  projectId: v.id('salesProjects'),
  actorId: v.id('workspaceMembers'),
  timestamp: v.number(),
  revision: v.number(),
  fromStage: v.union(salesStageValidator, v.null()),
  toStage: salesStageValidator,
  command: v.union(
    salesCommandValidator,
    v.object({ type: v.literal('create') }),
    v.object({
      type: v.literal('applyApprovalOutcome'),
      gate: salesGateValidator,
      decision: salesDecisionInputValidator.fields.decision,
      externalDecisionId: v.string(),
    }),
  ),
  previousQuote: v.union(salesQuoteValidator, v.null()),
  snapshotId: v.union(v.id('salesReviewSnapshots'), v.null()),
};
export const salesEventValidator = v.object({
  ...salesEventFields,
  _id: v.id('salesProjectEvents'),
  _creationTime: v.number(),
});
export const SALES_SIMULATION_LABEL =
  'Demo simulation: no Feishu, email or SAP calls' as const;
export const salesProjectCardFields = {
  _id: v.id('salesProjects'),
  accountId: v.id('workspaceCompanies'),
  title: v.string(),
  stage: salesStageValidator,
  closeDate: v.union(v.string(), v.null()),
  nextAction: v.string(),
  nextActionDate: v.string(),
  revision: v.number(),
  updatedAt: v.number(),
};
export const salesProjectCard = (project: SalesProject) => ({
  _id: project._id,
  accountId: project.accountId,
  title: project.title,
  stage: project.stage,
  closeDate: project.closeDate,
  nextAction: project.nextAction,
  nextActionDate: project.nextActionDate,
  revision: project.revision,
  updatedAt: project.updatedAt,
});
export type SalesCommand = Infer<typeof salesCommandValidator>;
export type SalesProject = Infer<typeof salesProjectValidator>;
export type SalesQuote = Infer<typeof salesQuoteValidator>;
export type SalesReviewState = Infer<typeof salesReviewStateValidator>;
export type SalesGate = Infer<typeof salesGateValidator>;
export type SalesDecision = Infer<typeof salesDecisionValidator>;
export type SalesRelease = Infer<typeof salesReleaseValidator>;
export type SalesEvent = Infer<typeof salesEventValidator>;
