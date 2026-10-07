import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { requireSalesMember } from './accountPolicy';
import { requireAccessibleAccount } from './contactPolicy';
import { operationPayload } from './operationReceipt';
import { salesApplyCommand } from './salesCommands';
import {
  salesCommandValidator,
  salesEventValidator,
  salesProductFields,
  salesProjectValidator,
  salesSnapshotValidator,
  type SalesCommand,
  type SalesProject,
} from './salesContract';
import { salesReadReceipt, salesSaveReceipt } from './salesOperations';
import {
  salesAccessibleProject,
  salesCheckOwner,
  salesCurrentBlockers,
  salesRequireProject,
} from './salesPolicy';
import {
  salesDate,
  salesQuantity,
  salesRequire,
  salesText,
  salesValidateCommand,
} from './salesValidation';

export const create = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    operationId: v.string(),
    accountId: v.id('workspaceCompanies'),
    ...salesProductFields,
    nextAction: v.string(),
    nextActionDate: v.string(),
  },
  returns: v.id('salesProjects'),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    const account = await requireAccessibleAccount(
      context,
      member,
      args.accountId,
    );
    const payload = operationPayload({ ...args, operation: 'create' });
    const receipt = await salesReadReceipt(
      context,
      member,
      args.operationId,
      payload,
    );
    if (receipt !== null) return receipt.projectId;
    const ownerCheckedId = await salesCheckOwner(context, account);
    const { operationId, ...input } = args;
    for (const value of [
      args.title,
      args.materialCode,
      args.productName,
      args.specification,
      args.application,
      args.nextAction,
    ])
      salesText(value);
    salesQuantity(args.quantityMilli, args.unit);
    salesDate(args.nextActionDate);
    const now = Date.now();
    const projectId = await context.db.insert('salesProjects', {
      ...input,
      mode: 'demo',
      simulation: true,
      revision: 1,
      quoteVersion: 0,
      ownerCheckedId,
      ownerCheckedAt: now,
      stage: 'qualified',
      outcome: 'open',
      sample: null,
      quote: null,
      purchaseOrder: null,
      pricingReview: null,
      orderReview: null,
      confirmation: null,
      releases: [],
      lostReason: null,
      createdBy: member._id,
      updatedBy: member._id,
      createdAt: now,
      updatedAt: now,
    });
    await context.db.insert('salesProjectEvents', {
      mode: 'demo',
      simulation: true,
      workspaceId: args.workspaceId,
      projectId,
      actorId: member._id,
      timestamp: now,
      revision: 1,
      command: { type: 'create' },
      previousQuote: null,
      snapshotId: null,
    });
    await salesSaveReceipt(context, member, operationId, payload, projectId, 1);
    return projectId;
  },
});

const salesSummaryValidator = v.object({
  _id: v.id('salesProjects'),
  mode: v.literal('demo'),
  simulation: v.literal(true),
  title: v.string(),
  materialCode: v.string(),
  productName: v.string(),
  accountId: v.id('workspaceCompanies'),
  revision: v.number(),
  stage: salesProjectValidator.fields.stage,
  outcome: salesProjectValidator.fields.outcome,
  nextAction: v.string(),
  nextActionDate: v.string(),
  updatedAt: v.number(),
});

const salesSummary = (project: SalesProject) => ({
  _id: project._id,
  mode: project.mode,
  simulation: project.simulation,
  title: project.title,
  materialCode: project.materialCode,
  productName: project.productName,
  accountId: project.accountId,
  revision: project.revision,
  stage: project.stage,
  outcome: project.outcome,
  nextAction: project.nextAction,
  nextActionDate: project.nextActionDate,
  updatedAt: project.updatedAt,
});

const salesPageSize = (numItems: number) =>
  salesRequire(
    Number.isSafeInteger(numItems) && numItems > 0 && numItems <= 50,
    'SALES_INVALID_PAGE_SIZE',
  );

