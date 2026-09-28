import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { isString } from '@sniptt/guards';
import { Schema } from 'effect';

const ROOT = path.resolve(import.meta.dir, '..');
const configuration = Schema.decodeUnknownSync(
  Schema.Struct({
    workflows: Schema.Array(Schema.Struct({ binding: Schema.String, name: Schema.String })),
  }),
)(Bun.JSONC.parse(await Bun.file(path.resolve(ROOT, 'wrangler.jsonc')).text()));
const workflow = configuration.workflows.find((entry) => entry.binding === 'APPROVAL_WORKFLOW');
assert.ok(workflow, 'Missing APPROVAL_WORKFLOW binding');
const WORKFLOW_NAME = workflow.name;
const TERMINAL_STATUSES = new Set(['complete', 'errored', 'terminated']);
const RUN_ID = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const EVIDENCE_PATH = path.resolve(ROOT, 'test-results', `${RUN_ID}.json`);

const INSTANCE_SCHEMA = Schema.Struct({
  id: Schema.String,
  status: Schema.String,
  output: Schema.optional(Schema.Unknown),
  error: Schema.Unknown,
  steps: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      type: Schema.String,
      finished: Schema.optional(Schema.Boolean),
      success: Schema.optional(Schema.NullOr(Schema.Boolean)),
      attempts: Schema.optional(
        Schema.Array(
          Schema.Struct({
            success: Schema.NullOr(Schema.Boolean),
            error: Schema.Unknown,
          }),
        ),
      ),
    }),
  ),
});

const RESULT_SCHEMA = Schema.Struct({
  instanceId: Schema.String,
  decision: Schema.Literals(['approved', 'rejected']),
  preparationAttempts: Schema.Number,
  deliveryAttempts: Schema.Number,
  deliveryCount: Schema.Number,
  receiptId: Schema.NullOr(Schema.String),
});

type WorkflowInstance = typeof INSTANCE_SCHEMA.Type;
type EvidenceEntry = {
  at: string;
  arguments: string[];
  exitCode: number;
  response: unknown;
  stderr: string;
};

const evidence: EvidenceEntry[] = [];
const createdInstances = new Set<string>();
const assertions: string[] = [];
let passed = false;
let failure: string | null = null;

async function wrangler(arguments_: string[]): Promise<string> {
  const child = Bun.spawn(
    [path.resolve(ROOT, 'node_modules/.bin/wrangler'), ...arguments_, '--json'],
    {
      cwd: ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, CI: 'true' },
      timeout: 45_000,
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  let response: unknown = stdout;
  try {
    response = JSON.parse(stdout);
  } catch {
    assert.notEqual(exitCode, 0, `Wrangler returned invalid JSON: ${stdout}`);
  }
  evidence.push({
    at: new Date().toISOString(),
    arguments: arguments_,
    exitCode,
    response,
    stderr,
  });
  assert.equal(exitCode, 0, `Wrangler failed: ${stderr}\n${stdout}`);
  return stdout;
}

async function describe(instanceId: string): Promise<WorkflowInstance> {
  return Schema.decodeUnknownSync(INSTANCE_SCHEMA)(
    JSON.parse(await wrangler(['workflows', 'instances', 'describe', WORKFLOW_NAME, instanceId])),
  );
}

async function waitFor(
  instanceId: string,
  label: string,
  predicate: (instance: WorkflowInstance) => boolean,
): Promise<WorkflowInstance> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const instance = await describe(instanceId);
    if (predicate(instance)) {
      return instance;
    }
    assert.ok(
      !TERMINAL_STATUSES.has(instance.status),
      `Unexpected terminal state while waiting for ${label}: ${JSON.stringify(instance)}`,
    );
    await Bun.sleep(2000);
  }
  throw new Error(`Timed out waiting for ${instanceId}: ${label}`);
}

async function start(label: string): Promise<string> {
  const instanceId = `${label}-${RUN_ID}`;
  await wrangler(['workflows', 'trigger', WORKFLOW_NAME, '--id', instanceId]);
  createdInstances.add(instanceId);
  const waiting = await waitFor(instanceId, 'approval wait', (instance) =>
    instance.steps.some((step) => step.type === 'waitForEvent' && step.finished === false),
  );
  const preparation = waiting.steps.find((step) =>
    step.name.startsWith('prepare-with-transient-failure-'),
  );
  assert.deepEqual(
    preparation?.attempts?.map((attempt) => attempt.success),
    [false, true],
  );
  assertions.push(`${label}: transient failure retried successfully`);
  console.log(`${label}: waiting for approval after one failed attempt and one success`);
  return instanceId;
}

