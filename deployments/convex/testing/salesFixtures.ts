import { api } from '../convex/_generated/api';
import type { SalesCommand, SalesGate } from '../convex/salesContract';
import { m1Fixture } from './contactFixtures';

export const SALES_PRODUCT = {
  title: 'Low-odor coating trial',
  materialCode: 'MAT-101',
  productName: 'Demo resin',
  specification: 'Solids 60%',
  application: 'Industrial coating',
  quantityMilli: 1250500,
  unit: 'kg' as const,
  currency: 'USD' as const,
  nextAction: 'Arrange sample',
  nextActionDate: '2099-10-10',
};

export const SALES_QUOTE: Extract<SalesCommand, { type: 'reviseQuote' }> = {
  type: 'reviseQuote',
  unitPriceMinor: 123,
  incoterm: 'FCA',
  namedPlace: 'Shanghai warehouse',
  paymentTerms: 'net30',
  packaging: '25 kg bags',
  validUntil: '2099-12-31',
  deliveryDate: '2099-11-20',
  exceptionReason: '',
};

export const salesFixture = async () => {
  const fixture = await m1Fixture();
  const { seller, workspaceId, accountA } = fixture;
  const createArgs = {
    ...SALES_PRODUCT,
    closeDate: '2099-11-01',
    operationId: 'create-project',
    workspaceId,
    accountId: accountA,
  };
  const projectId = await seller.session.mutation(
    api.salesProjects.create,
    createArgs,
  );
  const get = () =>
    fixture.manager.session.query(api.salesProjects.get, {
      workspaceId,
      projectId,
    });
  let operation = 0;
  const command = async (value: SalesCommand, actor = seller) => {
    const project = await get();
    if (project === null) throw new Error('Fixture project missing');
    operation += 1;
    return actor.session.mutation(api.salesProjects.execute, {
      workspaceId,
      projectId,
      expectedRevision: project.revision,
      operationId: `command-${operation}`,
      command: value,
    });
  };
  return { ...fixture, projectId, createArgs, get, command };
};

export type SalesFixture = Awaited<ReturnType<typeof salesFixture>>;

export const salesQuoteAndOrder = async (
  fixture: SalesFixture,
  orderType: 'standard' | 'blanket' = 'standard',
) => {
  await fixture.command(SALES_QUOTE);
  await fixture.command({
    type: 'markQuoteSent',
    evidenceReference: 'DEMO-quote-email',
  });
  await fixture.command({
    type: 'capturePurchaseOrder',
    reference: 'PO-101',
    documentReference: 'DEMO-po-document',
    qualityReference: 'SPEC-101',
    orderType,
  });
  await fixture.command({ type: 'submitOrderReview' });
};

export const salesApprove = async (
  fixture: SalesFixture,
  gates: SalesGate[] = ['support', 'management', 'osbo', 'finance', 'supply'],
) => {
  for (const gate of gates)
    await fixture.command(
      {
        type: 'simulateReviewDecision',
        gate,
        decision: 'approved',
        evidenceReference: `DEMO-${gate}-approval`,
      },
      fixture.manager,
    );
};

export const salesConfirm = async (
  fixture: SalesFixture,
  orderType: 'standard' | 'blanket' = 'standard',
) => {
  await salesQuoteAndOrder(fixture, orderType);
  await salesApprove(fixture);
  await fixture.command({
    type: 'recordSample',
    status: 'not-required',
    batchReference: '',
    coaReference: '',
    trackingReference: '',
    notes: 'Customer already qualified this material',
  });
  await fixture.command({
    type: 'simulateCustomerConfirmation',
    evidenceReference: 'DEMO-formal-email',
  });
};
