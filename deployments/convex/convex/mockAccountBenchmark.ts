import { ConvexError, v } from 'convex/values';
import { internalMutation, type MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { appendAccountAudit } from './accountAudit';

const benchmarkEmployees = async (context: MutationCtx) => {
  const issuer = process.env.FENFORCE_OIDC_ISSUER;
  if (
    process.env.FENFORCE_MOCK_IDENTITY_ENABLED !== 'true' ||
    issuer !== 'http://localhost:4011' ||
    process.env.FENFORCE_OIDC_TENANT !== 'tenant-demo'
  )
    throw new ConvexError('MOCK_IDENTITY_DISABLED');
  const employees = await Promise.all(
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
  const manager = employees[0];
  const seller = employees[1];
  if (!manager || !seller)
    throw new ConvexError('SIGN_IN_AS_SYNTHETIC_EMPLOYEES_FIRST');
  return { manager, seller };
};

export const prepare = internalMutation({
  args: {},
  handler: async (context) => {
    const { manager, seller } = await benchmarkEmployees(context);
    const workspaceId = await context.db.insert('workspaces', {
      name: 'account-query-benchmark',
      createdByUserId: manager.userId,
      createdAt: Date.now(),
    });
    for (const employee of [manager, seller])
      await context.db.insert('workspaceMembers', {
        workspaceId,
        userId: employee.userId,
        displayName: employee.subject,
        role: employee.subject === 'manager-a' ? 'manager' : 'seller',
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
    workspace?.name !== 'account-query-benchmark' ||
    workspace.createdByUserId !== manager.userId
  )
    throw new ConvexError('INVALID_BENCHMARK_WORKSPACE');
  const members = await Promise.all(
    [manager, seller].map((employee) =>
      context.db
        .query('workspaceMembers')
        .withIndex('by_workspaceId_and_userId', (index) =>
          index.eq('workspaceId', workspaceId).eq('userId', employee.userId),
        )
        .unique(),
    ),
  );
  const managerMember = members[0];
  const sellerMember = members[1];
  if (!managerMember || !sellerMember)
    throw new ConvexError('INVALID_BENCHMARK_MEMBERS');
  return { managerMember, sellerMember };
};

const validateBatch = (start: number, count: number) => {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(count) ||
    start < 0 ||
    count < 1 ||
    count > 100 ||
    start + count > 1000
  )
    throw new ConvexError('INVALID_BENCHMARK_BATCH');
};

const benchmarkName = (offset: number) =>
  `Benchmark ${String(offset).padStart(4, '0')}${offset === 999 ? ' needle' : ''}`;
const benchmarkIndustry = (offset: number) => {
  if (offset % 3 === 0) return null;
  return offset % 3 === 1 ? ('services' as const) : ('manufacturing' as const);
};

export const seedBatch = internalMutation({
  args: {
    workspaceId: v.id('workspaces'),
    start: v.number(),
    count: v.number(),
  },
  handler: async (context, args) => {
    const { managerMember, sellerMember } = await benchmarkMembers(
      context,
      args.workspaceId,
    );
    validateBatch(args.start, args.count);
    let inserted = 0;
    for (let offset = args.start; offset < args.start + args.count; offset++) {
      const name = benchmarkName(offset);
      const existing = await context.db
        .query('workspaceCompanies')
        .withIndex('by_workspaceId_and_deletedAt_and_nameSortKey', (index) =>
          index
            .eq('workspaceId', args.workspaceId)
            .eq('deletedAt', null)
            .eq('nameSortKey', name.toLowerCase()),
        )
        .first();
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
    return {
      inserted,
      next: args.start + args.count,
      done: args.start + args.count === 1000,
    };
  },
});
