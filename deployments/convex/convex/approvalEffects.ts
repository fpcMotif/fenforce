import { v } from 'convex/values';
import { Data, Effect } from 'effect';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalAction } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import { APPROVAL_STEP_TIMEOUT_MS } from './approvalContract';

class SyntheticWorkflowFailure extends Data.TaggedError(
  'SyntheticWorkflowFailure',
)<{
  readonly message: string;
}> {}

class ApprovalOperationFailure extends Data.TaggedError(
  'ApprovalOperationFailure',
)<{
  readonly message: string;
  readonly cause: unknown;
}> {}

const operationFailure = (cause: unknown) =>
  new ApprovalOperationFailure({
    message:
      cause instanceof Error ? cause.message : 'Approval operation failed',
    cause,
  });

export const prepareAttempt = async (
  context: Pick<ActionCtx, 'runMutation'>,
  { runId }: { runId: Id<'syntheticApprovalRuns'> },
): Promise<number> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const attempts = yield* Effect.tryPromise({
        try: () =>
          context.runMutation(internal.approvalLedger.prepare, { runId }),
        catch: operationFailure,
      });

      if (attempts === 1) {
        return yield* new SyntheticWorkflowFailure({
          message: 'Synthetic transient failure',
        });
      }

      return attempts;
    }).pipe(Effect.timeout(APPROVAL_STEP_TIMEOUT_MS)),
  );

export const prepare = internalAction({
  args: { runId: v.id('syntheticApprovalRuns') },
  returns: v.number(),
  handler: prepareAttempt,
});

export const deliverAttempt = async (
  context: Pick<ActionCtx, 'runMutation'>,
  args: { runId: Id<'syntheticApprovalRuns'>; operationId: string },
): Promise<{ attempts: number; receiptId: string }> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const delivery = yield* Effect.tryPromise({
        try: () => context.runMutation(internal.approvalLedger.deliver, args),
        catch: operationFailure,
      });

      if (delivery.attempts === 1) {
        return yield* new SyntheticWorkflowFailure({
          message: 'Synthetic failure after delivery was committed',
        });
      }

      return delivery;
    }).pipe(Effect.timeout(APPROVAL_STEP_TIMEOUT_MS)),
  );

export const deliver = internalAction({
  args: {
    runId: v.id('syntheticApprovalRuns'),
    operationId: v.string(),
  },
  returns: v.object({ attempts: v.number(), receiptId: v.string() }),
  handler: deliverAttempt,
});
