import { isBoolean } from '@sniptt/guards';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { DurableObject, WorkflowEntrypoint } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import { Effect } from 'effect';

import { SyntheticWorkflowFailure } from './synthetic-workflow-failure';

type Environment = {
  EXPERIMENT_LEDGER: DurableObjectNamespace<ExperimentLedger>;
};

type Delivery = {
  operationId: string;
  receiptId: string;
};

type LedgerSnapshot = {
  preparationAttempts: number;
  deliveryAttempts: number;
  deliveryCount: number;
  receiptId: string | null;
};

const STEP_OPTIONS = {
  retries: { limit: 2, delay: '1 second', backoff: 'constant' },
  timeout: '30 seconds',
} as const;

export class ExperimentLedger extends DurableObject<Environment> {
  async prepare(): Promise<number> {
    return await this.ctx.storage.transaction(async (transaction) => {
      const attempts = ((await transaction.get<number>('preparationAttempts')) ?? 0) + 1;
      await transaction.put('preparationAttempts', attempts);
      await transaction.setAlarm(Date.now() + 24 * 60 * 60 * 1000);
      return attempts;
    });
  }

  async deliver(operationId: string): Promise<{
    attempts: number;
    receiptId: string;
  }> {
    return await this.ctx.storage.transaction(async (transaction) => {
      const attempts = ((await transaction.get<number>('deliveryAttempts')) ?? 0) + 1;
      const delivery = (await transaction.get<Delivery>('delivery')) ?? {
        operationId,
        receiptId: `synthetic-receipt:${operationId}`,
      };

      if (delivery.operationId !== operationId) {
        throw new Error('A ledger accepts only one logical delivery');
      }

      await transaction.put({ deliveryAttempts: attempts, delivery });
      return { attempts, receiptId: delivery.receiptId };
    });
  }

  async snapshot(): Promise<LedgerSnapshot> {
    return await this.ctx.storage.transaction(async (transaction) => {
      const preparationAttempts = (await transaction.get<number>('preparationAttempts')) ?? 0;
      const deliveryAttempts = (await transaction.get<number>('deliveryAttempts')) ?? 0;
      const delivery = await transaction.get<Delivery>('delivery');
      return {
        preparationAttempts,
        deliveryAttempts,
        ...(delivery
          ? { deliveryCount: 1, receiptId: delivery.receiptId }
          : { deliveryCount: 0, receiptId: null }),
      };
    });
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}

export class ApprovalWorkflow extends WorkflowEntrypoint<Environment> {
  async run(event: WorkflowEvent<unknown>, step: WorkflowStep) {
    const ledger = this.env.EXPERIMENT_LEDGER.getByName(event.instanceId);

    await step.do(
      'prepare-with-transient-failure',
      STEP_OPTIONS,
      async () =>
        await Effect.runPromise(
          Effect.gen(function* prepareWithRetry() {
            const attempts = yield* Effect.tryPromise(async () => await ledger.prepare());
            if (attempts === 1) {
              return yield* Effect.fail(
                new SyntheticWorkflowFailure({ message: 'Synthetic transient failure' }),
              );
            }
            return { attempts };
          }),
        ),
    );

    const decision = await step.waitForEvent<boolean>('wait-for-approval', {
      type: 'approval',
      timeout: '15 minutes',
    });

    const approved = await step.do('validate-approval', async () => {
      if (!isBoolean(decision.payload)) {
        throw new NonRetryableError('Approval payload must be a boolean');
      }
      return decision.payload;
    });

    if (approved) {
      await step.do(
        'deliver-with-lost-acknowledgement',
        STEP_OPTIONS,
        async () =>
          await Effect.runPromise(
            Effect.gen(function* deliverWithRetry() {
              const delivery = yield* Effect.tryPromise(
                async () => await ledger.deliver(`approval:${event.instanceId}`),
              );
              if (delivery.attempts === 1) {
                return yield* Effect.fail(
                  new SyntheticWorkflowFailure({
                    message: 'Synthetic failure after delivery was committed',
                  }),
                );
              }
              return delivery;
            }),
          ),
      );
    }

    const snapshot = await step.do('read-ledger', async () => await ledger.snapshot());
    return {
      instanceId: event.instanceId,
      decision: approved ? 'approved' : 'rejected',
      ...snapshot,
    };
  }
}
