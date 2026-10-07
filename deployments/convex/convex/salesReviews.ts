import { ConvexError } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { salesConfirmStandardRelease } from './salesCommercial';
import type {
  SalesCommand,
  SalesGate,
  SalesProject,
  SalesReviewState,
} from './salesContract';
import { salesCheckOwner, salesRequireSnapshot } from './salesPolicy';
import {
  salesAssertEditable,
  salesBlockers,
  salesRequire,
  salesText,
  salesUnexpiredQuote,
} from './salesValidation';

export type SalesCommandContext = {
  context: MutationCtx;
  member: Doc<'workspaceMembers'>;
  account: Doc<'workspaceCompanies'>;
  project: SalesProject;
};

const ORDER_GATES: SalesGate[] = [
  'support',
  'management',
  'osbo',
  'finance',
  'supply',
];

export const salesSubmitReview = async (
  { context, member, account, project }: SalesCommandContext,
  kind: 'pricing' | 'order',
) => {
  salesAssertEditable(project);
  const quote = salesUnexpiredQuote(project);
  const previous =
    kind === 'pricing' ? project.pricingReview : project.orderReview;
  salesRequire(previous?.status !== 'pending', 'SALES_REVIEW_ALREADY_PENDING');
  if (kind === 'pricing')
    salesRequire(
      quote.exceptionReason.length > 0,
      'SALES_PRICING_EXCEPTION_REQUIRED',
    );
  if (kind === 'order') {
    salesRequire(project.purchaseOrder !== null, 'SALES_PO_REQUIRED');
    salesRequire(
      project.purchaseOrder?.quoteVersion === quote.version,
      'SALES_PO_QUOTE_CHANGED',
    );
  }
  const ownerId = await salesCheckOwner(context, account);
  const snapshotId = await context.db.insert('salesReviewSnapshots', {
    mode: 'demo',
    simulation: true,
    workspaceId: project.workspaceId,
    projectId: project._id,
    accountId: project.accountId,
    accountName: account.name,
    ownerId,
    requesterId: member._id,
    timestamp: Date.now(),
    projectRevision: project.revision,
    kind,
    title: project.title,
    materialCode: project.materialCode,
    productName: project.productName,
    specification: project.specification,
    application: project.application,
    quantityMilli: project.quantityMilli,
    unit: project.unit,
    currency: project.currency,
    quote,
    purchaseOrder: project.purchaseOrder,
  });
  const review: SalesReviewState = {
    snapshotId,
    requesterId: member._id,
    quoteVersion: quote.version,
    status: 'pending',
    decisions: [],
    simulation: true,
  };
  project.ownerCheckedId = ownerId;
  project.ownerCheckedAt = Date.now();
  if (kind === 'pricing') project.pricingReview = review;
  else {
    project.orderReview = review;
    project.stage = 'review';
  }
};

const salesReviewForGate = (
  project: SalesProject,
  gate: SalesGate,
): SalesReviewState => {
  const review =
    gate === 'pricing' ? project.pricingReview : project.orderReview;
  if (review === null) throw new ConvexError('SALES_REVIEW_REQUIRED');
  return review;
};

const salesCheckGateOrder = (review: SalesReviewState, gate: SalesGate) => {
  const predecessor = { management: 'support', osbo: 'management' };
  if (gate !== 'management' && gate !== 'osbo') return;
  salesRequire(
    review.decisions.some(
      (decision) =>
        decision.gate === predecessor[gate] && decision.decision === 'approved',
    ),
    'SALES_REVIEW_GATE_ORDER',
  );
};

export const salesSimulateDecision = async (
  environment: SalesCommandContext,
  command: Extract<SalesCommand, { type: 'simulateReviewDecision' }>,
) => {
  const { context, project, account, member } = environment;
  salesAssertEditable(project);
  salesRequire(member.role === 'manager', 'SALES_SIMULATION_MANAGER_REQUIRED');
  const review = salesReviewForGate(project, command.gate);
  salesRequire(review.requesterId !== member._id, 'SALES_SELF_APPROVAL');
  await salesRequireSnapshot(context, project, review, account);
  salesRequire(review.status === 'pending', 'SALES_REVIEW_CLOSED');
  salesRequire(
    !review.decisions.some((decision) => decision.gate === command.gate),
    'SALES_GATE_ALREADY_DECIDED',
  );
  salesCheckGateOrder(review, command.gate);
  review.decisions.push({
    gate: command.gate,
    decision: command.decision,
    evidenceReference: salesText(command.evidenceReference),
    actorId: member._id,
    timestamp: Date.now(),
    simulation: true,
  });
  if (command.decision === 'rejected') review.status = 'rejected';
  else if (
    review.decisions.length ===
    (command.gate === 'pricing' ? 1 : ORDER_GATES.length)
  )
    review.status = 'approved';
};

const salesCheckPricing = async ({
  context,
  account,
  project,
}: SalesCommandContext) => {
  const quote = salesUnexpiredQuote(project);
  if (quote.exceptionReason.length === 0) return;
  const review = project.pricingReview;
  if (review === null || review.status !== 'approved')
    throw new ConvexError('SALES_PRICING_REVIEW_REQUIRED');
  await salesRequireSnapshot(context, project, review, account);
};

export const salesMarkQuoteSent = async (
  environment: SalesCommandContext,
  evidenceReference: string,
) => {
  salesAssertEditable(environment.project);
  await salesCheckPricing(environment);
  const quote = salesUnexpiredQuote(environment.project);
  salesRequire(
    quote.simulatedSentEvidence === null,
    'SALES_QUOTE_ALREADY_SENT',
  );
  quote.simulatedSentEvidence = salesText(evidenceReference);
  environment.project.stage = 'quoted';
};

export const salesSimulateConfirmation = async (
  environment: SalesCommandContext,
  evidenceReference: string,
) => {
  const { context, project, account, member } = environment;
  salesAssertEditable(project);
  const blockers = salesBlockers(project);
  salesRequire(
    blockers.length === 0,
    blockers[0] ?? 'SALES_CONFIRMATION_BLOCKED',
  );
  const review = project.orderReview;
  if (review === null) throw new ConvexError('SALES_ORDER_REVIEW_REQUIRED');
  await salesRequireSnapshot(context, project, review, account);
  await salesCheckPricing(environment);
  salesRequire(
    project.purchaseOrder?.quoteVersion === project.quoteVersion,
    'SALES_PO_QUOTE_CHANGED',
  );
  project.confirmation = {
    evidenceReference: salesText(evidenceReference),
    timestamp: Date.now(),
    actorId: member._id,
    simulation: true,
  };
  project.stage = 'confirmed';
  project.outcome = 'won';
  salesConfirmStandardRelease(project);
};
