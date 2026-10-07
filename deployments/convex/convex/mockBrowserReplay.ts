import { ConvexError, v } from 'convex/values';

import { internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';

const restoreMemberships = async (
  context: MutationCtx,
  invitations: Array<Doc<'employeeInvitations'> | null>,
) => {
  for (const invitation of invitations) {
    const userId = invitation?.acceptedUserId;
    if (!invitation || !userId) continue;
    const member = await context.db
      .query('workspaceMembers')
      .withIndex('by_workspaceId_and_userId', (index) =>
        index.eq('workspaceId', invitation.workspaceId).eq('userId', userId),
      )
      .unique();
    if (member) await context.db.patch(member._id, { active: true });
  }
};

const findOtherWorkspace = async (
  context: MutationCtx,
  userId: Id<'users'>,
) => {
  const memberships = await context.db
    .query('workspaceMembers')
    .withIndex('by_userId', (index) => index.eq('userId', userId))
    .take(100);
  for (const membership of memberships) {
    const workspace = await context.db.get(membership.workspaceId);
    if (workspace?.name === 'workspace-other') return workspace._id;
  }
  if (memberships.length === 100) {
    throw new ConvexError('MOCK_MEMBERSHIP_LIMIT');
  }
  return null;
};

export const prepare = internalMutation({
  args: {},
  returns: v.object({
    workspaceId: v.id('workspaces'),
    otherWorkspaceId: v.id('workspaces'),
  }),
  handler: async (context) => {
    const issuer = process.env.FENFORCE_OIDC_ISSUER;
    if (
      process.env.FENFORCE_MOCK_IDENTITY_ENABLED !== 'true' ||
      issuer !== 'http://localhost:4011' ||
      process.env.FENFORCE_OIDC_TENANT !== 'tenant-demo'
    ) {
      throw new ConvexError('MOCK_IDENTITY_DISABLED');
    }
    const invitations = await Promise.all(
      ['seller-a', 'seller-b', 'manager-a', 'admin-a'].map((subject) =>
        context.db
          .query('employeeInvitations')
          .withIndex('by_issuer_and_tenant_and_subject', (index) =>
            index
              .eq('issuer', issuer)
              .eq('tenant', 'tenant-demo')
              .eq('subject', subject),
          )
          .unique(),
      ),
    );
    const seller = invitations[0];
    if (!seller?.acceptedUserId) {
      throw new ConvexError('SIGN_IN_AS_SYNTHETIC_SELLER_FIRST');
    }
    await restoreMemberships(context, invitations);
    const existing = await findOtherWorkspace(context, seller.acceptedUserId);
    if (existing) {
      return { workspaceId: seller.workspaceId, otherWorkspaceId: existing };
    }
    const otherWorkspaceId = await context.db.insert('workspaces', {
      name: 'workspace-other',
      createdByUserId: seller.acceptedUserId,
      createdAt: Date.now(),
    });
    await context.db.insert('workspaceMembers', {
      workspaceId: otherWorkspaceId,
      userId: seller.acceptedUserId,
      displayName: 'seller-a',
      role: 'seller',
      active: true,
      createdAt: Date.now(),
    });
    return { workspaceId: seller.workspaceId, otherWorkspaceId };
  },
});
