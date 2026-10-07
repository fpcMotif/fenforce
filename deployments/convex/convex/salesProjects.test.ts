import { expect, it } from 'vitest';

import { paginationOpts } from '../testing/contactFixtures';
import {
  salesApprove,
  salesConfirm,
  salesFixture,
  salesQuoteAndOrder,
  SALES_PRODUCT,
  SALES_QUOTE,
} from '../testing/salesFixtures';
import { api } from './_generated/api';

it('persists a qualified product project linked to its accessible Account and paginates real saved values', async () => {
  const fixture = await salesFixture();
  const { workspaceId, accountA, seller, projectId } = fixture;
  expect(await fixture.get()).toMatchObject({
    ...SALES_PRODUCT,
    _id: projectId,
    revision: 1,
    mode: 'demo',
    simulation: true,
    stage: 'qualified',
    outcome: 'open',
    ownerCheckedId: seller.memberId,
  });
  const listed = await seller.session.query(api.salesProjects.list, {
    workspaceId,
    accountId: accountA,
    paginationOpts,
  });
  expect(listed.page).toHaveLength(1);
  expect(listed.page[0]).toMatchObject({
    _id: projectId,
    title: SALES_PRODUCT.title,
    mode: 'demo',
  });
  await fixture.command({
    type: 'setNextAction',
    text: 'Call customer',
    dueDate: '2099-10-12',
  });
  expect(await fixture.get()).toMatchObject({
    nextAction: 'Call customer',
    nextActionDate: '2099-10-12',
    revision: 2,
  });
});

it('checks current Account authority on reads, histories, writes and receipt replays', async () => {
  const fixture = await salesFixture();
  const { workspaceId, projectId, seller, other, accountA, test } = fixture;
  expect(
    await other.session.query(api.salesProjects.get, {
      workspaceId,
      projectId,
    }),
  ).toBeNull();
  await expect(
    other.session.query(api.salesProjects.history, {
      workspaceId,
      projectId,
      paginationOpts,
    }),
  ).rejects.toThrow('SALES_PROJECT_NOT_FOUND');
  await expect(
    other.session.query(api.salesProjects.list, {
      workspaceId,
      accountId: accountA,
      paginationOpts,
    }),
  ).rejects.toThrow('COMPANY_NOT_FOUND');
  await expect(
    fixture.command(
      { type: 'logActivity', kind: 'note', text: 'Denied' },
      other,
    ),
  ).rejects.toThrow('SALES_PROJECT_NOT_FOUND');
  await test.run((context) =>
    context.db.patch(accountA, { accountOwnerId: other.memberId }),
  );
  expect(
    await seller.session.query(api.salesProjects.get, {
      workspaceId,
      projectId,
    }),
  ).toBeNull();
  await expect(
    seller.session.mutation(api.salesProjects.create, fixture.createArgs),
  ).rejects.toThrow('COMPANY_NOT_FOUND');
  expect(
    await other.session.query(api.salesProjects.get, {
      workspaceId,
      projectId,
    }),
  ).not.toBeNull();
});

it('rejects inactive membership, deleted Accounts and foreign-workspace projects', async () => {
  const fixture = await salesFixture();
  const {
    test,
    workspaceId,
    projectId,
    otherWorkspaceId,
    outsider,
    seller,
    accountA,
  } = fixture;
  expect(
    await outsider.session.query(api.salesProjects.get, {
      workspaceId: otherWorkspaceId,
      projectId,
    }),
  ).toBeNull();
  await expect(
    seller.session.mutation(api.salesProjects.create, {
      ...fixture.createArgs,
      operationId: 'foreign',
      accountId: fixture.accountX,
    }),
  ).rejects.toThrow('COMPANY_NOT_FOUND');
  await test.run((context) =>
    context.db.patch(seller.memberId, { active: false }),
  );
  await expect(
    seller.session.query(api.salesProjects.get, { workspaceId, projectId }),
  ).rejects.toThrow();
  await test.run((context) =>
    context.db.patch(accountA, { deletedAt: Date.now() }),
  );
  expect(await fixture.get()).toBeNull();
});

