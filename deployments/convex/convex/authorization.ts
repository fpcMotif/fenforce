import { getAuthSessionId, getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';

import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { requireActiveEmployee } from './employeeEnrollment';

type DatabaseContext = MutationCtx | QueryCtx;

// A Convex Auth token stays cryptographically valid after sign-out, so the
// stored session is the authority on whether the caller is still signed in.
export const requireSession = async (context: DatabaseContext) => {
  const identity = await context.auth.getUserIdentity();
  const userId = await getAuthUserId(context);
  const sessionId = await getAuthSessionId(context);

  const normalizedSessionId = sessionId
    ? context.db.normalizeId('authSessions', sessionId)
    : null;

  if (identity === null || !userId || normalizedSessionId === null) {
    throw new ConvexError('UNAUTHENTICATED');
  }

  const session = await context.db.get(normalizedSessionId);

  if (
    session === null ||
    session.userId !== userId ||
    session.expirationTime <= Date.now()
  ) {
    throw new ConvexError('UNAUTHENTICATED');
  }

  const employee = await context.db
    .query('employeeIdentities')
    .withIndex('by_userId', (index) => index.eq('userId', session.userId))
    .unique();
  if (employee) await requireActiveEmployee(context, session.userId);
  return {
    identity,
    userId: session.userId,
    expiresAt: session.expirationTime,
  };
};

export const requireWorkspaceMember = async (
  context: DatabaseContext,
  workspaceId: Id<'workspaces'>,
) => {
  const { userId } = await requireSession(context);
  const membership = await context.db
    .query('workspaceMembers')
    .withIndex('by_workspaceId_and_userId', (index) =>
      index.eq('workspaceId', workspaceId).eq('userId', userId),
    )
    .unique();

  if (membership === null || membership.active === false) {
    throw new ConvexError('FORBIDDEN');
  }

  return membership;
};

export const requireWorkspaceAdmin = async (
  context: DatabaseContext,
  workspaceId: Id<'workspaces'>,
) => {
  const membership = await requireWorkspaceMember(context, workspaceId);

  if (membership.role !== 'admin') {
    throw new ConvexError('FORBIDDEN');
  }

  return membership;
};
