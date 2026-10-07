import { expect, it, vi } from 'vitest';

import { salesActor } from '../testing/accountFixtures';
import { salesFixture, SALES_QUOTE } from '../testing/salesFixtures';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';

const pendingPricingReview = async () => {
  const fixture = await salesFixture();
  await fixture.command({ ...SALES_QUOTE, exceptionReason: 'Special price' });
  await fixture.command({ type: 'submitPricingReview' });
  const project = await fixture.get();
  if (project?.pricingReview == null) throw new Error('Missing review');
  const snapshotId = project.pricingReview.snapshotId;
  const apply = (
    externalDecisionId: string,
    approverId: Id<'workspaceMembers'> = fixture.manager.memberId,
    decision: 'approved' | 'rejected' = 'approved',
    reviewSnapshotId: Id<'salesReviewSnapshots'> = snapshotId,
  ) =>
    fixture.test.mutation(internal.salesApprovals.applyApprovalOutcome, {
      workspaceId: fixture.workspaceId,
      projectId: fixture.projectId,
      snapshotId: reviewSnapshotId,
      gate: 'pricing',
      decision,
      approverId,
      externalDecisionId,
    });
  const history = async () =>
    (
      await fixture.seller.session.query(api.salesProjects.history, {
        workspaceId: fixture.workspaceId,
        projectId: fixture.projectId,
        paginationOpts: { numItems: 50, cursor: null },
      })
    ).page;
  const snapshotCount = () =>
    fixture.test.run(
      async (context) =>
        (await context.db.query('salesReviewSnapshots').collect()).length,
    );
  return { ...fixture, snapshotId, apply, history, snapshotCount };
};

it('applies a verified external approval once and keeps the original approver across retries', async () => {
  const fixture = await pendingPricingReview();
  const before = await fixture.history();
  const results = await Promise.all([
    fixture.apply('feishu-instance-1'),
    fixture.apply('feishu-instance-1'),
  ]);
  expect(results).toEqual([
    { status: 'applied', revision: 4 },
    { status: 'applied', revision: 4 },
  ]);
  const project = await fixture.get();
  expect(project?.revision).toBe(4);
  expect(project?.pricingReview).toMatchObject({
    snapshotId: fixture.snapshotId,
    status: 'approved',
    decisions: [
      {
        gate: 'pricing',
        decision: 'approved',
        evidenceReference: 'feishu-instance-1',
        actorId: fixture.manager.memberId,
        simulation: false,
      },
    ],
  });
  const after = await fixture.history();
  expect(after).toHaveLength(before.length + 1);
  expect(after[0]).toMatchObject({
    actorId: fixture.manager.memberId,
    revision: 4,
    snapshotId: fixture.snapshotId,
    command: {
      type: 'applyApprovalOutcome',
      gate: 'pricing',
      decision: 'approved',
      externalDecisionId: 'feishu-instance-1',
    },
  });
  await expect(
    fixture.apply('feishu-instance-1', fixture.manager.memberId, 'rejected'),
  ).rejects.toThrow('OPERATION_ID_REUSED');
  expect(await fixture.history()).toHaveLength(before.length + 1);
  expect(await fixture.snapshotCount()).toBe(1);
  await fixture.command({
    type: 'markQuoteSent',
    evidenceReference: 'DEMO-email',
  });
  expect((await fixture.get())?.stage).toBe('quoted');
  await fixture.test.run((context) =>
    context.db.patch(fixture.manager.memberId, { active: false }),
  );
  expect(await fixture.apply('feishu-instance-1')).toEqual({
    status: 'applied',
    revision: 4,
  });
  expect(await fixture.history()).toHaveLength(before.length + 2);
});