it('replays the original accepted revision, rejects changed payloads and stale edits without extra events', async () => {
  const fixture = await salesFixture();
  const { seller, workspaceId, projectId, createArgs } = fixture;
  expect(
    await seller.session.mutation(api.salesProjects.create, createArgs),
  ).toBe(projectId);
  const args = {
    workspaceId,
    projectId,
    operationId: 'retry-note',
    expectedRevision: 1,
    command: {
      type: 'logActivity' as const,
      kind: 'note' as const,
      text: 'Called buyer',
    },
  };
  expect(
    await seller.session.mutation(api.salesProjects.execute, args),
  ).toEqual({ revision: 2 });
  await fixture.command({
    type: 'setNextAction',
    text: 'Follow up',
    dueDate: '2099-10-13',
  });
  expect(
    await seller.session.mutation(api.salesProjects.execute, args),
  ).toEqual({ revision: 2 });
  await expect(
    seller.session.mutation(api.salesProjects.execute, {
      ...args,
      command: { ...args.command, text: 'Changed payload' },
    }),
  ).rejects.toThrow('OPERATION_ID_REUSED');
  await expect(
    seller.session.mutation(api.salesProjects.execute, {
      ...args,
      operationId: 'stale',
    }),
  ).rejects.toThrow('SALES_PROJECT_CHANGED');
  const events = await seller.session.query(api.salesProjects.history, {
    workspaceId,
    projectId,
    paginationOpts,
  });
  expect(events.page).toHaveLength(3);
  expect(
    events.page.every((event) => event.mode === 'demo' && event.simulation),
  ).toBe(true);
});

it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid quantity %s atomically',
  async (quantityMilli) => {
    const fixture = await salesFixture();
    await expect(
      fixture.seller.session.mutation(api.salesProjects.create, {
        ...fixture.createArgs,
        operationId: 'invalid',
        quantityMilli,
      }),
    ).rejects.toThrow('SALES_INVALID_QUANTITY');
    expect((await fixture.get())?.revision).toBe(1);
  },
);

it('rejects fractional pieces, impossible dates, oversized text and oversized pages', async () => {
  const fixture = await salesFixture();
  await expect(
    fixture.seller.session.mutation(api.salesProjects.create, {
      ...fixture.createArgs,
      operationId: 'pieces',
      unit: 'piece',
    }),
  ).rejects.toThrow('SALES_FRACTIONAL_PIECE');
  await expect(
    fixture.command({
      type: 'setNextAction',
      text: 'Call',
      dueDate: '2099-02-30',
    }),
  ).rejects.toThrow('SALES_INVALID_DATE');
  await expect(
    fixture.command({
      type: 'logActivity',
      kind: 'note',
      text: 'a'.repeat(1001),
    }),
  ).rejects.toThrow('SALES_TEXT_TOO_LONG');
  await expect(
    fixture.seller.session.query(api.salesProjects.list, {
      workspaceId: fixture.workspaceId,
      accountId: fixture.accountA,
      paginationOpts: { numItems: 101, cursor: null },
    }),
  ).rejects.toThrow('INVALID_PAGE_SIZE');
  await expect(
    fixture.seller.session.query(api.salesProjects.history, {
      workspaceId: fixture.workspaceId,
      projectId: fixture.projectId,
      paginationOpts: { numItems: 0, cursor: null },
    }),
  ).rejects.toThrow('INVALID_PAGE_SIZE');
  expect(
    (
      await fixture.seller.session.query(api.salesProjects.list, {
        workspaceId: fixture.workspaceId,
        accountId: fixture.accountA,
        paginationOpts: { numItems: 100, cursor: null },
      })
    ).page,
  ).toHaveLength(1);
});

it('calculates exact half-up money and rejects overflow or fractional minor-unit prices', async () => {
  const fixture = await salesFixture();
  await fixture.command(SALES_QUOTE);
  expect((await fixture.get())?.quote).toMatchObject({
    totalMinor: 153812,
    rounding: 'half-up-minor-unit',
    indicative: true,
  });
  await expect(
    fixture.command({ ...SALES_QUOTE, unitPriceMinor: 0.5 }),
  ).rejects.toThrow('SALES_INVALID_PRICE');
  await expect(
    fixture.command({
      ...SALES_QUOTE,
      unitPriceMinor: Number.MAX_SAFE_INTEGER,
    }),
  ).rejects.toThrow('SALES_TOTAL_OVERFLOW');
  expect((await fixture.get())?.quoteVersion).toBe(1);
});

