import { expect, it } from 'vitest';

import { salesActor } from '../testing/accountFixtures';
import { paginationOpts } from '../testing/contactFixtures';
import {
  salesApprove,
  salesFixture,
  salesQuoteAndOrder,
  SALES_QUOTE,
  type SalesFixture,
} from '../testing/salesFixtures';
import { api } from './_generated/api';
import type { SalesCommand } from './salesContract';

const accessChanges = [
  'disabled',
  'demoted',
  'foreign-workspace',
  'deleted',
] as const;
type AccessChange = (typeof accessChanges)[number];

const changeApproverAccess = async (
  fixture: SalesFixture,
  change: AccessChange,
) => {
  await fixture.test.run(async (context) => {
    const actorId = fixture.manager.memberId;
    switch (change) {
      case 'disabled':
        return context.db.patch(actorId, { active: false });
      case 'demoted':
        return context.db.patch(actorId, { role: 'seller' });
      case 'foreign-workspace':
        return context.db.patch(actorId, {
          workspaceId: fixture.otherWorkspaceId,
        });
      case 'deleted':
        return context.db.delete(actorId);
    }
  });
};

const persistedSalesState = (fixture: SalesFixture) =>
  fixture.test.run(async (context) => ({
    project: await context.db.get(fixture.projectId),
    events: await context.db.query('salesProjectEvents').collect(),
    receipts: await context.db.query('salesOperationReceipts').collect(),
    snapshots: await context.db.query('salesReviewSnapshots').collect(),
  }));

const runCommand = async (
  fixture: SalesFixture,
  command: SalesCommand,
  operationId: string,
  actor = fixture.seller,
) => {
  const project = await fixture.seller.session.query(api.salesProjects.get, {
    workspaceId: fixture.workspaceId,
    projectId: fixture.projectId,
  });
  if (project === null) throw new Error('Missing fixture project');
  return actor.session.mutation(api.salesProjects.execute, {
    workspaceId: fixture.workspaceId,
    projectId: fixture.projectId,
    expectedRevision: project.revision,
    operationId,
    command,
  });
};

const expectApprovalBlocked = async (
  fixture: SalesFixture,
  command: SalesCommand,
) => {
  const before = await persistedSalesState(fixture);
  const project = await fixture.seller.session.query(api.salesProjects.get, {
    workspaceId: fixture.workspaceId,
    projectId: fixture.projectId,
  });
  expect(project?.blockers).toContain('SALES_APPROVER_ACCESS_CHANGED');
  await expect(
    runCommand(fixture, command, 'blocked-consumption'),
  ).rejects.toThrow('SALES_APPROVER_ACCESS_CHANGED');
  expect(await persistedSalesState(fixture)).toEqual(before);
  return before;
};

const clearSample = (fixture: SalesFixture) =>
  fixture.command({
    type: 'recordSample',
    status: 'not-required',
    batchReference: '',
    coaReference: '',
    trackingReference: '',
    notes: 'Customer already qualified the material',
  });

it.each(accessChanges)(
  'blocks order confirmation atomically for a %s approver and permits fresh review',
  async (change) => {
    const fixture = await salesFixture();
    await salesQuoteAndOrder(fixture);
    await salesApprove(fixture);
    await clearSample(fixture);
    await changeApproverAccess(fixture, change);
    const command = {
      type: 'simulateCustomerConfirmation' as const,
      evidenceReference: 'DEMO-confirm',
    };
    const before = await expectApprovalBlocked(fixture, command);
    const replacement = await salesActor(
      fixture.test,
      fixture.workspaceId,
      'manager',
      'Replacement approver',
    );
    await runCommand(
      fixture,
      { type: 'submitOrderReview' },
      'fresh-order-review',
    );
    for (const gate of [
      'support',
      'management',
      'osbo',
      'finance',
      'supply',
    ] as const) {
      await runCommand(
        fixture,
        {
          type: 'simulateReviewDecision',
          gate,
          decision: 'approved',
          evidenceReference: `DEMO-fresh-${gate}`,
        },
        `fresh-${gate}`,
        replacement,
      );
    }
    await runCommand(fixture, command, 'fresh-confirmation');
    const after = await persistedSalesState(fixture);
    expect(after.project).toMatchObject({ stage: 'confirmed', outcome: 'won' });
    expect(after.project?.releases).toHaveLength(1);
    expect(after.events.slice(0, before.events.length)).toEqual(before.events);
    expect(after.snapshots.slice(0, before.snapshots.length)).toEqual(
      before.snapshots,
    );
    expect(after.project?.orderReview?.snapshotId).not.toBe(
      before.project?.orderReview?.snapshotId,
    );
  },
);

