import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { validateAccountPageSize } from './accountQueryContract';
import { requireSession, requireWorkspaceMember } from './authorization';
import { membershipRoleValidator } from './membershipRole';

export const create = mutation({
  args: { name: v.string() },
  returns: v.id('workspaces'),
  handler: async (context, args) => {
    const { identity, userId } = await requireSession(context);
    const employee = await context.db
      .query('employeeIdentities')
      .withIndex('by_userId', (index) => index.eq('userId', userId))
      .unique();
    if (employee) throw new ConvexError('FORBIDDEN');
    const name = args.name.trim();

    if (name.length === 0 || name.length > 120) {
      throw new Error('Workspace name must contain 1 to 120 characters');
    }

    const now = Date.now();
    const workspaceId = await context.db.insert('workspaces', {
      name,
      createdByUserId: userId,
      createdAt: now,
    });

    await context.db.insert('workspaceMembers', {
      workspaceId,
      userId,
      displayName: identity.name ?? identity.email ?? 'Workspace admin',
      role: 'admin',
      createdAt: now,
    });

    return workspaceId;
  },
});

export const listMine = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      workspaceId: v.id('workspaces'),
      name: v.string(),
      role: membershipRoleValidator,
    }),
  ),
  handler: async (context, args) => {
    const { userId } = await requireSession(context);
    validateAccountPageSize(args.paginationOpts.numItems);
    const membershipsPage = await context.db
      .query('workspaceMembers')
      .withIndex('by_userId', (index) => index.eq('userId', userId))
      .paginate(args.paginationOpts);

    const workspaces = await Promise.all(
      membershipsPage.page
        .filter((membership) => membership.active !== false)
        .map(async (membership) => {
          const workspace = await context.db.get(membership.workspaceId);

          if (workspace === null) {
            throw new Error('Workspace membership has no workspace');
          }

          return {
            workspaceId: workspace._id,
            name: workspace.name,
            role: membership.role,
          };
        }),
    );

    return { ...membershipsPage, page: workspaces };
  },
});

export const getMine = query({
  args: { workspaceId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      workspaceId: v.id('workspaces'),
      name: v.string(),
      role: membershipRoleValidator,
    }),
  ),
  handler: async (context, args) => {
    const { userId } = await requireSession(context);
    const workspaceId = context.db.normalizeId('workspaces', args.workspaceId);
    if (workspaceId === null) return null;
    const membership = await context.db
      .query('workspaceMembers')
      .withIndex('by_workspaceId_and_userId', (index) =>
        index.eq('workspaceId', workspaceId).eq('userId', userId),
      )
      .unique();
    if (membership === null || membership.active === false) return null;
    const workspace = await context.db.get(workspaceId);

    if (workspace === null) {
      throw new Error('Workspace membership has no workspace');
    }

    return {
      workspaceId: workspace._id,
      name: workspace.name,
      role: membership.role,
    };
  },
});

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
    }),
  ),
  handler: async (context, args) => {
    await requireWorkspaceMember(context, args.workspaceId);
    validateAccountPageSize(args.paginationOpts.numItems);
    const membersPage = await context.db
      .query('workspaceMembers')
      .withIndex('by_workspaceId_and_userId', (index) =>
        index.eq('workspaceId', args.workspaceId),
      )
      .paginate(args.paginationOpts);

    return {
      ...membersPage,
      page: membersPage.page
        .filter((member) => member.active !== false)
        .map((member) => ({
          memberId: member._id,
          displayName: member.displayName,
          role: member.role,
        })),
    };
  },
});