it('requires complete sample references and a reason for skipping samples', async () => {
  const fixture = await salesFixture();
  const sample = {
    type: 'recordSample' as const,
    status: 'shipped' as const,
    batchReference: 'BATCH-1',
    coaReference: '',
    trackingReference: 'TRACK-1',
    notes: '',
  };
  await expect(fixture.command(sample)).rejects.toThrow('SALES_TEXT_REQUIRED');
  await expect(
    fixture.command({ ...sample, status: 'not-required' }),
  ).rejects.toThrow('SALES_TEXT_REQUIRED');
  await fixture.command({ ...sample, coaReference: 'COA-1' });
  await fixture.command({
    ...sample,
    status: 'accepted',
    coaReference: 'COA-1',
    notes: 'Customer accepted',
  });
  expect((await fixture.get())?.sample).toMatchObject({
    status: 'accepted',
    coaReference: 'COA-1',
  });
});

it('gates exception quotes on a separate manager simulation and preserves immutable quote history', async () => {
  const fixture = await salesFixture();
  await fixture.command({
    ...SALES_QUOTE,
    exceptionReason: 'Special discount',
  });
  await expect(
    fixture.command({ type: 'markQuoteSent', evidenceReference: 'DEMO-email' }),
  ).rejects.toThrow('SALES_PRICING_REVIEW_REQUIRED');
  await fixture.command({ type: 'submitPricingReview' });
  await salesApprove(fixture, ['pricing']);
  await fixture.command({
    type: 'markQuoteSent',
    evidenceReference: 'DEMO-email',
  });
  const first = await fixture.get();
  expect(first?.outcome).toBe('open');
  expect(first?.currentReview?.quote.unitPriceMinor).toBe(123);
  await fixture.command({ ...SALES_QUOTE, unitPriceMinor: 200 });
  expect(await fixture.get()).toMatchObject({
    quoteVersion: 2,
    pricingReview: null,
    orderReview: null,
    purchaseOrder: null,
  });
  const original = await fixture.test.run(async (context) =>
    first?.currentReview ? context.db.get(first.currentReview._id) : null,
  );
  expect(original?.quote.unitPriceMinor).toBe(123);
  const events = await fixture.seller.session.query(api.salesProjects.history, {
    workspaceId: fixture.workspaceId,
    projectId: fixture.projectId,
    paginationOpts,
  });
  expect(events.page[0]?.previousQuote?.unitPriceMinor).toBe(123);
});

it('requires a valid quote and PO evidence before order review', async () => {
  const fixture = await salesFixture();
  await expect(fixture.command({ type: 'submitOrderReview' })).rejects.toThrow(
    'SALES_QUOTE_REQUIRED',
  );
  await fixture.command({ ...SALES_QUOTE, validUntil: '2000-01-01' });
  await expect(
    fixture.command({ type: 'markQuoteSent', evidenceReference: 'DEMO-email' }),
  ).rejects.toThrow('SALES_QUOTE_EXPIRED');
  await fixture.command(SALES_QUOTE);
  await expect(
    fixture.command({
      type: 'capturePurchaseOrder',
      reference: 'PO',
      documentReference: 'DOC',
      qualityReference: 'SPEC',
      orderType: 'standard',
    }),
  ).rejects.toThrow('SALES_QUOTE_NOT_SENT');
  await fixture.command({
    type: 'markQuoteSent',
    evidenceReference: 'DEMO-email',
  });
  await expect(
    fixture.command({
      type: 'capturePurchaseOrder',
      reference: 'PO',
      documentReference: '',
      qualityReference: 'SPEC',
      orderType: 'standard',
    }),
  ).rejects.toThrow('SALES_TEXT_REQUIRED');
});

it('sequences support, management and OSBO while allowing finance and supply independently', async () => {
  const fixture = await salesFixture();
  await salesQuoteAndOrder(fixture);
  await expect(salesApprove(fixture, ['management'])).rejects.toThrow(
    'SALES_REVIEW_GATE_ORDER',
  );
  await expect(salesApprove(fixture, ['osbo'])).rejects.toThrow(
    'SALES_REVIEW_GATE_ORDER',
  );
  await salesApprove(fixture, [
    'finance',
    'supply',
    'support',
    'management',
    'osbo',
  ]);
  expect((await fixture.get())?.orderReview).toMatchObject({
    status: 'approved',
    simulation: true,
  });
  expect(
    (await fixture.get())?.orderReview?.decisions.every(
      (decision) => decision.actorId === fixture.manager.memberId,
    ),
  ).toBe(true);
});

