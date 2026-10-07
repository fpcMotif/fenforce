import { ConvexError, v } from 'convex/values';
import { internalMutation, type MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { appendAccountAudit } from './accountAudit';
import { findContactBySourceId, insertImportedContact } from './contactSource';

const benchmarkEmployees = async (context: MutationCtx) => {
  const issuer = process.env.FENFORCE_OIDC_ISSUER;
  if (
    process.env.FENFORCE_MOCK_IDENTITY_ENABLED !== 'true' ||
    issuer !== 'http://localhost:4011' ||
    process.env.FENFORCE_OIDC_TENANT !== 'tenant-demo'
  )
    throw new ConvexError('MOCK_IDENTITY_DISABLED');
  const [manager, seller] = await Promise.all(
    ['manager-a', 'seller-a'].map((subject) =>
      context.db
        .query('employeeIdentities')
        .withIndex('by_issuer_and_tenant_and_subject', (index) =>
          index
            .eq('issuer', issuer)
            .eq('tenant', 'tenant-demo')
            .eq('subject', subject),
        )
        .unique(),
    ),
  );
  if (!manager || !seller)
    throw new ConvexError('SIGN_IN_AS_SYNTHETIC_EMPLOYEES_FIRST');
  return { manager, seller };
};

const BENCHMARK_WORKSPACE_NAME = 'account-query-benchmark';
const MANAGER_MEMBERSHIP_SCAN_LIMIT = 200;

const findMembership = (
  context: MutationCtx,
  workspaceId: Id<'workspaces'>,
  userId: Id<'users'>,
) =>
  context.db
    .query('workspaceMembers')
    .withIndex('by_workspaceId_and_userId', (index) =>
      index.eq('workspaceId', workspaceId).eq('userId', userId),
    )
    .unique();

const removeEarlierBenchmarkMemberships = async (
  context: MutationCtx,
  managerUserId: Id<'users'>,
  sellerUserId: Id<'users'>,
) => {
  const managerMemberships = await context.db
    .query('workspaceMembers')
    .withIndex('by_userId', (index) => index.eq('userId', managerUserId))
    .take(MANAGER_MEMBERSHIP_SCAN_LIMIT);
  if (managerMemberships.length === MANAGER_MEMBERSHIP_SCAN_LIMIT)
    throw new ConvexError('MOCK_MEMBERSHIP_LIMIT');
  for (const managerMembership of managerMemberships) {
    const workspace = await context.db.get(managerMembership.workspaceId);
    if (
      workspace?.name !== BENCHMARK_WORKSPACE_NAME ||
      workspace.createdByUserId !== managerUserId
    )
      continue;
    const sellerMembership = await findMembership(
      context,
      workspace._id,
      sellerUserId,
    );
    await context.db.delete(managerMembership._id);
    if (sellerMembership !== null)
      await context.db.delete(sellerMembership._id);
  }
};

export const prepare = internalMutation({
  args: {},
  returns: v.object({ workspaceId: v.id('workspaces') }),
  handler: async (context) => {
    const { manager, seller } = await benchmarkEmployees(context);
    await removeEarlierBenchmarkMemberships(
      context,
      manager.userId,
      seller.userId,
    );
    const workspaceId = await context.db.insert('workspaces', {
      name: BENCHMARK_WORKSPACE_NAME,
      createdByUserId: manager.userId,
      createdAt: Date.now(),
    });
    for (const [employee, role] of [
      [manager, 'manager'],
      [seller, 'seller'],
    ] as const)
      await context.db.insert('workspaceMembers', {
        workspaceId,
        userId: employee.userId,
        displayName: employee.subject,
        role,
        active: true,
        createdAt: Date.now(),
      });
    return { workspaceId };
  },
});

const benchmarkMembers = async (
  context: MutationCtx,
  workspaceId: Id<'workspaces'>,
) => {
  const { manager, seller } = await benchmarkEmployees(context);
  const workspace = await context.db.get(workspaceId);
  if (
    workspace?.name !== BENCHMARK_WORKSPACE_NAME ||
    workspace.createdByUserId !== manager.userId
  )
    throw new ConvexError('INVALID_BENCHMARK_WORKSPACE');
  const [managerMember, sellerMember] = await Promise.all(
    [manager, seller].map((employee) =>
      findMembership(context, workspaceId, employee.userId),
    ),
  );
  if (!managerMember || !sellerMember)
    throw new ConvexError('INVALID_BENCHMARK_MEMBERS');
  return { managerMember, sellerMember };
};

const BENCHMARK_ACCOUNT_COUNT = 1000;
const BENCHMARK_CONTACTS_PER_ACCOUNT = 3;

const validateBatch = (start: number, count: number, total: number) => {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(count) ||
    start < 0 ||
    count < 1 ||
    count > 100 ||
    start + count > total
  )
    throw new ConvexError('INVALID_BENCHMARK_BATCH');
};

