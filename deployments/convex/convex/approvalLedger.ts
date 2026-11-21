import { sendEvent } from '@convex-dev/workflow';
import { ConvexError, v } from 'convex/values';

import { components, internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import {
  APPROVAL_EVENT,
  APPROVAL_TIMEOUT_MS,
  decisionValidator,
  ledgerFields,
  lifecycleValidator,
} from './approvalContract';
import { workflow } from './workflowRuntime';

export const requireRun = async (
  context: MutationCtx | QueryCtx,
  runId: Id<'syntheticApprovalRuns'>,
) => {
  const run = await context.db.get(runId);

  if (run === null) {
    throw new ConvexError('APPROVAL_RUN_NOT_FOUND');
  }

  return run;
};

export const isRunActive = async (
  context: MutationCtx | QueryCtx,
  run: Doc<'syntheticApprovalRuns'>,
) =>
  run.lifecycle === 'running' &&
  run.workflowId !== undefined &&
  (await workflow.status(context, run.workflowId)).type === 'inProgress';

const requireActiveRun = async (
  context: MutationCtx,
  runId: Id<'syntheticApprovalRuns'>,
) => {
  const run = await requireRun(context, runId);

  if (!(await isRunActive(context, run))) {
    throw new ConvexError('APPROVAL_RUN_NOT_ACTIVE');
  }

  return run;
};

export const prepare = internalMutation({
  args: { runId: v.id('syntheticApprovalRuns') },
  returns: v.number(),
  handler: async (context, { runId }) => {
    const run = await requireActiveRun(context, runId);
    const attempts = run.preparationAttempts + 1;
    await context.db.patch(runId, { preparationAttempts: attempts });
    return attempts;
  },
});

export const validateDecision = internalMutation({
  args: { payload: v.union(v.boolean(), v.string()) },
  returns: v.boolean(),
  handler: (_context, { payload }) => {
    if (typeof payload !== 'boolean') {
      throw new ConvexError('Approval payload must be a boolean');
    }

    return payload;
  },
});

export const deliver = internalMutation({
  args: { runId: v.id('syntheticApprovalRuns'), operationId: v.string() },
  returns: v.object({ attempts: v.number(), receiptId: v.string() }),
  handler: async (context, { runId, operationId }) => {
    const run = await requireActiveRun(context, runId);

    if (run.decision !== 'approved') {
      throw new ConvexError('APPROVAL_REQUIRED');
    }

    if (operationId !== `approval:${run.instanceId}`) {
      throw new ConvexError('INVALID_DELIVERY_OPERATION');
    }

    if (run.operationId !== null && run.operationId !== operationId) {
      throw new ConvexError('CONFLICTING_DELIVERY_OPERATION');
    }

    const attempts = run.deliveryAttempts + 1;
    const receiptId = run.receiptId ?? `synthetic-receipt:${operationId}`;
    await context.db.patch(runId, {
      deliveryAttempts: attempts,
      deliveryCount:
        run.receiptId === null ? run.deliveryCount + 1 : run.deliveryCount,
      operationId,
      receiptId,
    });
    return { attempts, receiptId };
  },
});

export const waitForDecision = internalMutation({
  args: { runId: v.id('syntheticApprovalRuns') },
  returns: v.null(),
  handler: async (context, { runId }) => {
    const run = await requireRun(context, runId);

    if (
      run.decision === 'pending' &&
      run.expiresAt === null &&
      (await isRunActive(context, run))
    ) {
      const expiresAt = Date.now() + APPROVAL_TIMEOUT_MS;
      await context.db.patch(runId, { expiresAt });
      await context.scheduler.runAt(expiresAt, internal.approvalLedger.expire, {
        runId,
      });
    }

    return null;
  },
});

export const expire = internalMutation({
  args: { runId: v.id('syntheticApprovalRuns') },
  returns: v.null(),
  handler: async (context, { runId }) => {
    const run = await requireRun(context, runId);

    if (
      run.decision !== 'pending' ||
      run.expiresAt === null ||
      Date.now() < run.expiresAt
    ) {
      return null;
    }

    if (!(await isRunActive(context, run))) {
      return null;
    }

    if (run.workflowId === undefined) {
      throw new ConvexError('APPROVAL_WORKFLOW_NOT_STARTED');
    }

    await context.db.patch(runId, { decision: 'timedOut' });
    await sendEvent(context, components.workflow, {
      workflowId: run.workflowId,
      name: APPROVAL_EVENT,
      error: 'APPROVAL_TIMED_OUT',
    });
    return null;
  },
});

export const cleanup = internalMutation({
  args: { runId: v.id('syntheticApprovalRuns') },
  returns: v.null(),
  handler: async (context, { runId }) => {
    const run = await context.db.get(runId);

    if (
      run === null ||
      run.lifecycle === 'running' ||
      run.retentionExpiresAt === undefined ||
      Date.now() < run.retentionExpiresAt ||
      run.workflowId === undefined
    ) {
      return null;
    }

    if (await workflow.cleanup(context, run.workflowId)) {
      await context.db.delete(runId);
    }

    return null;
  },
});

export const snapshot = internalQuery({
  args: { runId: v.id('syntheticApprovalRuns') },
  returns: v.object({
    ...ledgerFields,
    decision: decisionValidator,
    lifecycle: lifecycleValidator,
    error: v.union(v.string(), v.null()),
    expiresAt: v.union(v.number(), v.null()),
  }),
  handler: async (context, { runId }) => {
    const run = await requireRun(context, runId);
    return {
      instanceId: run.instanceId,
      preparationAttempts: run.preparationAttempts,
      deliveryAttempts: run.deliveryAttempts,
      deliveryCount: run.deliveryCount,
      receiptId: run.receiptId,
      decision: run.decision,
      lifecycle: run.lifecycle,
      error: run.error,
      expiresAt: run.expiresAt,
    };
  },
});