it('rejects seller decisions and manager self-approval', async () => {
  const fixture = await salesFixture();
  await fixture.command(SALES_QUOTE);
  await fixture.command({
    type: 'markQuoteSent',
    evidenceReference: 'DEMO-email',
  });
  await fixture.command({
    type: 'capturePurchaseOrder',
    reference: 'PO',
    documentReference: 'DOC',
    qualityReference: 'SPEC',
    orderType: 'standard',
  });
  await fixture.command({ type: 'submitOrderReview' }, fixture.manager);
  const decision = {
    type: 'simulateReviewDecision' as const,
    gate: 'support' as const,
    decision: 'approved' as const,
    evidenceReference: 'DEMO-check',
  };
  await expect(fixture.command(decision)).rejects.toThrow(
    'SALES_SIMULATION_MANAGER_REQUIRED',
  );
  await expect(fixture.command(decision, fixture.manager)).rejects.toThrow(
    'SALES_SELF_APPROVAL',
  );
});

it('closes rejected reviews and creates a new snapshot for corrected purchase orders', async () => {
  const fixture = await salesFixture();
  await salesQuoteAndOrder(fixture);
  const first = (await fixture.get())?.currentReview?._id;
  await fixture.command(
    {
      type: 'simulateReviewDecision',
      gate: 'finance',
      decision: 'rejected',
      evidenceReference: 'DEMO-credit-failed',
    },
    fixture.manager,
  );
  await expect(salesApprove(fixture, ['support'])).rejects.toThrow(
    'SALES_REVIEW_CLOSED',
  );
  await fixture.command({
    type: 'capturePurchaseOrder',
    reference: 'PO-corrected',
    documentReference: 'DOC-2',
    qualityReference: 'SPEC',
    orderType: 'standard',
  });
  expect((await fixture.get())?.orderReview).toBeNull();
  await fixture.command({ type: 'submitOrderReview' });
  expect((await fixture.get())?.currentReview?._id).not.toBe(first);
  await salesApprove(fixture);
  expect((await fixture.get())?.orderReview?.status).toBe('approved');
});

it('rechecks requester membership and owner changes during review and confirmation', async () => {
  const fixture = await salesFixture();
  await salesQuoteAndOrder(fixture);
  await fixture.test.run((context) =>
    context.db.patch(fixture.seller.memberId, { active: false }),
  );
  await expect(salesApprove(fixture, ['support'])).rejects.toThrow(
    'SALES_REQUESTER_ACCESS_CHANGED',
  );
  await fixture.test.run((context) =>
    context.db.patch(fixture.seller.memberId, { active: true }),
  );
  await salesApprove(fixture);
  await fixture.command({
    type: 'recordSample',
    status: 'not-required',
    batchReference: '',
    coaReference: '',
    trackingReference: '',
    notes: 'Established product',
  });
  await fixture.test.run((context) =>
    context.db.patch(fixture.accountA, {
      accountOwnerId: fixture.other.memberId,
    }),
  );
  await expect(
    fixture.command(
      {
        type: 'simulateCustomerConfirmation',
        evidenceReference: 'DEMO-confirm',
      },
      fixture.manager,
    ),
  ).rejects.toThrow('SALES_OWNER_CHANGED');
});

it('blocks confirmation until sample clearance and permits re-sampling after rejection', async () => {
  const fixture = await salesFixture();
  await salesQuoteAndOrder(fixture);
  await expect(
    fixture.command({
      type: 'simulateCustomerConfirmation',
      evidenceReference: 'DEMO-confirm',
    }),
  ).rejects.toThrow('SALES_ORDER_REVIEW_REQUIRED');
  await salesApprove(fixture);
  const sample = {
    type: 'recordSample' as const,
    status: 'rejected' as const,
    batchReference: 'B1',
    coaReference: 'C1',
    trackingReference: 'T1',
    notes: 'Customer rejected viscosity',
  };
  await fixture.command(sample);
  await expect(
    fixture.command({
      type: 'simulateCustomerConfirmation',
      evidenceReference: 'DEMO-confirm',
    }),
  ).rejects.toThrow('SALES_SAMPLE_CLEARANCE_REQUIRED');
  await fixture.command({
    ...sample,
    status: 'requested',
    notes: 'New batch requested',
  });
  await fixture.command({
    ...sample,
    status: 'accepted',
    batchReference: 'B2',
    notes: 'Accepted new batch',
  });
  await fixture.command({
    type: 'simulateCustomerConfirmation',
    evidenceReference: 'DEMO-confirm',
  });
  expect(await fixture.get()).toMatchObject({
    stage: 'confirmed',
    outcome: 'won',
    confirmation: { simulation: true },
    releases: [
      {
        reference: 'STANDARD',
        quantityMilli: SALES_PRODUCT.quantityMilli,
        deliveryDate: SALES_QUOTE.deliveryDate,
        erpState: 'ready',
      },
    ],
  });
});

