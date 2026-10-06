import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import { ConvexError, v } from 'convex/values';

import { mutation, query } from './_generated/server';
import {
  accessibleAccount,
  assertAccountRevision,
  transitionAccount,
} from './accountLifecycleCommands';
import {
  canAccessAccount,
  requireSalesMember,
  validateAccountOwner,
} from './accountPolicy';
import { appendAccountAudit } from './accountAudit';
import { readAccountReceipt, saveAccountReceipt } from './accountOperations';
import { validateAccountPageSize } from './accountQueryContract';
import { companyValidator, projectCompany } from './workspaceCompanies';

const lifecycleArguments = {
  operationId: v.optional(v.string()),
  workspaceId: v.id('workspaces'),
  companyId: v.id('workspaceCompanies'),
  expectedRevision: v.number(),
};
const lifecycleResult = v.object({
  revision: v.number(),
  changed: v.boolean(),
});

export const trash = mutation({
  args: lifecycleArguments,
  returns: lifecycleResult,
  handler: (context, args) => transitionAccount(context, args, true),
});

export const restore = mutation({
  args: lifecycleArguments,
  returns: lifecycleResult,
  handler: (context, args) => transitionAccount(context, args, false),
});

export const reassignTrashed = mutation({
  args: { ...lifecycleArguments, accountOwnerId: v.id('workspaceMembers') },
  returns: lifecycleResult,
  handler: async (context, args) => {
    const { member, company } = await accessibleAccount(context, args);
    if (member.role !== 'manager') throw new ConvexError('FORBIDDEN');
    const receipt = await readAccountReceipt(context, member, 'reassign', args);
    if (receipt !== null)
      return { revision: receipt.revision, changed: receipt.changed };
    if (company.deletedAt === null) throw new ConvexError('COMPANY_NOT_FOUND');
    assertAccountRevision(company, args.expectedRevision);
    await validateAccountOwner(context, args.workspaceId, args.accountOwnerId);
    if (company.accountOwnerId === args.accountOwnerId) {
      await saveAccountReceipt(context, member, 'reassign', args, {
        companyId: company._id,
        revision: company.revision,
        changed: false,
        requiresManager: true,
      });
      return { revision: company.revision, changed: false };
    }
    await context.db.patch(company._id, {
      accountOwnerId: args.accountOwnerId,
      revision: company.revision + 1,
      updatedAt: Date.now(),
      updatedBy: member._id,
    });
    await appendAccountAudit(context, company._id, company);
    await saveAccountReceipt(context, member, 'reassign', args, {
      companyId: company._id,
      revision: company.revision + 1,
      changed: true,
      requiresManager: true,
    });
    return { revision: company.revision + 1, changed: true };
  },
});

export const listTrash = query({
  args: {
    workspaceId: v.id('workspaces'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(companyValidator),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    validateAccountPageSize(args.paginationOpts.numItems);
    const companies = context.db.query('workspaceCompanies');
    const accessible =
      member.role === 'manager'
        ? companies.withIndex(
            'by_workspaceId_and_deletedAt_and_nameSortKey',
            (index) =>
              index.eq('workspaceId', args.workspaceId).gt('deletedAt', null),
          )
        : companies.withIndex(
            'by_workspaceId_and_accountOwnerId_and_deletedAt_and_nameSortKey',
            (index) =>
              index
                .eq('workspaceId', args.workspaceId)
                .eq('accountOwnerId', member._id)
                .gt('deletedAt', null),
          );
    const result = await accessible.paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map((company) => projectCompany(context, company, member)),
      ),
    };
  },
});

export const getTrashed = query({
  args: {
    workspaceId: v.id('workspaces'),
    companyId: v.id('workspaceCompanies'),
  },
  returns: v.union(companyValidator, v.null()),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    const company = await context.db.get(args.companyId);
    if (
      company === null ||
      !canAccessAccount(member, company) ||
      company.deletedAt === null
    )
      return null;
    return projectCompany(context, company, member);
  },
});
