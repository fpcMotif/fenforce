import { expect, it } from 'vitest';

import { salesActor } from '../testing/accountFixtures';
import { paginationOpts } from '../testing/contactFixtures';
import {
  salesApprove,
  salesConfirm,
  salesFixture,
  salesQuoteAndOrder,
  SALES_QUOTE,
} from '../testing/salesFixtures';
import { api } from './_generated/api';

it('replays a simulated confirmation and SAP acceptance without duplicating events or releases', async () => {
  const fixture = await salesFixture();
  await salesQuoteAndOrder(fixture);
  await salesApprove(fixture);
  await fixture.command({
    type: 'recordSample',
    status: 'not-required',
    batchReference: '',
    coaReference: '',
    trackingReference: '',
    notes: 'Existing material qualification',
  });
  const before = await fixture.get();
  if (before === null) throw new Error('Missing fixture');
  const confirmation = {
    workspaceId: fixture.workspaceId,
    projectId: fixture.projectId,
    expectedRevision: before.revision,
    operationId: 'confirm-retry',
    command: {
      type: 'simulateCustomerConfirmation' as const,
      evidenceReference: 'DEMO-confirm',
    },
  };
  const accepted = await fixture.seller.session.mutation(
    api.salesProjects.execute,
    confirmation,
  );
  expect(
    await fixture.seller.session.mutation(
      api.salesProjects.execute,
      confirmation,
    ),
  ).toEqual(accepted);
  const sap = {
    ...confirmation,
    expectedRevision: accepted.revision,
    operationId: 'sap-retry',
    command: {
      type: 'simulateSapHandoff' as const,
      releaseReference: 'STANDARD',
      outcome: 'accepted' as const,
      evidenceReference: 'DEMO-SAP',
    },
  };
  const handedOff = await fixture.seller.session.mutation(
    api.salesProjects.execute,
    sap,
  );
  expect(
    await fixture.seller.session.mutation(api.salesProjects.execute, sap),
  ).toEqual(handedOff);
  const after = await fixture.get();
  expect(after?.revision).toBe(before.revision + 2);
  expect(after?.releases).toHaveLength(1);
  const history = await fixture.seller.session.query(
    api.salesProjects.history,
    {
      workspaceId: fixture.workspaceId,
      projectId: fixture.projectId,
      paginationOpts,
    },
  );
  expect(
    history.page.filter(
      (event) => event.command.type === 'simulateCustomerConfirmation',
    ),
  ).toHaveLength(1);
  expect(
    history.page.filter((event) => event.command.type === 'simulateSapHandoff'),
  ).toHaveLength(1);
});

it('allows only one concurrent edit at a known revision and commits its event and receipt together', async () => {
  const fixture = await salesFixture();
  const args = {
    workspaceId: fixture.workspaceId,
    projectId: fixture.projectId,
    expectedRevision: 1,
    operationId: 'concurrent-a',
    command: {
      type: 'logActivity' as const,
      kind: 'call' as const,
      text: 'Discussed application',
    },
  };
  const results = await Promise.allSettled([
    fixture.seller.session.mutation(api.salesProjects.execute, args),
    fixture.seller.session.mutation(api.salesProjects.execute, {
      ...args,
      operationId: 'concurrent-b',
    }),
  ]);
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(
    1,
  );
  const persisted = await fixture.test.run(async (context) => ({
    events: await context.db.query('salesProjectEvents').collect(),
    receipts: await context.db.query('salesOperationReceipts').collect(),
  }));
  expect(persisted.events).toHaveLength(2);
  expect(persisted.receipts).toHaveLength(2);
  expect((await fixture.get())?.revision).toBe(2);
});

it('requires evidence and refuses a second decision for an already decided gate', async () => {
  const fixture = await salesFixture();
  await salesQuoteAndOrder(fixture);
  await expect(
    fixture.command(
      {
        type: 'simulateReviewDecision',
        gate: 'support',
        decision: 'approved',
        evidenceReference: '  ',
      },
      fixture.manager,
    ),
  ).rejects.toThrow('SALES_TEXT_REQUIRED');
  await salesApprove(fixture, ['support']);
  await expect(salesApprove(fixture, ['support'])).rejects.toThrow(
    'SALES_GATE_ALREADY_DECIDED',
  );
  expect((await fixture.get())?.orderReview?.decisions).toHaveLength(1);
});

it('a corrected pending PO supersedes its snapshot and requires every gate again', async () => {
  const fixture = await salesFixture();
  await salesQuoteAndOrder(fixture);
  await salesApprove(fixture, ['support', 'management']);
  const snapshot = (await fixture.get())?.currentReview;
  await fixture.command({
    type: 'capturePurchaseOrder',
    reference: 'PO-2',
    documentReference: 'DOC-2',
    qualityReference: 'SPEC-2',
    orderType: 'blanket',
  });
  await expect(salesApprove(fixture, ['osbo'])).rejects.toThrow(
    'SALES_REVIEW_REQUIRED',
  );
  await fixture.command({ type: 'submitOrderReview' });
  await expect(salesApprove(fixture, ['osbo'])).rejects.toThrow(
    'SALES_REVIEW_GATE_ORDER',
  );
  expect((await fixture.get())?.currentReview?._id).not.toBe(snapshot?._id);
  expect((await fixture.get())?.orderReview?.decisions).toEqual([]);
  if (snapshot === null || snapshot === undefined)
    throw new Error('Missing snapshot');
  expect(
    await fixture.test.run((context) => context.db.get(snapshot._id)),
  ).toEqual(snapshot);
});

