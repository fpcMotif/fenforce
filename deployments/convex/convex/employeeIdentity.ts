import { ConvexError, v } from 'convex/values';
import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';

import { internal } from './_generated/api';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import {
  requireSession,
  requireWorkspaceAdmin,
  requireWorkspaceMember,
} from './authorization';
import { membershipRoleValidator, type MembershipRole } from './membershipRole';

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

const validateInvitationText = (subject: string, displayName: string) => {
  if (
    !subject.trim() ||
    subject.length > 200 ||
    !displayName.trim() ||
    displayName.length > 200
  ) {
    throw new ConvexError('INVALID_INVITATION');
  }
};

export const listMembers = query({
  args: {
    workspaceId: v.id('workspaces'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      memberId: v.id('workspaceMembers'),
      displayName: v.string(),
      role: membershipRoleValidator,
      active: v.boolean(),
    }),
  ),
  handler: async (context, args) => {
    await requireWorkspaceAdmin(context, args.workspaceId);
    if (
      !Number.isInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > 100
    )
      throw new ConvexError('INVALID_PAGE_SIZE');
    const memberships = await context.db
      .query('workspaceMembers')
      .withIndex('by_workspaceId_and_userId', (index) =>
        index.eq('workspaceId', args.workspaceId),
      )
      .paginate(args.paginationOpts);
    return {
      ...memberships,
      page: memberships.page.map((member) => ({
        memberId: member._id,
        displayName: member.displayName,
        role: member.role,
        active: member.active !== false,
      })),
    };
  },
});

export const invite = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    subject: v.string(),
    displayName: v.string(),
    role: membershipRoleValidator,
  },
  returns: v.id('employeeInvitations'),
  handler: async (context, args) => {
    await requireWorkspaceAdmin(context, args.workspaceId);
    const issuer = process.env.FENFORCE_OIDC_ISSUER;
    const tenant = process.env.FENFORCE_OIDC_TENANT;
    if (!issuer || !tenant) throw new ConvexError('IDENTITY_NOT_CONFIGURED');
    validateInvitationText(args.subject, args.displayName);
    const existing = await context.db
      .query('employeeInvitations')
      .withIndex('by_issuer_and_tenant_and_subject', (index) =>
        index
          .eq('issuer', issuer)
          .eq('tenant', tenant)
          .eq('subject', args.subject),
      )
      .unique();
    if (existing) {
      if (
        existing.workspaceId !== args.workspaceId ||
        existing.acceptedUserId ||
        existing.expiresAt > Date.now()
      ) {
        throw new ConvexError('INVITATION_ALREADY_EXISTS');
      }
      await context.db.patch(existing._id, {
        displayName: args.displayName,
        role: args.role,
        expiresAt: Date.now() + 7 * 24 * 3_600_000,
      });
      return existing._id;
    }
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
      .withIndex('by_userId_and_expirationTime', (index) =>
        index.eq('userId', membership.userId).gt('expirationTime', Date.now()),
      )
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
    if (existing) {
      await reconcileMockRoles(context, issuer, tenant);
      return existing.workspaceId;
    }
    const userId = await context.db.insert('users', {
      name: 'Synthetic bootstrap',
    });
    const workspaceId = await context.db.insert('workspaces', {
      name: 'workspace-demo',
      createdByUserId: userId,
      createdAt: Date.now(),
    });
    for (const [subject, role] of Object.entries(MOCK_ROLES)) {
      await context.db.insert('employeeInvitations', {
        issuer,
        tenant,
        subject,
        displayName: subject,
        workspaceId,
        role,
        expiresAt: Date.now() + 7 * 24 * 3_600_000,
      });
    }
    return workspaceId;
  },
});

const MOCK_ROLES = {
  'admin-a': 'admin',
  'manager-a': 'manager',
  'seller-a': 'seller',
  'seller-b': 'seller',
} as const;

const reconcileMockRoles = async (
  context: MutationCtx,
  issuer: string,
  tenant: string,
) => {
  for (const [subject, role] of Object.entries(MOCK_ROLES)) {
    const invitation = await context.db
      .query('employeeInvitations')
      .withIndex('by_issuer_and_tenant_and_subject', (index) =>
        index.eq('issuer', issuer).eq('tenant', tenant).eq('subject', subject),
      )
      .unique();
    if (invitation) await reconcileMockRole(context, invitation, role);
  }
};

const reconcileMockRole = async (
  context: MutationCtx,
  invitation: Doc<'employeeInvitations'>,
  role: MembershipRole,
) => {
  await context.db.patch(invitation._id, { role });
  const userId = invitation.acceptedUserId;
  if (!userId) return;
  const membership = await context.db
    .query('workspaceMembers')
    .withIndex('by_workspaceId_and_userId', (index) =>
      index.eq('workspaceId', invitation.workspaceId).eq('userId', userId),
    )
    .unique();
  if (membership) await context.db.patch(membership._id, { role });
};
