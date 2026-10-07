import { ConvexError, type Infer } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { salesProductValidator } from './salesContract';
import { salesCheckOwner, salesRequirePrimaryContact } from './salesPolicy';
import { salesDate, salesQuantity, salesText } from './salesValidation';

export type SalesProjectInput = Infer<typeof salesProductValidator> & {
  workspaceId: Id<'workspaces'>;
  accountId: Id<'workspaceCompanies'>;
  primaryContactId?: Id<'workspaceContacts'> | null;
  nextAction: string;
  nextActionDate: string;
  closeDate?: string | null;
};

export const salesInsertProject = async (
  context: MutationCtx,
  account: Doc<'workspaceCompanies'>,
  actorId: Id<'workspaceMembers'>,
  input: SalesProjectInput,
  sourceId: string | null,
) => {
  const ownerCheckedId = await salesCheckOwner(context, account);
  const primaryContactId = await salesRequirePrimaryContact(
    context,
    account,
    input.primaryContactId ?? null,
  );
  for (const value of [
    input.title,
    input.materialCode,
    input.productName,
    input.specification,
    input.application,
    input.nextAction,
  ])
    salesText(value);
  salesQuantity(input.quantityMilli, input.unit);
  const now = Date.now();
  const projectId = await context.db.insert('salesProjects', {
    mode: 'demo',
    simulation: true,
    workspaceId: account.workspaceId,
    accountId: account._id,
    primaryContactId,
    sourceId,
    title: input.title,
    materialCode: input.materialCode,
    productName: input.productName,
    specification: input.specification,
    application: input.application,
    quantityMilli: input.quantityMilli,
    unit: input.unit,
    currency: input.currency,
    revision: 1,
    quoteVersion: 0,
    nextAction: input.nextAction,
    nextActionDate: salesDate(input.nextActionDate),
    closeDate:
      input.closeDate === undefined || input.closeDate === null
        ? null
        : salesDate(input.closeDate),
    ownerCheckedId,
    ownerCheckedAt: now,
    stage: 'qualified',
    outcome: 'open',
    sample: null,
    quote: null,
    purchaseOrder: null,
    pricingReview: null,
    orderReview: null,
    confirmation: null,
    releases: [],
    lostReason: null,
    createdBy: actorId,
    updatedBy: actorId,
    createdAt: now,
    updatedAt: now,
  });
  await context.db.insert('salesProjectEvents', {
    mode: 'demo',
    simulation: true,
    workspaceId: account.workspaceId,
    projectId,
    actorId,
    timestamp: now,
    revision: 1,
    fromStage: null,
    toStage: 'qualified',
    command: { type: 'create' },
    previousQuote: null,
    snapshotId: null,
  });
  return projectId;
};

export const findSalesProjectBySourceId = (
  context: QueryCtx,
  workspaceId: Id<'workspaces'>,
  sourceId: string,
) =>
  context.db
    .query('salesProjects')
    .withIndex('by_workspaceId_and_sourceId', (index) =>
      index.eq('workspaceId', workspaceId).eq('sourceId', sourceId),
    )
    .unique();

export type ImportedSalesProject = SalesProjectInput & {
  actorId: Id<'workspaceMembers'>;
  sourceId: string;
};

export const insertImportedSalesProject = async (
  context: MutationCtx,
  imported: ImportedSalesProject,
) => {
  const existing = await findSalesProjectBySourceId(
    context,
    imported.workspaceId,
    imported.sourceId,
  );
  if (existing !== null) throw new ConvexError('DUPLICATE_SALES_SOURCE_ID');
  const actor = await context.db.get(imported.actorId);
  if (
    actor === null ||
    actor.workspaceId !== imported.workspaceId ||
    actor.active === false
  )
    throw new ConvexError('INVALID_IMPORT_ACTOR');
  const account = await context.db.get(imported.accountId);
  if (
    account === null ||
    account.workspaceId !== imported.workspaceId ||
    account.deletedAt !== null
  )
    throw new ConvexError('COMPANY_NOT_FOUND');
  const { actorId, sourceId, ...input } = imported;
  return salesInsertProject(context, account, actorId, input, sourceId);
};
