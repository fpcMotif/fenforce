import { ConvexError } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { requireWorkspaceMember } from './authorization';
import { isSalesRole } from './membershipRole';

export const requireSalesMember = async (
  context: QueryCtx,
  workspaceId: Id<'workspaces'>,
) => {
  const member = await requireWorkspaceMember(context, workspaceId);
  if (!isSalesRole(member.role)) throw new ConvexError('FORBIDDEN');
  return member;
};

export const canAccessAccount = (
  member: Doc<'workspaceMembers'>,
  company: Doc<'workspaceCompanies'>,
) =>
  member.workspaceId === company.workspaceId &&
  (member.role === 'manager' ||
    (member.role === 'seller' && company.accountOwnerId === member._id));

export const assertOwnerAssignment = (
  member: Doc<'workspaceMembers'>,
  ownerId: Id<'workspaceMembers'> | null,
) => {
  if (ownerId === null) throw new ConvexError('INVALID_ACCOUNT_OWNER');
  if (member.role !== 'manager' && ownerId !== member._id)
    throw new ConvexError('FORBIDDEN');
};
