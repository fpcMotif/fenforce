import workflowTest from '@convex-dev/workflow/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { internal } from './_generated/api';
import type { ActionCtx } from './_generated/server';
import {
  APPROVAL_RETENTION_MS,
  APPROVAL_STEP_TIMEOUT_MS,
  APPROVAL_TIMEOUT_MS,
} from './approvalContract';
import * as approvalEffects from './approvalEffects';
import * as approvalLedger from './approvalLedger';
import * as approvalWorkflow from './approvalWorkflow';
import schema from './schema';
import { workflow } from './workflowRuntime';

const modules = import.meta.glob('./**/*.ts');

const createFixture = async (instanceId: string) => {
  const test = convexTest(schema, modules);
  workflowTest.register(test);
  const started = await test.mutation(internal.approvalWorkflow.start, {
    instanceId,
  });
  return { test, ...started };
};

type Fixture = Awaited<ReturnType<typeof createFixture>>;

const createSignal = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const snapshot = ({ test, runId }: Fixture) =>
  test.query(internal.approvalLedger.snapshot, { runId });

const reachDecisionWait = async (fixture: Fixture) => {
  for (let iteration = 0; iteration < 100; iteration += 1) {
    vi.advanceTimersByTime(1_000);
    await fixture.test.finishInProgressScheduledFunctions();
    const current = await snapshot(fixture);

    if (current.expiresAt !== null) {
      expect(current.preparationAttempts).toBe(2);
      expect(current.decision).toBe('pending');
      return current;
    }
  }

  throw new Error('Workflow did not reach its decision wait');
};

