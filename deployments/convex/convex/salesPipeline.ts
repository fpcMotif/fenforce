import { stream } from 'convex-helpers/server/stream';
import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { query, type QueryCtx } from './_generated/server';
import {
  assertAccountQueryIndexReady,
  authorizedAccountStream,
  resolveAccountOwnerFilter,
} from './accountQueries';
import { requireSalesMember } from './accountPolicy';
import { validateAccountPageSize } from './accountQueryContract';
import { paginateWithFingerprintCursor } from './fingerprintCursor';
import {
  salesCurrencyValidator,
  salesStageValidator,
  type SalesProject,
} from './salesContract';
import { salesRequire } from './salesValidation';
import schema from './schema';
import { SingleAccountStream } from './singleAccountStream';

const SALES_PIPELINE_INDEX_FIELDS = [
  'accountId',
  'outcome',
  '_creationTime',
  '_id',
];
const SALES_PIPELINE_TOTALS_LIMIT = 500;
const SALES_OPEN_STAGES: SalesProject['stage'][] = [
  'qualified',
  'quoted',
  'po-received',
  'review',
];

const openStageValidator = v.union(
  v.literal('qualified'),
  v.literal('quoted'),
  v.literal('po-received'),
  v.literal('review'),
);

const salesPipelineItemValidator = v.object({
  _id: v.id('salesProjects'),
  accountId: v.id('workspaceCompanies'),
  accountName: v.string(),
  title: v.string(),
  stage: salesStageValidator,
  currency: salesCurrencyValidator,
  amountMinor: v.union(v.number(), v.null()),
  closeDate: v.union(v.string(), v.null()),
  nextAction: v.string(),
  nextActionDate: v.string(),
  revision: v.number(),
  updatedAt: v.number(),
});

const salesPipelineGroupValidator = v.object({
  stage: salesStageValidator,
  currency: salesCurrencyValidator,
  count: v.number(),
  quotedCount: v.number(),
  totalMinor: v.number(),
});

const openAccountProjectStream = (
  context: QueryCtx,
  accountId: Id<'workspaceCompanies'>,
) =>
  new SingleAccountStream(
    stream(context.db, schema)
      .query('salesProjects')
      .withIndex('by_accountId_and_outcome', (index) =>
        index.eq('accountId', accountId).eq('outcome', 'open'),
      ),
    accountId,
  );

const authorizedOpenProjects = async (
  context: QueryCtx,
  member: Doc<'workspaceMembers'>,
) => {
  const ownerId = await resolveAccountOwnerFilter(context, member, undefined);
  await assertAccountQueryIndexReady(context, member.workspaceId, ownerId);
  return authorizedAccountStream(context, member.workspaceId, ownerId).flatMap(
    async (account) => openAccountProjectStream(context, account._id),
    SALES_PIPELINE_INDEX_FIELDS,
  );
};

const pipelineItem = (project: SalesProject, accountName: string) => ({
  _id: project._id,
  accountId: project.accountId,
  accountName,
  title: project.title,
  stage: project.stage,
  currency: project.currency,
  amountMinor: project.quote?.totalMinor ?? null,
  closeDate: project.closeDate,
  nextAction: project.nextAction,
  nextActionDate: project.nextActionDate,
  revision: project.revision,
  updatedAt: project.updatedAt,
});

export const list = query({
  args: {
    workspaceId: v.id('workspaces'),
    stage: v.optional(openStageValidator),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(salesPipelineItemValidator),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    validateAccountPageSize(args.paginationOpts.numItems);
    const projects = await authorizedOpenProjects(context, member);
    const result = await paginateWithFingerprintCursor(
      projects.filterWith(
        async (project) =>
          args.stage === undefined || project.stage === args.stage,
      ),
      args.paginationOpts,
      JSON.stringify([1, member._id, member.role, args.stage ?? null]),
      'INVALID_SALES_PIPELINE_CURSOR',
    );
    const accountNames = new Map<Id<'workspaceCompanies'>, string>();
    const page = [];
    for (const project of result.page) {
      if (!accountNames.has(project.accountId)) {
        const account = await context.db.get(project.accountId);
        accountNames.set(project.accountId, account?.name ?? '');
      }
      page.push(
        pipelineItem(project, accountNames.get(project.accountId) ?? ''),
      );
    }
    return { ...result, page };
  },
});

export const totals = query({
  args: { workspaceId: v.id('workspaces') },
  returns: v.object({
    complete: v.boolean(),
    groups: v.array(salesPipelineGroupValidator),
  }),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    const projects = await (
      await authorizedOpenProjects(context, member)
    ).take(SALES_PIPELINE_TOTALS_LIMIT + 1);
    const groups = new Map<
      string,
      {
        stage: SalesProject['stage'];
        currency: SalesProject['currency'];
        count: number;
        quotedCount: number;
        total: bigint;
      }
    >();
    for (const project of projects.slice(0, SALES_PIPELINE_TOTALS_LIMIT)) {
      const key = `${project.stage}:${project.currency}`;
      const group = groups.get(key) ?? {
        stage: project.stage,
        currency: project.currency,
        count: 0,
        quotedCount: 0,
        total: 0n,
      };
      group.count += 1;
      if (project.quote !== null) {
        group.quotedCount += 1;
        group.total += BigInt(project.quote.totalMinor);
      }
      groups.set(key, group);
    }
    const ordered = [...groups.values()].sort(
      (first, second) =>
        SALES_OPEN_STAGES.indexOf(first.stage) -
          SALES_OPEN_STAGES.indexOf(second.stage) ||
        first.currency.localeCompare(second.currency),
    );
    return {
      complete: projects.length <= SALES_PIPELINE_TOTALS_LIMIT,
      groups: ordered.map(({ total, ...group }) => {
        salesRequire(
          total <= BigInt(Number.MAX_SAFE_INTEGER),
          'SALES_TOTAL_OVERFLOW',
        );
        return { ...group, totalMinor: Number(total) };
      }),
    };
  },
});