it.each(accessChanges)(
  'blocks quote sending atomically for a %s pricing approver and permits fresh review',
  async (change) => {
    const fixture = await salesFixture();
    await fixture.command({
      ...SALES_QUOTE,
      exceptionReason: 'Discount exception',
    });
    await fixture.command({ type: 'submitPricingReview' });
    await salesApprove(fixture, ['pricing']);
    await changeApproverAccess(fixture, change);
    const command = {
      type: 'markQuoteSent' as const,
      evidenceReference: 'DEMO-quote',
    };
    const before = await expectApprovalBlocked(fixture, command);
    const replacement = await salesActor(
      fixture.test,
      fixture.workspaceId,
      'manager',
      'Replacement pricing approver',
    );
    await runCommand(
      fixture,
      { type: 'submitPricingReview' },
      'fresh-pricing-review',
    );
    await runCommand(
      fixture,
      {
        type: 'simulateReviewDecision',
        gate: 'pricing',
        decision: 'approved',
        evidenceReference: 'DEMO-fresh-pricing',
      },
      'fresh-pricing',
      replacement,
    );
    await runCommand(fixture, command, 'fresh-quote-send');
    const after = await persistedSalesState(fixture);
    expect(after.project).toMatchObject({ stage: 'quoted', outcome: 'open' });
    expect(after.events.slice(0, before.events.length)).toEqual(before.events);
    expect(after.snapshots.slice(0, before.snapshots.length)).toEqual(
      before.snapshots,
    );
    expect(after.project?.pricingReview?.snapshotId).not.toBe(
      before.project?.pricingReview?.snapshotId,
    );
    const project = await fixture.seller.session.query(api.salesProjects.get, {
      workspaceId: fixture.workspaceId,
      projectId: fixture.projectId,
    });
    expect(project?.blockers).not.toContain('SALES_APPROVER_ACCESS_CHANGED');
  },
);

it.each(accessChanges)(
  'revalidates the %s pricing approver at confirmation when order approvers remain valid',
  async (change) => {
    const fixture = await salesFixture();
    await fixture.command({
      ...SALES_QUOTE,
      exceptionReason: 'Discount exception',
    });
    await fixture.command({ type: 'submitPricingReview' });
    await salesApprove(fixture, ['pricing']);
    await fixture.command({
      type: 'markQuoteSent',
      evidenceReference: 'DEMO-quote',
    });
    await fixture.command({
      type: 'capturePurchaseOrder',
      reference: 'PO',
      documentReference: 'DOC',
      qualityReference: 'SPEC',
      orderType: 'standard',
    });
    await fixture.command({ type: 'submitOrderReview' });
    const orderApprover = await salesActor(
      fixture.test,
      fixture.workspaceId,
      'manager',
      'Order approver',
    );
    for (const gate of [
      'support',
      'management',
      'osbo',
      'finance',
      'supply',
    ] as const) {
      await fixture.command(
        {
          type: 'simulateReviewDecision',
          gate,
          decision: 'approved',
          evidenceReference: `DEMO-${gate}`,
        },
        orderApprover,
      );
    }
    await clearSample(fixture);
    await changeApproverAccess(fixture, change);
    await expectApprovalBlocked(fixture, {
      type: 'simulateCustomerConfirmation',
      evidenceReference: 'DEMO-confirm',
    });
  },
);

it('projects actor names in paginated history without storing them in events', async () => {
  const fixture = await salesFixture();
  await salesQuoteAndOrder(fixture);
  await salesApprove(fixture, ['support']);
  const result = await fixture.seller.session.query(api.salesProjects.history, {
    workspaceId: fixture.workspaceId,
    projectId: fixture.projectId,
    paginationOpts,
  });
  expect(
    result.page.find((event) => event.actorId === fixture.manager.memberId)
      ?.actorName,
  ).toBe('Manager');
  expect(
    result.page.find((event) => event.actorId === fixture.seller.memberId)
      ?.actorName,
  ).toBe('Seller A');
  const stored = await persistedSalesState(fixture);
  expect(stored.events.every((event) => !('actorName' in event))).toBe(true);
});