it('rechecks a non-owner requester at confirmation even after every gate passed', async () => {
  const fixture = await salesFixture();
  const secondManager = await salesActor(
    fixture.test,
    fixture.workspaceId,
    'manager',
    'Second manager',
  );
  await fixture.command(SALES_QUOTE);
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
  await fixture.command({ type: 'submitOrderReview' }, secondManager);
  await salesApprove(fixture);
  await fixture.command({
    type: 'recordSample',
    status: 'not-required',
    batchReference: '',
    coaReference: '',
    trackingReference: '',
    notes: 'Customer waived sample',
  });
  await fixture.test.run((context) =>
    context.db.patch(secondManager.memberId, { active: false }),
  );
  expect((await fixture.get())?.blockers).toContain(
    'SALES_REQUESTER_ACCESS_CHANGED',
  );
  await expect(
    fixture.command({
      type: 'simulateCustomerConfirmation',
      evidenceReference: 'DEMO-confirm',
    }),
  ).rejects.toThrow('SALES_REQUESTER_ACCESS_CHANGED');
  expect((await fixture.get())?.outcome).toBe('open');
});

it('shows a stale pricing requester even when the current review is the order review', async () => {
  const fixture = await salesFixture();
  const pricingRequester = await salesActor(
    fixture.test,
    fixture.workspaceId,
    'manager',
    'Pricing requester',
  );
  await fixture.command({ ...SALES_QUOTE, exceptionReason: 'Discount' });
  await fixture.command({ type: 'submitPricingReview' }, pricingRequester);
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
  await fixture.test.run((context) =>
    context.db.patch(pricingRequester.memberId, { active: false }),
  );
  expect((await fixture.get())?.blockers).toContain(
    'SALES_REQUESTER_ACCESS_CHANGED',
  );
});

it('rejects blank qualification fields and whitespace-padded oversized strings', async () => {
  const fixture = await salesFixture();
  await expect(
    fixture.seller.session.mutation(api.salesProjects.create, {
      ...fixture.createArgs,
      operationId: 'blank-product',
      application: ' ',
    }),
  ).rejects.toThrow('SALES_TEXT_REQUIRED');
  await expect(
    fixture.command({
      type: 'logActivity',
      kind: 'note',
      text: `x${' '.repeat(1000)}`,
    }),
  ).rejects.toThrow('SALES_TEXT_TOO_LONG');
  await expect(
    fixture.command({ ...SALES_QUOTE, incoterm: 'INVALID' }),
  ).rejects.toThrow('SALES_INVALID_INCOTERM');
});

it('caps blanket releases at 24 and paginates event history without losing events', async () => {
  const fixture = await salesFixture();
  await salesConfirm(fixture, 'blanket');
  for (let index = 0; index < 24; index += 1)
    await fixture.command({
      type: 'createBlanketRelease',
      reference: `REL-${index}`,
      quantityMilli: 1000,
      deliveryDate: '2099-12-01',
    });
  await expect(
    fixture.command({
      type: 'createBlanketRelease',
      reference: 'REL-overflow',
      quantityMilli: 1000,
      deliveryDate: '2099-12-01',
    }),
  ).rejects.toThrow('SALES_RELEASE_LIMIT');
  const first = await fixture.seller.session.query(api.salesProjects.history, {
    workspaceId: fixture.workspaceId,
    projectId: fixture.projectId,
    paginationOpts: { numItems: 20, cursor: null },
  });
  expect(first.page).toHaveLength(20);
  expect(first.isDone).toBe(false);
  const second = await fixture.seller.session.query(api.salesProjects.history, {
    workspaceId: fixture.workspaceId,
    projectId: fixture.projectId,
    paginationOpts: { numItems: 20, cursor: first.continueCursor },
  });
  expect(second.isDone).toBe(true);
  expect(first.page.length + second.page.length).toBe(
    (await fixture.get())?.revision,
  );
  expect(
    new Set([...first.page, ...second.page].map((event) => event._id)).size,
  ).toBe((await fixture.get())?.revision);
});

it('does not hand off before confirmation or invent missing releases', async () => {
  const fixture = await salesFixture();
  const command = {
    type: 'simulateSapHandoff' as const,
    releaseReference: 'MISSING',
    outcome: 'accepted' as const,
    evidenceReference: 'DEMO-receipt',
  };
  await expect(fixture.command(command)).rejects.toThrow(
    'SALES_CONFIRMATION_REQUIRED',
  );
  await salesConfirm(fixture, 'blanket');
  await expect(fixture.command(command)).rejects.toThrow(
    'SALES_RELEASE_NOT_FOUND',
  );
});

it('rejects a failed pricing review until resubmission and supersedes approval when pricing changes', async () => {
  const fixture = await salesFixture();
  await fixture.command({ ...SALES_QUOTE, exceptionReason: 'Discount' });
  await fixture.command({ type: 'submitPricingReview' });
  await fixture.command(
    {
      type: 'simulateReviewDecision',
      gate: 'pricing',
      decision: 'rejected',
      evidenceReference: 'DEMO-denied',
    },
    fixture.manager,
  );
  await expect(
    fixture.command({ type: 'markQuoteSent', evidenceReference: 'DEMO-quote' }),
  ).rejects.toThrow('SALES_PRICING_REVIEW_REQUIRED');
  await fixture.command({ type: 'submitPricingReview' });
  await salesApprove(fixture, ['pricing']);
  await fixture.command({
    ...SALES_QUOTE,
    exceptionReason: 'Larger discount',
    unitPriceMinor: 100,
  });
  await expect(
    fixture.command({ type: 'markQuoteSent', evidenceReference: 'DEMO-quote' }),
  ).rejects.toThrow('SALES_PRICING_REVIEW_REQUIRED');
  expect((await fixture.get())?.pricingReview).toBeNull();
});