it('refuses approvers without current manager authority in the same workspace', async () => {
  const fixture = await pendingPricingReview();
  const foreignManager = await salesActor(
    fixture.test,
    fixture.otherWorkspaceId,
    'manager',
    'Foreign manager',
  );
  const inactiveManager = await salesActor(
    fixture.test,
    fixture.workspaceId,
    'manager',
    'Former manager',
  );
  await fixture.test.run((context) =>
    context.db.patch(inactiveManager.memberId, { active: false }),
  );
  for (const approverId of [
    fixture.seller.memberId,
    fixture.other.memberId,
    foreignManager.memberId,
    inactiveManager.memberId,
  ])
    expect(await fixture.apply(`denied-${approverId}`, approverId)).toEqual({
      status: 'not-applied',
      reason: 'SALES_APPROVER_NOT_AUTHORIZED',
    });
  expect((await fixture.get())?.revision).toBe(3);
});

it('reports stale snapshots and revoked requesters as not applied without a write or a new approval', async () => {
  const fixture = await pendingPricingReview();
  await fixture.command({
    ...SALES_QUOTE,
    unitPriceMinor: 150,
    exceptionReason: 'Revised price',
  });
  expect(await fixture.apply('feishu-stale')).toEqual({
    status: 'not-applied',
    reason: 'SALES_REVIEW_NOT_CURRENT',
  });
  expect((await fixture.get())?.revision).toBe(4);
  await fixture.command({ type: 'submitPricingReview' });
  const current = (await fixture.get())?.pricingReview?.snapshotId;
  if (current === undefined) throw new Error('Missing review');
  await fixture.test.run((context) =>
    context.db.patch(fixture.seller.memberId, { active: false }),
  );
  expect(
    await fixture.apply(
      'feishu-revoked',
      fixture.manager.memberId,
      'approved',
      current,
    ),
  ).toEqual({
    status: 'not-applied',
    reason: 'SALES_REQUESTER_ACCESS_CHANGED',
  });
  expect(await fixture.snapshotCount()).toBe(2);
  expect((await fixture.get())?.pricingReview?.status).toBe('pending');
});

it('refuses simulated decisions and never lets them unlock an approval-controlled change outside the demo', async () => {
  const fixture = await pendingPricingReview();
  const decide = () =>
    fixture.command(
      {
        type: 'simulateReviewDecision',
        gate: 'pricing',
        decision: 'approved',
        evidenceReference: 'DEMO-pricing',
      },
      fixture.manager,
    );
  vi.stubEnv('FENFORCE_SALES_SIMULATION_ENABLED', '');
  await expect(decide()).rejects.toThrow('SALES_SIMULATION_DISABLED');
  vi.stubEnv('FENFORCE_SALES_SIMULATION_ENABLED', 'true');
  await decide();
  vi.stubEnv('FENFORCE_SALES_SIMULATION_ENABLED', '');
  await expect(
    fixture.command({ type: 'markQuoteSent', evidenceReference: 'DEMO' }),
  ).rejects.toThrow('SALES_SIMULATED_APPROVAL');
  expect(await fixture.get()).toMatchObject({
    stage: 'qualified',
    blockers: expect.arrayContaining(['SALES_SIMULATED_APPROVAL']),
  });
});

it('reports a snapshot whose project revision moved as not applied', async () => {
  const fixture = await pendingPricingReview();
  await fixture.command({
    type: 'setNextAction',
    text: 'Chase approval',
    dueDate: '2099-10-11',
  });
  expect(await fixture.apply('feishu-moved')).toEqual({
    status: 'not-applied',
    reason: 'SALES_REVIEW_NOT_CURRENT',
  });
  expect(await fixture.get()).toMatchObject({
    revision: 4,
    pricingReview: { status: 'pending', decisions: [] },
  });
});

it('refuses manager self-approval through the integration seam', async () => {
  const fixture = await pendingPricingReview();
  const { manager } = fixture;
  await fixture.command(
    { ...SALES_QUOTE, unitPriceMinor: 175, exceptionReason: 'Manager price' },
    manager,
  );
  await fixture.command({ type: 'submitPricingReview' }, manager);
  const snapshotId = (await fixture.get())?.pricingReview?.snapshotId;
  if (snapshotId === undefined) throw new Error('Missing review');
  expect(
    await fixture.apply(
      'feishu-self',
      manager.memberId,
      'approved',
      snapshotId,
    ),
  ).toEqual({ status: 'not-applied', reason: 'SALES_SELF_APPROVAL' });
});
