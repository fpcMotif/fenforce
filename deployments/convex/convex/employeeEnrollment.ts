import { ConvexError } from 'convex/values';

import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

export const enrollEmployee = async (
  context: MutationCtx,
  profile: Record<string, unknown>,
  existingUserId: Id<'users'> | null,
) => {
  const { issuer, tenant, subject } = profile;
  if (
    typeof issuer !== 'string' ||
    typeof tenant !== 'string' ||
    typeof subject !== 'string'
  ) {
    throw new ConvexError('INVALID_EMPLOYEE_IDENTITY');
  }
  const identity = await context.db
    .query('employeeIdentities')
    .withIndex('by_issuer_and_tenant_and_subject', (index) =>
      index.eq('issuer', issuer).eq('tenant', tenant).eq('subject', subject),
    )
    .unique();
  if (identity) {
    if (existingUserId !== identity.userId)
      throw new ConvexError('INVALID_EMPLOYEE_IDENTITY');
    await requireActiveEmployee(context, identity.userId);
    return identity.userId;
  }
  const invitation = await context.db
    .query('employeeInvitations')
    .withIndex('by_issuer_and_tenant_and_subject', (index) =>
      index.eq('issuer', issuer).eq('tenant', tenant).eq('subject', subject),
    )
    .unique();
  if (
    !invitation ||
    invitation.acceptedUserId ||
    invitation.expiresAt <= Date.now() ||
    existingUserId
  ) {
    throw new ConvexError('EMPLOYEE_NOT_INVITED');
  }
  const userId = await context.db.insert('users', {
    name: invitation.displayName,
  });
  await context.db.insert('employeeIdentities', {
    issuer,
    tenant,
    subject,
    userId,
  });
  await context.db.insert('workspaceMembers', {
    userId,
    workspaceId: invitation.workspaceId,
    displayName: invitation.displayName,
    role: invitation.role,
    active: true,
    createdAt: Date.now(),
  });
  await context.db.patch(invitation._id, { acceptedUserId: userId });
  return userId;
};

export const requireActiveEmployee = async (
  context: Pick<QueryCtx, 'db'>,
  userId: Id<'users'>,
) => {
  const membership = await context.db
    .query('workspaceMembers')
    .withIndex('by_userId_and_active', (index) =>
      index.eq('userId', userId).eq('active', true),
    )
    .first();
  if (!membership) throw new ConvexError('EMPLOYEE_INACTIVE');
};
