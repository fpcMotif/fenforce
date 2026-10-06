import { ConvexError, v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { query } from './_generated/server';
import { requireSalesMember } from './accountPolicy';
import {
  contactOperationValidator,
  type ContactOperation,
} from './contactContract';
import { requireAccessibleContact } from './contactPolicy';
import { operationPayload, validateOperationId } from './operationReceipt';

type ContactOperationArguments = {
  workspaceId: Id<'workspaces'>;
  operationId: string;
} & Record<string, unknown>;

export const findContactReceipt = (
  context: QueryCtx,
  member: Doc<'workspaceMembers'>,
  operationId: string,
) => {
  validateOperationId(operationId);
  return context.db
    .query('contactOperationReceipts')
    .withIndex('by_workspaceId_and_actorId_and_operationId', (index) =>
      index
        .eq('workspaceId', member.workspaceId)
        .eq('actorId', member._id)
        .eq('operationId', operationId),
    )
    .unique();
};

export const readContactReceipt = async (
  context: QueryCtx,
  member: Doc<'workspaceMembers'>,
  operation: ContactOperation,
  args: ContactOperationArguments,
) => {
  const receipt = await findContactReceipt(context, member, args.operationId);
  if (receipt === null) return null;
  await requireAccessibleContact(context, member, receipt.contactId);
  if (
    receipt.operation !== operation ||
    receipt.payload !== operationPayload(args)
  )
    throw new ConvexError('OPERATION_ID_REUSED');
  return receipt;
};

export const saveContactReceipt = async (
  context: MutationCtx,
  member: Doc<'workspaceMembers'>,
  operation: ContactOperation,
  args: ContactOperationArguments,
  result: { contactId: Id<'workspaceContacts'>; revision: number },
) => {
  await context.db.insert('contactOperationReceipts', {
    workspaceId: member.workspaceId,
    actorId: member._id,
    operationId: args.operationId,
    operation,
    payload: operationPayload(args),
    ...result,
    changed: true,
    acceptedAt: Date.now(),
  });
};

export const getReceipt = query({
  args: { workspaceId: v.id('workspaces'), operationId: v.string() },
  returns: v.union(
    v.object({
      operation: contactOperationValidator,
      contactId: v.id('workspaceContacts'),
      revision: v.number(),
      changed: v.boolean(),
      acceptedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    const receipt = await findContactReceipt(context, member, args.operationId);
    if (receipt === null) return null;
    await requireAccessibleContact(context, member, receipt.contactId);
    return {
      operation: receipt.operation,
      contactId: receipt.contactId,
      revision: receipt.revision,
      changed: receipt.changed,
      acceptedAt: receipt.acceptedAt,
    };
  },
});
