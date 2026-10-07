import { stream } from 'convex-helpers/server/stream';
import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import { v, type Infer } from 'convex/values';

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
  SALES_OPEN_STAGES,
  salesCurrencyValidator,
  salesOpenStageValidator,
  salesProjectCard,
  salesProjectCardFields,
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
const SALES_PIPELINE_STAGE_INDEX_FIELDS = [
  'accountId',
  'outcome',
  'stage',
  '_creationTime',
  '_id',
];
const SALES_PIPELINE_TOTALS_LIMIT = 500;

type SalesOpenStage = Infer<typeof salesOpenStageValidator>;

const salesPipelineItemValidator = v.object({
  ...salesProjectCardFields,
  accountName: v.string(),
  currency: salesCurrencyValidator,
  amountMinor: v.union(v.number(), v.null()),
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
  stage: SalesOpenStage | undefined,
) => {
  const projects = stream(context.db, schema).query('salesProjects');
  return new SingleAccountStream(
    stage === undefined
      ? projects.withIndex('by_accountId_and_outcome', (index) =>
          index.eq('accountId', accountId).eq('outcome', 'open'),
        )
      : projects.withIndex('by_accountId_and_outcome_and_stage', (index) =>
          index
            .eq('accountId', accountId)
            .eq('outcome', 'open')
            .eq('stage', stage),
        ),
    accountId,
  );
};

const authorizedOpenProjects = async (
  context: QueryCtx,
  member: Doc<'workspaceMembers'>,
  stage?: SalesOpenStage,
) => {
  const ownerId = await resolveAccountOwnerFilter(context, member, undefined);
  await assertAccountQueryIndexReady(context, member.workspaceId, ownerId);
  return authorizedAccountStream(context, member.workspaceId, ownerId).flatMap(
    async (account) => openAccountProjectStream(context, account._id, stage),
    stage === undefined
      ? SALES_PIPELINE_INDEX_FIELDS
      : SALES_PIPELINE_STAGE_INDEX_FIELDS,
  );
};

const pipelineItem = (project: SalesProject, accountName: string) => ({
  ...salesProjectCard(project),
  accountName,
  currency: project.currency,
  amountMinor: project.quote?.totalMinor ?? null,
});

export const list = query({
  args: {
    workspaceId: v.id('workspaces'),
    stage: v.optional(salesOpenStageValidator),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(salesPipelineItemValidator),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    validateAccountPageSize(args.paginationOpts.numItems);
    const projects = await authorizedOpenProjects(context, member, args.stage);
    const result = await paginateWithFingerprintCursor(
      projects,
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
        SALES_OPEN_STAGES.findIndex((stage) => stage === first.stage) -
          SALES_OPEN_STAGES.findIndex((stage) => stage === second.stage) ||
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
