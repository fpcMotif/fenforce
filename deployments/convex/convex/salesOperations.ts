import type { Infer } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { validateOperationId } from './operationReceipt';
import type {
  SalesProject,
  SalesQuote,
  salesEventValidator,
} from './salesContract';
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

export const salesCommitChange = async (
  context: MutationCtx,
  member: Doc<'workspaceMembers'>,
  change: {
    project: SalesProject;
    fromStage: SalesProject['stage'];
    command: Infer<typeof salesEventValidator>['command'];
    previousQuote: SalesQuote | null;
    snapshotId: Id<'salesReviewSnapshots'> | null;
    operationId: string;
    payload: string;
  },
) => {
  const { project } = change;
  project.revision += 1;
  project.updatedBy = member._id;
  project.updatedAt = Date.now();
  const { _id, _creationTime: _creation, ...values } = project;
  await context.db.replace(_id, values);
  await context.db.insert('salesProjectEvents', {
    mode: 'demo',
    simulation: true,
    workspaceId: project.workspaceId,
    projectId: _id,
    actorId: member._id,
    timestamp: project.updatedAt,
    revision: project.revision,
    fromStage: change.fromStage,
    toStage: project.stage,
    command: change.command,
    previousQuote: change.previousQuote,
    snapshotId: change.snapshotId,
  });
  await salesSaveReceipt(
    context,
    member,
    change.operationId,
    change.payload,
    _id,
    project.revision,
  );
  return project.revision;
};
