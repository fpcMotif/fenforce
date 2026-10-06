import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import { ConvexError, v, type Infer } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import {
  assertOwnerAssignment,
  canAccessAccount,
  requireSalesMember,
  validateAccountOwner,
} from './accountPolicy';
import { normalizeCompanyDomain } from './companyDomain';
import {
  accountValuesValidator,
  domainNameValidator,
  industryValidator,
  industryInputValidator,
  normalizeAccountName,
  normalizeIndustry,
} from './accountContract';
import { appendAccountAudit } from './accountAudit';
import { transitionAccount } from './accountLifecycleCommands';
import { isSalesRole } from './membershipRole';
import { readAccountReceipt, saveAccountReceipt } from './accountOperations';

export const companyValidator = v.object({
  _id: v.id('workspaceCompanies'),
  _creationTime: v.number(),
  workspaceId: v.id('workspaces'),
  revision: v.number(),
  name: v.string(),
  industry: industryValidator,
  domainName: domainNameValidator,
  accountOwnerId: v.union(v.id('workspaceMembers'), v.null()),
  accountOwnerName: v.union(v.string(), v.null()),
  createdBy: v.id('workspaceMembers'),
  createdByName: v.string(),
  updatedBy: v.id('workspaceMembers'),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.union(v.number(), v.null()),
  permissions: v.object({
    canUpdate: v.boolean(),
    canReassign: v.boolean(),
    canTrash: v.boolean(),
  }),
});

const validatePageSize = (numItems: number) => {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > 100)
    throw new ConvexError('INVALID_PAGE_SIZE');
};

const normalizeDomainName = (value: string) => {
  const domain = normalizeCompanyDomain(value);

  if (domain === null) {
    throw new ConvexError('INVALID_DOMAIN_NAME');
  }

  return {
    primaryLinkUrl: domain === '' ? '' : `https://${domain}`,
    primaryLinkLabel: domain,
    secondaryLinks: [],
  };
};

type AccountEdits = {
  name?: string;
  industry?: Infer<typeof industryInputValidator>;
  domainName?: string;
  accountOwnerId?: Id<'workspaceMembers'> | null;
};

const accountChanges = (
  company: Doc<'workspaceCompanies'>,
  args: AccountEdits,
) => ({
  name:
    args.name === undefined ? company.name : normalizeAccountName(args.name),
  industry: normalizeIndustry(
    args.industry === undefined ? company.industry : args.industry,
  ),
  domainName:
    args.domainName === undefined
      ? company.domainName
      : {
          ...normalizeDomainName(args.domainName),
          secondaryLinks: company.domainName.secondaryLinks,
        },
  accountOwnerId:
    args.accountOwnerId === undefined
      ? company.accountOwnerId
      : args.accountOwnerId,
});

const memberDisplayName = async (
  context: QueryCtx,
  workspaceId: Id<'workspaces'>,
  memberId: Id<'workspaceMembers'>,
) => {
  const member = await context.db.get(memberId);

  if (member === null || member.workspaceId !== workspaceId) {
    return memberId;
  }

  return member.displayName;
};

export const projectCompany = async (
  context: QueryCtx,
  company: Doc<'workspaceCompanies'>,
  member: Doc<'workspaceMembers'>,
) => {
  const createdByName = await memberDisplayName(
    context,
    company.workspaceId,
    company.createdBy,
  );
  const accountOwnerName =
    company.accountOwnerId === null
      ? null
      : company.accountOwnerId === company.createdBy
        ? createdByName
        : await memberDisplayName(
            context,
            company.workspaceId,
            company.accountOwnerId,
          );

  return {
    _id: company._id,
    _creationTime: company._creationTime,
    workspaceId: company.workspaceId,
    revision: company.revision,
    name: company.name,
    domainName: company.domainName,
    accountOwnerId: company.accountOwnerId,
    createdBy: company.createdBy,
    updatedBy: company.updatedBy,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
    deletedAt: company.deletedAt,
    industry: company.industry ?? null,
    accountOwnerName,
    createdByName,
    permissions: {
      canUpdate: company.deletedAt === null,
      canReassign: member.role === 'manager',
      canTrash: company.deletedAt === null,
    },
  };
};

export const list = query({
  args: {
    workspaceId: v.id('workspaces'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(companyValidator),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);

    validatePageSize(args.paginationOpts.numItems);

    const companies = context.db.query('workspaceCompanies');
    const accessible =
      member.role === 'manager'
        ? companies.withIndex(
            'by_workspaceId_and_deletedAt_and_name',
            (index) =>
              index.eq('workspaceId', args.workspaceId).eq('deletedAt', null),
          )
        : companies.withIndex(
            'by_workspaceId_and_accountOwnerId_and_deletedAt_and_name',
            (index) =>
              index
                .eq('workspaceId', args.workspaceId)
                .eq('accountOwnerId', member._id)
                .eq('deletedAt', null),
          );
    const companiesPage = await accessible.paginate(args.paginationOpts);

    return {
      ...companiesPage,
      page: await Promise.all(
        companiesPage.page.map((company) =>
          projectCompany(context, company, member),
        ),
      ),
    };
  },
});

export const get = query({
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
      company.deletedAt !== null
    ) {
      return null;
    }

    return projectCompany(context, company, member);
  },
});