async function decide(instanceId: string, payload: boolean | string): Promise<void> {
  await wrangler([
    'workflows',
    'instances',
    'send-event',
    WORKFLOW_NAME,
    instanceId,
    '--type',
    'approval',
    '--payload',
    JSON.stringify(payload),
  ]);
}

function result(instance: WorkflowInstance) {
  const output: unknown = isString(instance.output) ? JSON.parse(instance.output) : instance.output;
  return Schema.decodeUnknownSync(RESULT_SCHEMA)(output);
}

try {
  const approvedId = await start('approved');
  await wrangler(['workflows', 'instances', 'pause', WORKFLOW_NAME, approvedId]);
  await waitFor(approvedId, 'paused', (instance) => instance.status === 'paused');
  assertions.push('approved: provider confirmed paused state');
  await wrangler(['workflows', 'instances', 'resume', WORKFLOW_NAME, approvedId]);
  await decide(approvedId, true);
  const approved = await waitFor(
    approvedId,
    'completion',
    (instance) => instance.status === 'complete',
  );
  const approvedResult = result(approved);
  assert.deepEqual(approvedResult, {
    instanceId: approvedId,
    decision: 'approved',
    preparationAttempts: 2,
    deliveryAttempts: 2,
    deliveryCount: 1,
    receiptId: `synthetic-receipt:approval:${approvedId}`,
  });
  const delivery = approved.steps.find((step) =>
    step.name.startsWith('deliver-with-lost-acknowledgement-'),
  );
  assert.deepEqual(
    delivery?.attempts?.map((attempt) => attempt.success),
    [false, true],
  );
  assertions.push(
    'approved: resume reused completed preparation checkpoint',
    'approved: failure after delivery commit retried with exactly one stored delivery',
  );
  createdInstances.delete(approvedId);
  console.log('approved: pause/resume passed; two delivery attempts produced one receipt');

  const rejectedId = await start('rejected');
  await decide(rejectedId, false);
  const rejected = await waitFor(
    rejectedId,
    'completion',
    (instance) => instance.status === 'complete',
  );
  assert.deepEqual(result(rejected), {
    instanceId: rejectedId,
    decision: 'rejected',
    preparationAttempts: 2,
    deliveryAttempts: 0,
    deliveryCount: 0,
    receiptId: null,
  });
  assertions.push('rejected: no delivery attempted or stored');
  createdInstances.delete(rejectedId);
  console.log('rejected: completed with no delivery');

  const invalidId = await start('invalid');
  await decide(invalidId, 'yes');
  const invalid = await waitFor(
    invalidId,
    'validation failure',
    (instance) => instance.status === 'errored',
  );
  const validation = invalid.steps.find((step) => step.name.startsWith('validate-approval-'));
  assert.equal(validation?.attempts?.length, 1);
  assert.equal(validation?.attempts?.[0]?.success, false);
  assert.match(
    JSON.stringify(validation?.attempts?.[0]?.error),
    /Approval payload must be a boolean/u,
  );
  assert.ok(!invalid.steps.some((step) => step.name.startsWith('deliver-')));
  assertions.push('invalid: malformed approval failed once without reaching delivery');
  createdInstances.delete(invalidId);
  console.log('invalid: rejected without retrying or delivering');
  passed = true;
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
  console.error(failure);
} finally {
  for (const instanceId of createdInstances) {
    try {
      const instance = await describe(instanceId);
      if (!TERMINAL_STATUSES.has(instance.status)) {
        await wrangler(['workflows', 'instances', 'terminate', WORKFLOW_NAME, instanceId]);
      }
    } catch (error) {
      console.error(`Cleanup failed for ${instanceId}: ${String(error)}`);
    }
  }
  await mkdir(path.resolve(ROOT, 'test-results'), { recursive: true });
  await Bun.write(
    EVIDENCE_PATH,
    `${JSON.stringify(
      {
        runId: RUN_ID,
        workflow: WORKFLOW_NAME,
        passed,
        failure,
        assertions,
        evidence,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Evidence: ${EVIDENCE_PATH}`);
  console.log(
    passed ? 'PASS: all remote checks passed' : 'FAIL: inspect recorded provider responses',
  );
}
