import type { Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';

export const memberDisplayName = async (
  context: QueryCtx,
  workspaceId: Id<'workspaces'>,
  memberId: Id<'workspaceMembers'>,
) => {
  const member = await context.db.get(memberId);

  if (member === null || member.workspaceId !== workspaceId) {
    return memberId;
  }

  return member.displayName;
};