export const create = mutation({
  args: {
    operationId: v.optional(v.string()),
    workspaceId: v.id('workspaces'),
    name: v.string(),
    industry: v.optional(industryInputValidator),
    domainName: v.optional(v.string()),
    accountOwnerId: v.optional(v.union(v.id('workspaceMembers'), v.null())),
  },
  returns: v.id('workspaceCompanies'),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    const accountOwnerId =
      args.accountOwnerId === undefined ? member._id : args.accountOwnerId;
    assertOwnerAssignment(member, accountOwnerId);
    const receipt = await readAccountReceipt(context, member, 'create', args);
    if (receipt !== null) return receipt.companyId;
    await validateAccountOwner(context, args.workspaceId, accountOwnerId);
    const now = Date.now();

    const companyId = await context.db.insert('workspaceCompanies', {
      workspaceId: args.workspaceId,
      revision: 1,
      name: normalizeAccountName(args.name),
      industry: normalizeIndustry(args.industry),
      domainName: normalizeDomainName(args.domainName ?? ''),
      accountOwnerId,
      createdBy: member._id,
      updatedBy: member._id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await appendAccountAudit(context, companyId, null);
    await saveAccountReceipt(context, member, 'create', args, {
      companyId,
      revision: 1,
      changed: true,
      requiresManager: accountOwnerId !== member._id,
    });
    return companyId;
  },
});

export const update = mutation({
  args: {
    operationId: v.optional(v.string()),
    workspaceId: v.id('workspaces'),
    companyId: v.id('workspaceCompanies'),
    expectedRevision: v.number(),
    name: v.optional(v.string()),
    industry: v.optional(industryInputValidator),
    domainName: v.optional(v.string()),
    accountOwnerId: v.optional(v.union(v.id('workspaceMembers'), v.null())),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    const company = await context.db.get(args.companyId);

    if (company === null || !canAccessAccount(member, company)) {
      throw new ConvexError('COMPANY_NOT_FOUND');
    }
    if (args.accountOwnerId !== undefined)
      assertOwnerAssignment(member, args.accountOwnerId);
    const receipt = await readAccountReceipt(context, member, 'update', args);
    if (receipt !== null) return null;
    if (company.deletedAt !== null) throw new ConvexError('COMPANY_NOT_FOUND');
    if (company.revision !== args.expectedRevision) {
      throw new ConvexError('COMPANY_CHANGED');
    }

    if (args.accountOwnerId !== undefined) {
      await validateAccountOwner(
        context,
        args.workspaceId,
        args.accountOwnerId,
      );
    }

    await context.db.patch(company._id, {
      revision: company.revision + 1,
      ...accountChanges(company, args),
      updatedBy: member._id,
      updatedAt: Date.now(),
    });
    await appendAccountAudit(context, company._id, company);
    await saveAccountReceipt(context, member, 'update', args, {
      companyId: company._id,
      revision: company.revision + 1,
      changed: true,
      requiresManager:
        args.accountOwnerId !== undefined &&
        args.accountOwnerId !== company.accountOwnerId,
    });

    return null;
  },
});

export const softDelete = mutation({
  args: {
    operationId: v.optional(v.string()),
    workspaceId: v.id('workspaces'),
    companyId: v.id('workspaceCompanies'),
    expectedRevision: v.number(),
  },
  returns: v.null(),
  handler: async (context, args) => {
    await transitionAccount(context, args, true);
    return null;
  },
});

export const history = query({
  args: {
    workspaceId: v.id('workspaces'),
    companyId: v.id('workspaceCompanies'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      _id: v.id('accountAudit'),
      _creationTime: v.number(),
      workspaceId: v.id('workspaces'),
      companyId: v.id('workspaceCompanies'),
      actorId: v.id('workspaceMembers'),
      actorName: v.string(),
      beforeOwnerName: v.union(v.string(), v.null()),
      afterOwnerName: v.union(v.string(), v.null()),
      timestamp: v.number(),
      before: v.union(accountValuesValidator, v.null()),
      after: accountValuesValidator,
    }),
  ),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    const company = await context.db.get(args.companyId);
    if (company === null || !canAccessAccount(member, company))
      throw new ConvexError('COMPANY_NOT_FOUND');
    validatePageSize(args.paginationOpts.numItems);
    const result = await context.db
      .query('accountAudit')
      .withIndex('by_companyId', (index) => index.eq('companyId', company._id))
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (entry) => ({
          ...entry,
          actorName: await memberDisplayName(
            context,
            args.workspaceId,
            entry.actorId,
          ),
          beforeOwnerName: entry.before?.accountOwnerId
            ? await memberDisplayName(
                context,
                args.workspaceId,
                entry.before.accountOwnerId,
              )
            : null,
          afterOwnerName: entry.after.accountOwnerId
            ? await memberDisplayName(
                context,
                args.workspaceId,
                entry.after.accountOwnerId,
              )
            : null,
        })),
      ),
    };
  },
});

export const listEligibleOwners = query({
  args: {
    workspaceId: v.id('workspaces'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({ memberId: v.id('workspaceMembers'), displayName: v.string() }),
  ),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    validatePageSize(args.paginationOpts.numItems);
    const members = await context.db
      .query('workspaceMembers')
      .withIndex('by_workspaceId_and_userId', (index) =>
        member.role === 'manager'
          ? index.eq('workspaceId', args.workspaceId)
          : index
              .eq('workspaceId', args.workspaceId)
              .eq('userId', member.userId),
      )
      .paginate(args.paginationOpts);
    return {
      ...members,
      page: members.page
        .filter((member) => member.active !== false && isSalesRole(member.role))
        .map((member) => ({
          memberId: member._id,
          displayName: member.displayName,
        })),
    };
  },
});