const benchmarkName = (offset: number) =>
  `Benchmark ${String(offset).padStart(4, '0')}${offset === 999 ? ' needle' : ''}`;
const benchmarkIndustry = (offset: number) => {
  if (offset % 3 === 0) return null;
  return offset % 3 === 1 ? ('services' as const) : ('manufacturing' as const);
};

const findBenchmarkAccount = (
  context: MutationCtx,
  workspaceId: Id<'workspaces'>,
  name: string,
) =>
  context.db
    .query('workspaceCompanies')
    .withIndex('by_workspaceId_and_deletedAt_and_nameSortKey', (index) =>
      index
        .eq('workspaceId', workspaceId)
        .eq('deletedAt', null)
        .eq('nameSortKey', name.toLowerCase()),
    )
    .first();

export const seedBatch = internalMutation({
  args: {
    workspaceId: v.id('workspaces'),
    start: v.number(),
    count: v.number(),
  },
  returns: v.object({ inserted: v.number() }),
  handler: async (context, args) => {
    const { managerMember, sellerMember } = await benchmarkMembers(
      context,
      args.workspaceId,
    );
    validateBatch(args.start, args.count, BENCHMARK_ACCOUNT_COUNT);
    let inserted = 0;
    for (let offset = args.start; offset < args.start + args.count; offset++) {
      const name = benchmarkName(offset);
      const existing = await findBenchmarkAccount(
        context,
        args.workspaceId,
        name,
      );
      if (existing) continue;
      const owner = offset % 2 === 0 ? managerMember : sellerMember;
      const companyId = await context.db.insert('workspaceCompanies', {
        workspaceId: args.workspaceId,
        name,
        nameSortKey: name.toLowerCase(),
        revision: 1,
        industry: benchmarkIndustry(offset),
        domainName: {
          primaryLinkUrl: '',
          primaryLinkLabel: '',
          secondaryLinks: [],
        },
        accountOwnerId: owner._id,
        createdBy: managerMember._id,
        updatedBy: managerMember._id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
      });
      await appendAccountAudit(context, companyId, null);
      inserted++;
    }
    return { inserted };
  },
});

const benchmarkContactLastName = (offset: number) =>
  `Contact ${String(offset).padStart(4, '0')}${offset === 2999 ? ' needle' : ''}`;
const benchmarkContactEmail = (offset: number) =>
  offset % 2 === 0 ? `contact-${offset}@example.test` : null;

export const seedContactBatch = internalMutation({
  args: {
    workspaceId: v.id('workspaces'),
    start: v.number(),
    count: v.number(),
  },
  returns: v.object({ inserted: v.number() }),
  handler: async (context, args) => {
    const { managerMember } = await benchmarkMembers(context, args.workspaceId);
    validateBatch(
      args.start,
      args.count,
      BENCHMARK_ACCOUNT_COUNT * BENCHMARK_CONTACTS_PER_ACCOUNT,
    );
    let inserted = 0;
    for (let offset = args.start; offset < args.start + args.count; offset++) {
      const sourceId = `benchmark-contact-${offset}`;
      if (await findContactBySourceId(context, args.workspaceId, sourceId))
        continue;
      const account = await findBenchmarkAccount(
        context,
        args.workspaceId,
        benchmarkName(Math.floor(offset / BENCHMARK_CONTACTS_PER_ACCOUNT)),
      );
      if (account === null) throw new ConvexError('BENCHMARK_ACCOUNT_MISSING');
      await insertImportedContact(context, {
        workspaceId: args.workspaceId,
        accountId: account._id,
        actorId: managerMember._id,
        sourceId,
        lastName: benchmarkContactLastName(offset),
        email: benchmarkContactEmail(offset),
      });
      inserted++;
    }
    return { inserted };
  },
});
