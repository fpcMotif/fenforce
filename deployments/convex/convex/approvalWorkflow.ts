import { sendEvent, vResultValidator, vWorkflowId } from '@convex-dev/workflow';
import type { WorkflowId } from '@convex-dev/workflow';
import { ConvexError, v } from 'convex/values';
import type { Infer } from 'convex/values';

import { components, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalMutation } from './_generated/server';
import {
  APPROVAL_EVENT,
  APPROVAL_RETENTION_MS,
  APPROVAL_RETRY,
  approvalResultValidator,
} from './approvalContract';
import { isRunActive, requireRun } from './approvalLedger';
import { workflow } from './workflowRuntime';

type ApprovalResult = Infer<typeof approvalResultValidator>;

export const run = workflow.define({
  args: { runId: v.id('syntheticApprovalRuns'), instanceId: v.string() },
  returns: approvalResultValidator,
  handler: async (step, { runId, instanceId }): Promise<ApprovalResult> => {
    await step.runAction(
      internal.approvalEffects.prepare,
      { runId },
      { name: 'prepare-with-transient-failure', retry: APPROVAL_RETRY },
    );
    await step.runMutation(internal.approvalLedger.waitForDecision, { runId });
    const payload = await step.awaitEvent({
      name: APPROVAL_EVENT,
      validator: v.union(v.boolean(), v.string()),
    });

    const decision = await step.runMutation(
      internal.approvalLedger.validateDecision,
      { payload },
      { name: 'validate-approval' },
    );

    if (decision) {
      await step.runAction(
        internal.approvalEffects.deliver,
        { runId, operationId: `approval:${instanceId}` },
        { name: 'deliver-with-lost-acknowledgement', retry: APPROVAL_RETRY },
      );
    }

    const snapshot = await step.runQuery(internal.approvalLedger.snapshot, {
      runId,
    });
    return {
      instanceId,
      decision: decision ? 'approved' : 'rejected',
      preparationAttempts: snapshot.preparationAttempts,
      deliveryAttempts: snapshot.deliveryAttempts,
      deliveryCount: snapshot.deliveryCount,
      receiptId: snapshot.receiptId,
    };
  },
});

export const complete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.object({ runId: v.id('syntheticApprovalRuns') }),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const run = await requireRun(context, args.context.runId);

    if (run.workflowId !== args.workflowId) {
      throw new ConvexError('APPROVAL_WORKFLOW_MISMATCH');
    }

    if (run.lifecycle !== 'running') {
      return null;
    }

    const retentionExpiresAt = Date.now() + APPROVAL_RETENTION_MS;
    await context.db.patch(run._id, {
      lifecycle:
        args.result.kind === 'success'
          ? 'completed'
          : args.result.kind === 'failed'
            ? 'failed'
            : 'canceled',
      error: args.result.kind === 'failed' ? args.result.error : null,
      retentionExpiresAt,
    });
    await context.scheduler.runAt(
      retentionExpiresAt,
      internal.approvalLedger.cleanup,
      { runId: run._id },
    );
    return null;
  },
});

export const start = internalMutation({
  args: { instanceId: v.string() },
  returns: v.object({
    runId: v.id('syntheticApprovalRuns'),
    workflowId: vWorkflowId,
  }),
  handler: async (
    context,
    { instanceId },
  ): Promise<{
    runId: Id<'syntheticApprovalRuns'>;
    workflowId: WorkflowId;
  }> => {
    if (instanceId.length === 0 || instanceId.length > 128) {
      throw new ConvexError('INVALID_INSTANCE_ID');
    }

    const existing = await context.db
      .query('syntheticApprovalRuns')
      .withIndex('by_instanceId', (index) => index.eq('instanceId', instanceId))
      .unique();

    if (existing?.workflowId !== undefined) {
      return { runId: existing._id, workflowId: existing.workflowId };
    }

    const runId = await context.db.insert('syntheticApprovalRuns', {
      instanceId,
      decision: 'pending',
      decisionPayload: null,
      lifecycle: 'running',
      error: null,
      expiresAt: null,
      preparationAttempts: 0,
      deliveryAttempts: 0,
      deliveryCount: 0,
      operationId: null,
      receiptId: null,
    });
    const workflowId = await workflow.start(
      context,
      internal.approvalWorkflow.run,
      { runId, instanceId },
      {
        onComplete: internal.approvalWorkflow.complete,
        context: { runId },
      },
    );
    await context.db.patch(runId, { workflowId });
    return { runId, workflowId };
  },
});

export const decide = internalMutation({
  args: {
    runId: v.id('syntheticApprovalRuns'),
    payload: v.union(v.boolean(), v.string()),
  },
  returns: v.null(),
  handler: async (context, { runId, payload }) => {
    const run = await requireRun(context, runId);

    if (run.decision !== 'pending') {
      if (run.decisionPayload === payload) {
        return null;
      }

      throw new ConvexError('APPROVAL_ALREADY_DECIDED');
    }

    if (!(await isRunActive(context, run))) {
      throw new ConvexError('APPROVAL_RUN_NOT_ACTIVE');
    }

    if (run.expiresAt !== null && Date.now() >= run.expiresAt) {
      throw new ConvexError('APPROVAL_TIMED_OUT');
    }

    if (run.workflowId === undefined) {
      throw new ConvexError('APPROVAL_WORKFLOW_NOT_STARTED');
    }

    await context.db.patch(runId, {
      decision:
        typeof payload === 'boolean'
          ? payload
            ? 'approved'
            : 'rejected'
          : 'invalid',
      decisionPayload: payload,
    });
    await sendEvent(context, components.workflow, {
      workflowId: run.workflowId,
      name: APPROVAL_EVENT,
      value: payload,
    });
    return null;
  },
});
