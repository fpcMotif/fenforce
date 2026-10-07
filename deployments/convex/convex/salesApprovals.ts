import { ConvexError, v, type Infer } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import { canAccessAccount } from './accountPolicy';
import { operationPayload } from './operationReceipt';
import {
  salesDecisionInputValidator,
  salesGateValidator,
  type SalesProject,
} from './salesContract';
import { salesCommitChange, salesReadReceipt } from './salesOperations';
import { salesRecordDecision } from './salesReviews';

const approvalOutcomeValidator = v.object({
  workspaceId: v.id('workspaces'),
  projectId: v.id('salesProjects'),
  snapshotId: v.id('salesReviewSnapshots'),
  gate: salesGateValidator,
  decision: salesDecisionInputValidator.fields.decision,
  approverId: v.id('workspaceMembers'),
  externalDecisionId: v.string(),
});

type ApprovalOutcome = Infer<typeof approvalOutcomeValidator>;

const salesApprover = (
  project: SalesProject,
  account: Doc<'workspaceCompanies'>,
  approver: Doc<'workspaceMembers'> | null,
) => {
  if (
    approver === null ||
    approver.workspaceId !== project.workspaceId ||
    approver.active === false ||
    approver.role !== 'manager' ||
    !canAccessAccount(approver, account)
  )
    throw new ConvexError('SALES_APPROVER_NOT_AUTHORIZED');
  return approver;
};

const salesApprovalTarget = async (
  context: MutationCtx,
  args: ApprovalOutcome,
) => {
  const project = await context.db.get(args.projectId);
  if (project === null || project.workspaceId !== args.workspaceId)
    throw new ConvexError('SALES_PROJECT_NOT_FOUND');
  const account = await context.db.get(project.accountId);
  if (account === null) throw new ConvexError('SALES_PROJECT_NOT_FOUND');
  return { project, account };
};

const salesAppliedRevision = async (
  context: MutationCtx,
  approver: Doc<'workspaceMembers'> | null,
  args: ApprovalOutcome,
  payload: string,
) => {
  if (approver === null || approver.workspaceId !== args.workspaceId)
    return null;
  const receipt = await salesReadReceipt(
    context,
    approver,
    `approval:${args.externalDecisionId}`,
    payload,
  );
  return receipt?.revision ?? null;
};

const salesValidatedDecision = async (
  context: MutationCtx,
  target: { project: SalesProject; account: Doc<'workspaceCompanies'> },
  approver: Doc<'workspaceMembers'> | null,
  args: ApprovalOutcome,
) => {
  const { project, account } = target;
  const member = salesApprover(project, account, approver);
  if (account.deletedAt !== null)
    throw new ConvexError('SALES_PROJECT_NOT_FOUND');
  const review =
    args.gate === 'pricing' ? project.pricingReview : project.orderReview;
  if (review?.snapshotId !== args.snapshotId)
    throw new ConvexError('SALES_REVIEW_NOT_CURRENT');
  await salesRecordDecision(
    { context, member, account, project },
    {
      gate: args.gate,
      decision: args.decision,
      evidenceReference: args.externalDecisionId,
      simulation: false,
    },
  );
  return member;
};

export const applyApprovalOutcome = internalMutation({
  args: approvalOutcomeValidator.fields,
  returns: v.union(
    v.object({ status: v.literal('applied'), revision: v.number() }),
    v.object({ status: v.literal('not-applied'), reason: v.string() }),
  ),
  handler: async (context, args) => {
    const target = await salesApprovalTarget(context, args);
    const approver = await context.db.get(args.approverId);
    const payload = operationPayload({ ...args, operation: 'approval' });
    const applied = await salesAppliedRevision(
      context,
      approver,
      args,
      payload,
    );
    if (applied !== null)
      return { status: 'applied' as const, revision: applied };
    const fromStage = target.project.stage;
    let member: Doc<'workspaceMembers'>;
    try {
      member = await salesValidatedDecision(context, target, approver, args);
    } catch (error) {
      if (error instanceof ConvexError && typeof error.data === 'string')
        return { status: 'not-applied' as const, reason: error.data };
      throw error;
    }
    const revision = await salesCommitChange(context, member, {
      project: target.project,
      fromStage,
      command: {
        type: 'applyApprovalOutcome',
        gate: args.gate,
        decision: args.decision,
        externalDecisionId: args.externalDecisionId,
      },
      previousQuote: null,
      snapshotId: args.snapshotId,
      operationId: `approval:${args.externalDecisionId}`,
      payload,
    });
    return { status: 'applied' as const, revision };
  },
});
