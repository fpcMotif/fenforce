import { ConvexError, v } from 'convex/values';

import { internal } from './_generated/api';
import { internalMutation, mutation, query } from './_generated/server';
import {
  requireSession,
  requireWorkspaceAdmin,
  requireWorkspaceMember,
} from './authorization';

export const session = query({
  args: { workspaceId: v.optional(v.id('workspaces')) },
  returns: v.union(
    v.null(),
    v.object({ userId: v.id('users'), expiresAt: v.number() }),
  ),
  handler: async (context, args) => {
    try {
      const { userId, expiresAt } = await requireSession(context);
      if (args.workspaceId)
        await requireWorkspaceMember(context, args.workspaceId);
      return { userId, expiresAt };
    } catch {
      return null;
    }
  },
});

export const invite = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    subject: v.string(),
    displayName: v.string(),
    role: v.union(v.literal('admin'), v.literal('member')),
  },
  returns: v.id('employeeInvitations'),
  handler: async (context, args) => {
    await requireWorkspaceAdmin(context, args.workspaceId);
    const issuer = process.env.FENFORCE_OIDC_ISSUER;
    const tenant = process.env.FENFORCE_OIDC_TENANT;
    if (!issuer || !tenant) throw new ConvexError('IDENTITY_NOT_CONFIGURED');
    if (
      !args.subject.trim() ||
      args.subject.length > 200 ||
      !args.displayName.trim() ||
      args.displayName.length > 200
    )
      throw new ConvexError('INVALID_INVITATION');
    const existing = await context.db
      .query('employeeInvitations')
      .withIndex('by_issuer_and_tenant_and_subject', (index) =>
        index
          .eq('issuer', issuer)
          .eq('tenant', tenant)
          .eq('subject', args.subject),
      )
      .unique();
    if (existing) throw new ConvexError('INVITATION_ALREADY_EXISTS');
    return context.db.insert('employeeInvitations', {
      ...args,
      issuer,
      tenant,
      expiresAt: Date.now() + 7 * 24 * 3_600_000,
    });
  },
});

export const disableMember = mutation({
  args: { workspaceId: v.id('workspaces'), memberId: v.id('workspaceMembers') },
  returns: v.null(),
  handler: async (context, args) => {
    await requireWorkspaceAdmin(context, args.workspaceId);
    const membership = await context.db.get(args.memberId);
    if (!membership || membership.workspaceId !== args.workspaceId)
      throw new ConvexError('FORBIDDEN');
    await context.db.patch(membership._id, { active: false });
    const sessions = await context.db
      .query('authSessions')
      .withIndex('userId', (index) => index.eq('userId', membership.userId))
      .take(101);
    if (sessions.length > 100) throw new ConvexError('SESSION_LIMIT_EXCEEDED');
    for (const session of sessions) {
      await context.db.delete(session._id);
      await context.scheduler.runAfter(
        0,
        internal.employeeIdentity.cleanRefreshTokens,
        { sessionId: session._id },
      );
    }
    return null;
  },
});

export const cleanRefreshTokens = internalMutation({
  args: { sessionId: v.id('authSessions') },
  returns: v.null(),
  handler: async (context, args) => {
    const tokens = await context.db
      .query('authRefreshTokens')
      .withIndex('sessionId', (index) => index.eq('sessionId', args.sessionId))
      .take(100);
    for (const token of tokens) await context.db.delete(token._id);
    if (tokens.length === 100)
      await context.scheduler.runAfter(
        0,
        internal.employeeIdentity.cleanRefreshTokens,
        args,
      );
    return null;
  },
});

export const prepareMockWorkspace = internalMutation({
  args: {},
  returns: v.id('workspaces'),
  handler: async (context) => {
    const issuer = process.env.FENFORCE_OIDC_ISSUER;
    const tenant = process.env.FENFORCE_OIDC_TENANT;
    if (
      process.env.FENFORCE_MOCK_IDENTITY_ENABLED !== 'true' ||
      !issuer?.startsWith('http://localhost:') ||
      tenant !== 'tenant-demo'
    )
      throw new ConvexError('MOCK_IDENTITY_DISABLED');
    const existing = await context.db
      .query('employeeInvitations')
      .withIndex('by_issuer_and_tenant_and_subject', (index) =>
        index
          .eq('issuer', issuer)
          .eq('tenant', tenant)
          .eq('subject', 'admin-a'),
      )
      .unique();
    if (existing) return existing.workspaceId;
    const userId = await context.db.insert('users', {
      name: 'Synthetic bootstrap',
    });
    const workspaceId = await context.db.insert('workspaces', {
      name: 'workspace-demo',
      createdByUserId: userId,
      createdAt: Date.now(),
    });
    for (const subject of ['admin-a', 'manager-a', 'seller-a', 'seller-b']) {
      await context.db.insert('employeeInvitations', {
        issuer,
        tenant,
        subject,
        displayName: subject,
        workspaceId,
        role: subject === 'admin-a' ? 'admin' : 'member',
        expiresAt: Date.now() + 7 * 24 * 3_600_000,
      });
    }
    return workspaceId;
  },
});
