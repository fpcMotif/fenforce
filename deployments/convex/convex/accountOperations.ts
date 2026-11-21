import { ConvexError, v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { query } from './_generated/server';
import {
  type AccountOperation,
  operationReceiptValidator,
} from './accountOperationContract';
import { canAccessAccount, requireSalesMember } from './accountPolicy';

type OperationArguments = {
  workspaceId: Id<'workspaces'>;
  operationId?: string;
} & Record<string, unknown>;

const validateOperationId = (operationId: string) => {
  if (
    operationId.trim() !== operationId ||
    operationId.length === 0 ||
    operationId.length > 200
  )
    throw new ConvexError('INVALID_OPERATION_ID');
};

const payloadOf = (args: OperationArguments) =>
  JSON.stringify(
    Object.entries(args)
      .filter(([key, value]) => key !== 'operationId' && value !== undefined)
      .sort(([first], [second]) => first.localeCompare(second)),
  );

const findReceipt = (
  context: QueryCtx,
  member: Doc<'workspaceMembers'>,
  operationId: string,
) => {
  validateOperationId(operationId);
  return context.db
    .query('accountOperationReceipts')
    .withIndex('by_workspaceId_and_actorId_and_operationId', (index) =>
      index
        .eq('workspaceId', member.workspaceId)
        .eq('actorId', member._id)
        .eq('operationId', operationId),
    )
    .unique();
};

const requireReceiptAccess = async (
  context: QueryCtx,
  member: Doc<'workspaceMembers'>,
  receipt: Doc<'accountOperationReceipts'>,
) => {
  const company = await context.db.get(receipt.companyId);
  if (company === null || !canAccessAccount(member, company))
    throw new ConvexError('COMPANY_NOT_FOUND');
  if (receipt.requiresManager && member.role !== 'manager')
    throw new ConvexError('FORBIDDEN');
};

export const readAccountReceipt = async (
  context: QueryCtx,
  member: Doc<'workspaceMembers'>,
  operation: AccountOperation,
  args: OperationArguments,
) => {
  if (args.operationId === undefined) return null;
  const receipt = await findReceipt(context, member, args.operationId);
  if (receipt === null) return null;
  await requireReceiptAccess(context, member, receipt);
  if (receipt.operation !== operation || receipt.payload !== payloadOf(args))
    throw new ConvexError('OPERATION_ID_REUSED');
  return receipt;
};

export const saveAccountReceipt = async (
  context: MutationCtx,
  member: Doc<'workspaceMembers'>,
  operation: AccountOperation,
  args: OperationArguments,
  result: {
    companyId: Id<'workspaceCompanies'>;
    revision: number;
    changed: boolean;
    requiresManager: boolean;
  },
) => {
  if (args.operationId === undefined) return;
  await context.db.insert('accountOperationReceipts', {
    workspaceId: member.workspaceId,
    actorId: member._id,
    operationId: args.operationId,
    operation,
    payload: payloadOf(args),
    ...result,
    acceptedAt: Date.now(),
  });
};

export const getReceipt = query({
  args: { workspaceId: v.id('workspaces'), operationId: v.string() },
  returns: v.union(operationReceiptValidator, v.null()),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    const receipt = await findReceipt(context, member, args.operationId);
    if (receipt === null) return null;
    await requireReceiptAccess(context, member, receipt);
    return {
      operation: receipt.operation,
      companyId: receipt.companyId,
      revision: receipt.revision,
      changed: receipt.changed,
      acceptedAt: receipt.acceptedAt,
    };
  },
});