it('freezes confirmed commercial terms and gives a standard order exactly one release', async () => {
  const fixture = await salesFixture();
  await salesConfirm(fixture);
  await expect(fixture.command(SALES_QUOTE)).rejects.toThrow(
    'SALES_ORDER_CONFIRMED',
  );
  await expect(
    fixture.command({
      type: 'simulateCustomerConfirmation',
      evidenceReference: 'again',
    }),
  ).rejects.toThrow('SALES_ORDER_CONFIRMED');
  await expect(
    fixture.command({
      type: 'createBlanketRelease',
      reference: 'extra',
      quantityMilli: 1000,
      deliveryDate: '2099-12-01',
    }),
  ).rejects.toThrow('SALES_NOT_BLANKET');
  await expect(
    fixture.command({ type: 'closeLost', reason: 'Too late' }),
  ).rejects.toThrow('SALES_ORDER_CONFIRMED');
  await fixture.command({
    type: 'logActivity',
    kind: 'delivery-followup',
    text: 'Customer received goods',
  });
  expect((await fixture.get())?.releases).toHaveLength(1);
});

it('creates bounded dated blanket releases without over-allocation or duplicate references', async () => {
  const fixture = await salesFixture();
  await salesConfirm(fixture, 'blanket');
  expect((await fixture.get())?.releases).toHaveLength(0);
  const release = {
    type: 'createBlanketRelease' as const,
    reference: 'REL-1',
    quantityMilli: 1000000,
    deliveryDate: '2099-11-20',
  };
  await fixture.command(release);
  await expect(fixture.command(release)).rejects.toThrow(
    'SALES_RELEASE_REFERENCE_EXISTS',
  );
  await expect(
    fixture.command({ ...release, reference: 'REL-2' }),
  ).rejects.toThrow('SALES_OVER_RELEASE');
  await fixture.command({
    ...release,
    reference: 'REL-2',
    quantityMilli: 250500,
    deliveryDate: '2099-12-20',
  });
  expect((await fixture.get())?.releases).toHaveLength(2);
});

it('reconciles uncertain SAP simulation under the same reference and makes accepted terminal', async () => {
  const fixture = await salesFixture();
  await salesConfirm(fixture);
  const command = {
    type: 'simulateSapHandoff' as const,
    releaseReference: 'STANDARD',
    outcome: 'uncertain' as const,
    evidenceReference: 'DEMO-timeout',
  };
  await fixture.command(command);
  const reference = (await fixture.get())?.releases[0]?.simulatedSapReference;
  expect(reference).toMatch(/^DEMO-/);
  await fixture.command({
    ...command,
    outcome: 'failed',
    evidenceReference: 'DEMO-not-found',
  });
  await fixture.command({
    ...command,
    outcome: 'accepted',
    evidenceReference: 'DEMO-reconciled',
  });
  expect((await fixture.get())?.releases[0]).toMatchObject({
    erpState: 'accepted',
    simulatedSapReference: reference,
    simulation: true,
  });
  await expect(fixture.command(command)).rejects.toThrow(
    'SALES_SAP_ALREADY_ACCEPTED',
  );
});

it('keeps closed-lost terminal and invalidates all PO approvals on commercial revisions', async () => {
  const fixture = await salesFixture();
  await salesQuoteAndOrder(fixture);
  await salesApprove(fixture);
  await fixture.command({ ...SALES_QUOTE, unitPriceMinor: 150 });
  expect(await fixture.get()).toMatchObject({
    purchaseOrder: null,
    orderReview: null,
    quoteVersion: 2,
  });
  await fixture.command({
    type: 'closeLost',
    reason: 'Customer canceled trial',
  });
  await expect(fixture.command(SALES_QUOTE)).rejects.toThrow(
    'SALES_PROJECT_LOST',
  );
  await expect(
    fixture.command({ type: 'closeLost', reason: 'Again' }),
  ).rejects.toThrow('SALES_PROJECT_LOST');
  expect(await fixture.get()).toMatchObject({
    outcome: 'lost',
    lostReason: 'Customer canceled trial',
  });
});