const finish = async (fixture: Fixture) => {
  for (let iteration = 0; iteration < 100; iteration += 1) {
    await fixture.test.finishInProgressScheduledFunctions();
    const status = await fixture.test.query((context) =>
      workflow.status(context, fixture.workflowId),
    );

    if (
      status.type !== 'inProgress' &&
      (await snapshot(fixture)).lifecycle !== 'running'
    ) {
      return;
    }

    vi.advanceTimersToNextTimer();
  }

  throw new Error('Workflow did not reach a terminal state');
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('synthetic approval on Convex Workflow', () => {
  it('retries committed preparation and lost acknowledgement without duplicate delivery', async () => {
    const fixture = await createFixture('approved');
    const waiting = await reachDecisionWait(fixture);
    expect(waiting.expiresAt).toBe(Date.now() + APPROVAL_TIMEOUT_MS);
    await fixture.test.mutation(internal.approvalWorkflow.decide, {
      runId: fixture.runId,
      payload: true,
    });
    await finish(fixture);

    expect(await snapshot(fixture)).toMatchObject({
      decision: 'approved',
      lifecycle: 'completed',
      preparationAttempts: 2,
      deliveryAttempts: 2,
      deliveryCount: 1,
      receiptId: 'synthetic-receipt:approval:approved',
      error: null,
    });
    expect(
      await fixture.test.query((context) =>
        workflow.status(context, fixture.workflowId),
      ),
    ).toEqual({
      type: 'completed',
      result: {
        instanceId: 'approved',
        decision: 'approved',
        preparationAttempts: 2,
        deliveryAttempts: 2,
        deliveryCount: 1,
        receiptId: 'synthetic-receipt:approval:approved',
      },
    });
  });

  it('rejects without attempting or storing delivery', async () => {
    const fixture = await createFixture('rejected');
    await reachDecisionWait(fixture);
    await fixture.test.mutation(internal.approvalWorkflow.decide, {
      runId: fixture.runId,
      payload: false,
    });
    await finish(fixture);
    expect(await snapshot(fixture)).toMatchObject({
      decision: 'rejected',
      lifecycle: 'completed',
      preparationAttempts: 2,
      deliveryAttempts: 0,
      deliveryCount: 0,
      receiptId: null,
    });
  });

  it('records one failed validation step for a malformed decision and never delivers', async () => {
    const fixture = await createFixture('invalid');
    await reachDecisionWait(fixture);
    await fixture.test.mutation(internal.approvalWorkflow.decide, {
      runId: fixture.runId,
      payload: 'yes',
    });
    await finish(fixture);
    expect(await snapshot(fixture)).toMatchObject({
      decision: 'invalid',
      lifecycle: 'failed',
      error: expect.stringContaining('Approval payload must be a boolean'),
      deliveryAttempts: 0,
      deliveryCount: 0,
    });
    const steps = await fixture.test.query((context) =>
      workflow.listSteps(context, fixture.workflowId),
    );
    const validations = steps.page.filter(
      ({ name }) => name === 'validate-approval',
    );
    expect(validations).toHaveLength(1);
    expect(validations[0]?.runResult).toMatchObject({ kind: 'failed' });
    expect(steps.page.some(({ name }) => name.startsWith('deliver'))).toBe(
      false,
    );
  });

  it('times out after fifteen minutes without accepting a late decision', async () => {
    const fixture = await createFixture('timeout');
    const waiting = await reachDecisionWait(fixture);
    vi.setSystemTime(waiting.expiresAt ?? Date.now());
    await expect(
      fixture.test.mutation(internal.approvalWorkflow.decide, {
        runId: fixture.runId,
        payload: true,
      }),
    ).rejects.toThrow('APPROVAL_TIMED_OUT');
    await finish(fixture);
    expect(await snapshot(fixture)).toMatchObject({
      decision: 'timedOut',
      lifecycle: 'failed',
      error: expect.stringContaining('APPROVAL_TIMED_OUT'),
      deliveryAttempts: 0,
      deliveryCount: 0,
    });
  });

  it('accepts a decision before the deadline and ignores a later timeout', async () => {
    const fixture = await createFixture('deadline-race');
    const waiting = await reachDecisionWait(fixture);
    vi.setSystemTime((waiting.expiresAt ?? Date.now()) - 1);
    await fixture.test.mutation(internal.approvalWorkflow.decide, {
      runId: fixture.runId,
      payload: true,
    });
    await finish(fixture);
    expect(await snapshot(fixture)).toMatchObject({
      decision: 'approved',
      lifecycle: 'completed',
      deliveryCount: 1,
    });
  });

  it('deduplicates starts and identical decisions while rejecting conflicting decisions', async () => {
    const fixture = await createFixture('duplicates');
    expect(
      await fixture.test.mutation(internal.approvalWorkflow.start, {
        instanceId: 'duplicates',
      }),
    ).toEqual({ runId: fixture.runId, workflowId: fixture.workflowId });
    await reachDecisionWait(fixture);

    for (let index = 0; index < 2; index += 1) {
      await fixture.test.mutation(internal.approvalWorkflow.decide, {
        runId: fixture.runId,
        payload: true,
      });
    }

    await expect(
      fixture.test.mutation(internal.approvalWorkflow.decide, {
        runId: fixture.runId,
        payload: false,
      }),
    ).rejects.toThrow('APPROVAL_ALREADY_DECIDED');
    await finish(fixture);
    await fixture.test.mutation(internal.approvalWorkflow.decide, {
      runId: fixture.runId,
      payload: true,
    });
    expect(await snapshot(fixture)).toMatchObject({
      lifecycle: 'completed',
      preparationAttempts: 2,
      deliveryAttempts: 2,
      deliveryCount: 1,
    });
    const steps = await fixture.test.query((context) =>
      workflow.listSteps(context, fixture.workflowId),
    );
    expect(steps.page.filter(({ name }) => name === 'approval')).toHaveLength(
      1,
    );
  });

  it('retains a decision sent before the workflow reaches its wait', async () => {
    const fixture = await createFixture('early-decision');
    await fixture.test.mutation(internal.approvalWorkflow.decide, {
      runId: fixture.runId,
      payload: true,
    });
    await finish(fixture);
    expect(await snapshot(fixture)).toMatchObject({
      lifecycle: 'completed',
      decision: 'approved',
      preparationAttempts: 2,
      deliveryCount: 1,
    });
  });

  it('cannot deliver a rejected run or use a different logical operation', async () => {
    const fixture = await createFixture('invalid-delivery');
    await expect(
      fixture.test.mutation(internal.approvalLedger.deliver, {
        runId: fixture.runId,
        operationId: 'approval:invalid-delivery',
      }),
    ).rejects.toThrow('APPROVAL_REQUIRED');
    await fixture.test.mutation(internal.approvalWorkflow.decide, {
      runId: fixture.runId,
      payload: true,
    });
    await expect(
      fixture.test.mutation(internal.approvalLedger.deliver, {
        runId: fixture.runId,
        operationId: 'approval:another-run',
      }),
    ).rejects.toThrow('INVALID_DELIVERY_OPERATION');
    await finish(fixture);
  });

  it('does not expose workflow control or synthetic effects as public functions', () => {
    const functions = [
      approvalWorkflow.start,
      approvalWorkflow.run,
      approvalWorkflow.decide,
      approvalWorkflow.complete,
      approvalEffects.prepare,
      approvalEffects.deliver,
      approvalLedger.prepare,
      approvalLedger.deliver,
      approvalLedger.validateDecision,
      approvalLedger.waitForDecision,
      approvalLedger.expire,
      approvalLedger.cleanup,
      approvalLedger.snapshot,
    ];

    for (const registeredFunction of functions) {
      expect(registeredFunction).toHaveProperty('isInternal', true);
      expect(registeredFunction).not.toHaveProperty('isPublic', true);
    }
  });
});

describe('cancellation and terminal workflow runs', () => {
  it('keeps canceled waits unchanged when decisions and timeout callbacks arrive', async () => {
    const fixture = await createFixture('cancel-waiting');
    const waiting = await reachDecisionWait(fixture);
    await fixture.test.mutation((context) =>
      workflow.cancel(context, fixture.workflowId),
    );
    await expect(
      fixture.test.mutation(internal.approvalWorkflow.decide, {
        runId: fixture.runId,
        payload: true,
      }),
    ).rejects.toThrow('APPROVAL_RUN_NOT_ACTIVE');
    await expect(
      fixture.test.mutation(internal.approvalLedger.prepare, {
        runId: fixture.runId,
      }),
    ).rejects.toThrow('APPROVAL_RUN_NOT_ACTIVE');
    vi.setSystemTime(waiting.expiresAt ?? Date.now());
    await fixture.test.mutation(internal.approvalLedger.expire, {
      runId: fixture.runId,
    });
    await finish(fixture);
    expect(await snapshot(fixture)).toEqual({
      ...waiting,
      lifecycle: 'canceled',
    });
  });

  it('prevents a first delivery after an approved run is canceled', async () => {
    const fixture = await createFixture('cancel-before-delivery');
    await reachDecisionWait(fixture);
    await fixture.test.mutation(internal.approvalWorkflow.decide, {
      runId: fixture.runId,
      payload: true,
    });
    await fixture.test.mutation((context) =>
      workflow.cancel(context, fixture.workflowId),
    );
    await expect(
      fixture.test.mutation(internal.approvalLedger.deliver, {
        runId: fixture.runId,
        operationId: 'approval:cancel-before-delivery',
      }),
    ).rejects.toThrow('APPROVAL_RUN_NOT_ACTIVE');
    await finish(fixture);
    expect(await snapshot(fixture)).toMatchObject({
      decision: 'approved',
      lifecycle: 'canceled',
      deliveryAttempts: 0,
      deliveryCount: 0,
      receiptId: null,
    });
  });

  it('preserves a committed receipt when cancellation wins before an acknowledgement retry', async () => {
    const fixture = await createFixture('cancel-after-delivery');
    await reachDecisionWait(fixture);
    await fixture.test.mutation(internal.approvalWorkflow.decide, {
      runId: fixture.runId,
      payload: true,
    });
    const delivery = {
      runId: fixture.runId,
      operationId: 'approval:cancel-after-delivery',
    };
    await expect(
      fixture.test.action(internal.approvalEffects.deliver, delivery),
    ).rejects.toThrow('Synthetic failure after delivery was committed');
    await fixture.test.mutation((context) =>
      workflow.cancel(context, fixture.workflowId),
    );
    await expect(
      fixture.test.action(internal.approvalEffects.deliver, delivery),
    ).rejects.toThrow('APPROVAL_RUN_NOT_ACTIVE');
    await finish(fixture);
    const canceled = await snapshot(fixture);
    expect(canceled).toMatchObject({
      lifecycle: 'canceled',
      deliveryAttempts: 1,
      deliveryCount: 1,
      receiptId: 'synthetic-receipt:approval:cancel-after-delivery',
    });
    await fixture.test.mutation(internal.approvalWorkflow.decide, {
      runId: fixture.runId,
      payload: true,
    });
    expect(await snapshot(fixture)).toEqual(canceled);
  });

  it('rejects an unsupported raw restart without changing a completed run', async () => {
    const fixture = await createFixture('completed-restart');
    await fixture.test.mutation(internal.approvalWorkflow.decide, {
      runId: fixture.runId,
      payload: true,
    });
    await finish(fixture);
    const completed = await snapshot(fixture);
    await fixture.test.mutation((context) =>
      workflow.restart(context, fixture.workflowId, { from: 0 }),
    );
    await finish(fixture);
    expect(await snapshot(fixture)).toEqual(completed);
    expect(
      await fixture.test.query((context) =>
        workflow.status(context, fixture.workflowId),
      ),
    ).toMatchObject({
      type: 'failed',
      error: expect.stringContaining('APPROVAL_RUN_NOT_ACTIVE'),
    });
  });
});

describe('bounded action waits and terminal retention', () => {
  it.each(['prepare', 'deliver'] as const)(
    'bounds %s acknowledgement waiting without retracting a committed write',
    async (operation) => {
      expect(APPROVAL_STEP_TIMEOUT_MS).toBe(30_000);
      const fixture = await createFixture(`timeout-after-${operation}`);
      await reachDecisionWait(fixture);

      if (operation === 'deliver') {
        await fixture.test.mutation((context) =>
          context.db.patch(fixture.runId, {
            decision: 'approved',
            decisionPayload: true,
          }),
        );
      }

      const committed = createSignal();
      const acknowledgement = createSignal();
      const attempt =
        operation === 'prepare'
          ? approvalEffects.prepareAttempt
          : approvalEffects.deliverAttempt;
      const args = {
        runId: fixture.runId,
        operationId: `approval:timeout-after-${operation}`,
      };
      let settled = false;
      const pending = fixture.test
        .action((context) => {
          const runMutation: ActionCtx['runMutation'] = async (
            reference,
            mutationArgs,
          ) => {
            const result = await context.runMutation(reference, mutationArgs);
            committed.resolve();
            await acknowledgement.promise;
            return result;
          };
          return attempt({ ...context, runMutation }, args);
        })
        .finally(() => {
          settled = true;
        });
      const timedOut = expect(pending).rejects.toMatchObject({
        _tag: 'TimeoutError',
      });
      await committed.promise;
      const uncertain = await snapshot(fixture);
      await vi.advanceTimersByTimeAsync(APPROVAL_STEP_TIMEOUT_MS - 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toBe(true);
      await timedOut;
      acknowledgement.resolve();
      await fixture.test.action((context) => attempt(context, args));
      const retried = await snapshot(fixture);

      if (operation === 'deliver') {
        expect(uncertain.deliveryCount).toBe(1);
        expect(retried).toMatchObject({
          deliveryAttempts: 2,
          deliveryCount: 1,
          receiptId: uncertain.receiptId,
        });
      } else {
        expect(uncertain.preparationAttempts).toBe(3);
        expect(retried.preparationAttempts).toBe(4);
      }

      await fixture.test.mutation((context) =>
        workflow.cancel(context, fixture.workflowId),
      );
      await finish(fixture);
    },
  );

  it.each(['completed', 'failed', 'canceled'] as const)(
    'retains a %s run for twenty-four hours and then cleans up its workflow and ledger',
    async (lifecycle) => {
      expect(APPROVAL_RETENTION_MS).toBe(86_400_000);
      const fixture = await createFixture(`retention-${lifecycle}`);
      await reachDecisionWait(fixture);

      if (lifecycle === 'canceled') {
        await fixture.test.mutation((context) =>
          workflow.cancel(context, fixture.workflowId),
        );
      } else {
        await fixture.test.mutation(internal.approvalWorkflow.decide, {
          runId: fixture.runId,
          payload: lifecycle === 'completed' ? false : 'yes',
        });
      }

      await finish(fixture);
      const terminal = await fixture.test.query((context) =>
        context.db.get(fixture.runId),
      );
      expect(terminal).toMatchObject({
        lifecycle,
        retentionExpiresAt: Date.now() + APPROVAL_RETENTION_MS,
      });
      await fixture.test.mutation(internal.approvalLedger.cleanup, {
        runId: fixture.runId,
      });
      await vi.advanceTimersByTimeAsync(APPROVAL_RETENTION_MS - 1);
      await fixture.test.finishInProgressScheduledFunctions();
      expect(
        await fixture.test.query((context) => context.db.get(fixture.runId)),
      ).toEqual(terminal);
      await vi.advanceTimersByTimeAsync(1);
      await fixture.test.finishInProgressScheduledFunctions();
      expect(
        await fixture.test.query((context) => context.db.get(fixture.runId)),
      ).toBeNull();
      await expect(
        fixture.test.query((context) =>
          workflow.status(context, fixture.workflowId),
        ),
      ).rejects.toThrow('not found');
      expect(
        await fixture.test.query((context) =>
          workflow.listSteps(context, fixture.workflowId),
        ),
      ).toMatchObject({ page: [] });
      await fixture.test.mutation(internal.approvalLedger.cleanup, {
        runId: fixture.runId,
      });
    },
  );

  it('never deletes a running ledger, even with an expired retention timestamp', async () => {
    const fixture = await createFixture('retain-active');
    await reachDecisionWait(fixture);
    const before = await snapshot(fixture);
    await fixture.test.mutation((context) =>
      context.db.patch(fixture.runId, { retentionExpiresAt: Date.now() - 1 }),
    );
    await fixture.test.mutation(internal.approvalLedger.cleanup, {
      runId: fixture.runId,
    });
    expect(await snapshot(fixture)).toEqual(before);
    expect(
      await fixture.test.query((context) =>
        workflow.status(context, fixture.workflowId),
      ),
    ).toMatchObject({ type: 'inProgress' });
    await fixture.test.mutation((context) =>
      workflow.cancel(context, fixture.workflowId),
    );
    await finish(fixture);
  });

  it('requires component cleanup success before deleting a terminal ledger', async () => {
    const fixture = await createFixture('retain-restarted-component');
    await fixture.test.mutation(internal.approvalWorkflow.decide, {
      runId: fixture.runId,
      payload: false,
    });
    await finish(fixture);
    const terminal = await snapshot(fixture);
    await fixture.test.mutation((context) =>
      context.db.patch(fixture.runId, { retentionExpiresAt: Date.now() - 1 }),
    );
    await fixture.test.mutation((context) =>
      workflow.restart(context, fixture.workflowId, { from: 0 }),
    );
    await fixture.test.mutation(internal.approvalLedger.cleanup, {
      runId: fixture.runId,
    });
    expect(await snapshot(fixture)).toEqual(terminal);
    await finish(fixture);
    await fixture.test.mutation(internal.approvalLedger.cleanup, {
      runId: fixture.runId,
    });
    expect(
      await fixture.test.query((context) => context.db.get(fixture.runId)),
    ).toBeNull();
  });
});
