import { ConvexError, v } from 'convex/values';

import { internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { appendAccountAudit } from './accountAudit';
import { insertImportedContact } from './contactSource';

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

const requireMockIssuer = () => {
  const issuer = process.env.FENFORCE_OIDC_ISSUER;
  if (
    process.env.FENFORCE_MOCK_IDENTITY_ENABLED !== 'true' ||
    issuer !== 'http://localhost:4011' ||
    process.env.FENFORCE_OIDC_TENANT !== 'tenant-demo'
  ) {
    throw new ConvexError('MOCK_IDENTITY_DISABLED');
  }
  return issuer;
};

export const prepare = internalMutation({
  args: {},
  returns: v.object({
    workspaceId: v.id('workspaces'),
    otherWorkspaceId: v.id('workspaces'),
  }),
  handler: async (context) => {
    const issuer = requireMockIssuer();
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

const CONTACT_FIXTURE_WORKSPACE_NAME = 'contact-fixture';
const CONTACT_FIXTURE_OTHER_WORKSPACE_NAME = 'contact-fixture-other';
const CONTACT_FIXTURE_EMPLOYEES = [
  ['seller-a', 'seller'],
  ['seller-b', 'seller'],
  ['manager-a', 'manager'],
  ['admin-a', 'admin'],
] as const;
const FIXTURE_MEMBERSHIP_SCAN_LIMIT = 200;

type FixtureEmployee = {
  subject: string;
  role: (typeof CONTACT_FIXTURE_EMPLOYEES)[number][1];
  userId: Id<'users'>;
};

const contactFixtureEmployees = async (
  context: MutationCtx,
  issuer: string,
) => {
  const employees = new Map<string, FixtureEmployee>();
  for (const [subject, role] of CONTACT_FIXTURE_EMPLOYEES) {
    const identity = await context.db
      .query('employeeIdentities')
      .withIndex('by_issuer_and_tenant_and_subject', (index) =>
        index
          .eq('issuer', issuer)
          .eq('tenant', 'tenant-demo')
          .eq('subject', subject),
      )
      .unique();
    if (identity !== null)
      employees.set(subject, { subject, role, userId: identity.userId });
    else if (role !== 'admin')
      throw new ConvexError('SIGN_IN_AS_SYNTHETIC_EMPLOYEES_FIRST');
  }
  return employees;
};

const isContactFixtureWorkspace = (
  workspace: Doc<'workspaces'> | null,
  managerUserId: Id<'users'>,
) =>
  workspace !== null &&
  workspace.createdByUserId === managerUserId &&
  (workspace.name === CONTACT_FIXTURE_WORKSPACE_NAME ||
    workspace.name === CONTACT_FIXTURE_OTHER_WORKSPACE_NAME);

const removeEarlierContactFixtureMemberships = async (
  context: MutationCtx,
  employees: Iterable<FixtureEmployee>,
  managerUserId: Id<'users'>,
) => {
  for (const employee of employees) {
    const memberships = await context.db
      .query('workspaceMembers')
      .withIndex('by_userId', (index) => index.eq('userId', employee.userId))
      .take(FIXTURE_MEMBERSHIP_SCAN_LIMIT);
    if (memberships.length === FIXTURE_MEMBERSHIP_SCAN_LIMIT)
      throw new ConvexError('MOCK_MEMBERSHIP_LIMIT');
    for (const membership of memberships) {
      const workspace = await context.db.get(membership.workspaceId);
      if (isContactFixtureWorkspace(workspace, managerUserId))
        await context.db.delete(membership._id);
    }
  }
};

const insertFixtureMember = (
  context: MutationCtx,
  workspaceId: Id<'workspaces'>,
  employee: FixtureEmployee,
) =>
  context.db.insert('workspaceMembers', {
    workspaceId,
    userId: employee.userId,
    displayName: employee.subject,
    role: employee.role,
    active: true,
    createdAt: Date.now(),
  });

const insertFixtureAccount = async (
  context: MutationCtx,
  workspaceId: Id<'workspaces'>,
  name: string,
  ownerId: Id<'workspaceMembers'>,
) => {
  const now = Date.now();
  const accountId = await context.db.insert('workspaceCompanies', {
    workspaceId,
    revision: 1,
    name,
    nameSortKey: name.toLowerCase(),
    industry: null,
    domainName: {
      primaryLinkUrl: '',
      primaryLinkLabel: '',
      secondaryLinks: [],
    },
    accountOwnerId: ownerId,
    createdBy: ownerId,
    updatedBy: ownerId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  await appendAccountAudit(context, accountId, null);
  return accountId;
};

const requireFixtureEmployee = (
  employees: Map<string, FixtureEmployee>,
  subject: string,
) => {
  const employee = employees.get(subject);
  if (employee === undefined)
    throw new ConvexError('SIGN_IN_AS_SYNTHETIC_EMPLOYEES_FIRST');
  return employee;
};

const insertFixtureWorkspace = async (
  context: MutationCtx,
  name: string,
  managerUserId: Id<'users'>,
  employees: Iterable<FixtureEmployee>,
) => {
  const workspaceId = await context.db.insert('workspaces', {
    name,
    createdByUserId: managerUserId,
    createdAt: Date.now(),
  });
  const members = new Map<string, Id<'workspaceMembers'>>();
  for (const employee of employees)
    members.set(
      employee.subject,
      await insertFixtureMember(context, workspaceId, employee),
    );
  return { workspaceId, members };
};

const requireFixtureMember = (
  members: Map<string, Id<'workspaceMembers'>>,
  subject: string,
) => {
  const memberId = members.get(subject);
  if (memberId === undefined) throw new Error('Missing fixture member');
  return memberId;
};

export const prepareContactFixture = internalMutation({
  args: {},
  returns: v.object({
    workspaceId: v.id('workspaces'),
    otherWorkspaceId: v.id('workspaces'),
    accountAId: v.id('workspaceCompanies'),
    accountBId: v.id('workspaceCompanies'),
    accountXId: v.id('workspaceCompanies'),
    contactAId: v.id('workspaceContacts'),
  }),
  handler: async (context) => {
    const employees = await contactFixtureEmployees(
      context,
      requireMockIssuer(),
    );
    const manager = requireFixtureEmployee(employees, 'manager-a');
    const sellerA = requireFixtureEmployee(employees, 'seller-a');
    await removeEarlierContactFixtureMemberships(
      context,
      employees.values(),
      manager.userId,
    );
    const { workspaceId, members } = await insertFixtureWorkspace(
      context,
      CONTACT_FIXTURE_WORKSPACE_NAME,
      manager.userId,
      employees.values(),
    );
    const other = await insertFixtureWorkspace(
      context,
      CONTACT_FIXTURE_OTHER_WORKSPACE_NAME,
      manager.userId,
      [sellerA],
    );
    const sellerAId = requireFixtureMember(members, 'seller-a');
    const accountAId = await insertFixtureAccount(
      context,
      workspaceId,
      'account-a',
      sellerAId,
    );
    const accountBId = await insertFixtureAccount(
      context,
      workspaceId,
      'account-b',
      requireFixtureMember(members, 'seller-b'),
    );
    const accountXId = await insertFixtureAccount(
      context,
      other.workspaceId,
      'account-x',
      requireFixtureMember(other.members, 'seller-a'),
    );
    const contactAId = await insertImportedContact(context, {
      workspaceId,
      accountId: accountAId,
      actorId: sellerAId,
      sourceId: 'contact-a',
      lastName: 'Synthetic',
      email: null,
    });
    return {
      workspaceId,
      otherWorkspaceId: other.workspaceId,
      accountAId,
      accountBId,
      accountXId,
      contactAId,
    };
  },
});