export const list = query({
  args: {
    workspaceId: v.id('workspaces'),
    accountId: v.id('workspaceCompanies'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(salesSummaryValidator),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    await requireAccessibleAccount(context, member, args.accountId);
    salesPageSize(args.paginationOpts.numItems);
    const result = await context.db
      .query('salesProjects')
      .withIndex('by_accountId', (index) =>
        index.eq('accountId', args.accountId),
      )
      .order('desc')
      .paginate(args.paginationOpts);
    return { ...result, page: result.page.map(salesSummary) };
  },
});

export const get = query({
  args: { workspaceId: v.id('workspaces'), projectId: v.id('salesProjects') },
  returns: v.union(
    v.object({
      ...salesProjectValidator.fields,
      currentReview: v.union(salesSnapshotValidator, v.null()),
      blockers: v.array(v.string()),
      simulationLabel: v.literal(
        'Demo simulation: no Feishu, email or SAP calls',
      ),
    }),
    v.null(),
  ),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    const accessible = await salesAccessibleProject(
      context,
      member,
      args.projectId,
    );
    if (accessible === null) return null;
    const { project, account } = accessible;
    const review = project.orderReview ?? project.pricingReview;
    const currentReview =
      review === null ? null : await context.db.get(review.snapshotId);
    const blockers = await salesCurrentBlockers(context, project, account);
    return {
      ...project,
      currentReview,
      blockers,
      simulationLabel:
        'Demo simulation: no Feishu, email or SAP calls' as const,
    };
  },
});

export const history = query({
  args: {
    workspaceId: v.id('workspaces'),
    projectId: v.id('salesProjects'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(salesEventValidator),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    await salesRequireProject(context, member, args.projectId);
    salesPageSize(args.paginationOpts.numItems);
    return context.db
      .query('salesProjectEvents')
      .withIndex('by_projectId', (index) =>
        index.eq('projectId', args.projectId),
      )
      .order('desc')
      .paginate(args.paginationOpts);
  },
});

export const execute = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    projectId: v.id('salesProjects'),
    expectedRevision: v.number(),
    operationId: v.string(),
    command: salesCommandValidator,
  },
  returns: v.object({ revision: v.number() }),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    const { project, account } = await salesRequireProject(
      context,
      member,
      args.projectId,
    );
    const payload = operationPayload({
      ...args,
      operation: 'execute',
      command: operationPayload(args.command),
    });
    const receipt = await salesReadReceipt(
      context,
      member,
      args.operationId,
      payload,
    );
    if (receipt !== null) return { revision: receipt.revision };
    salesRequire(
      Number.isSafeInteger(args.expectedRevision) &&
        args.expectedRevision === project.revision,
      'SALES_PROJECT_CHANGED',
    );
    salesValidateCommand(args.command);
    const previousQuote =
      args.command.type === 'reviseQuote' ? project.quote : null;
    await salesApplyCommand(
      { context, member, account, project },
      args.command,
    );
    project.revision += 1;
    project.updatedBy = member._id;
    project.updatedAt = Date.now();
    const { _id, _creationTime: _creation, ...values } = project;
    await context.db.replace(_id, values);
    await context.db.insert('salesProjectEvents', {
      mode: 'demo',
      simulation: true,
      workspaceId: args.workspaceId,
      projectId: _id,
      actorId: member._id,
      timestamp: project.updatedAt,
      revision: project.revision,
      command: args.command,
      previousQuote,
      snapshotId: salesEventSnapshot(project, args.command),
    });
    await salesSaveReceipt(
      context,
      member,
      args.operationId,
      payload,
      _id,
      project.revision,
    );
    return { revision: project.revision };
  },
});

const salesEventSnapshot = (project: SalesProject, command: SalesCommand) => {
  const pricingCommand =
    command.type === 'submitPricingReview' ||
    (command.type === 'simulateReviewDecision' && command.gate === 'pricing');
  const review = pricingCommand
    ? project.pricingReview
    : (project.orderReview ?? project.pricingReview);
  return review === null ? null : review.snapshotId;
};
