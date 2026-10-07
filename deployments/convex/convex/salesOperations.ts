import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { validateOperationId } from './operationReceipt';
import { salesRequire } from './salesValidation';

export const salesReadReceipt = async (
  context: QueryCtx,
  member: Doc<'workspaceMembers'>,
  operationId: string,
  payload: string,
) => {
  validateOperationId(operationId);
  const receipt = await context.db
    .query('salesOperationReceipts')
    .withIndex('by_workspaceId_and_actorId_and_operationId', (index) =>
      index
        .eq('workspaceId', member.workspaceId)
        .eq('actorId', member._id)
        .eq('operationId', operationId),
    )
    .unique();
  if (receipt !== null)
    salesRequire(receipt.payload === payload, 'OPERATION_ID_REUSED');
  return receipt;
};

export const salesSaveReceipt = async (
  context: MutationCtx,
  member: Doc<'workspaceMembers'>,
  operationId: string,
  payload: string,
  projectId: Id<'salesProjects'>,
  revision: number,
) => {
  await context.db.insert('salesOperationReceipts', {
    mode: 'demo',
    simulation: true,
    workspaceId: member.workspaceId,
    actorId: member._id,
    operationId,
    payload,
    projectId,
    revision,
  });
};
