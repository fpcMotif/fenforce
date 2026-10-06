import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import { ConvexError, v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { requireWorkspaceAdmin, requireWorkspaceMember } from './authorization';
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
import { isSalesRole } from './membershipRole';

const companyValidator = v.object({
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

const validateOwner = async (
  context: MutationCtx,
  workspaceId: Id<'workspaces'>,
  ownerId: Id<'workspaceMembers'> | null,
) => {
  if (ownerId === null) {
    throw new ConvexError('INVALID_ACCOUNT_OWNER');
  }

  const owner = await context.db.get(ownerId);

  if (
    owner === null ||
    owner.workspaceId !== workspaceId ||
    owner.active === false ||
    !isSalesRole(owner.role)
  ) {
    throw new ConvexError('INVALID_ACCOUNT_OWNER');
  }
};

const memberDisplayName = async (
  context: QueryCtx,
  workspaceId: Id<'workspaces'>,
  memberId: Id<'workspaceMembers'>,
) => {
  const member = await context.db.get(memberId);

  if (member === null || member.workspaceId !== workspaceId) {
    throw new ConvexError('INVALID_COMPANY_MEMBER');
  }

  return member.displayName;
};

const projectCompany = async (
  context: QueryCtx,
  company: Doc<'workspaceCompanies'>,
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
    ...company,
    industry: company.industry ?? null,
    accountOwnerName,
    createdByName,
  };
};

export const list = query({
  args: {
    workspaceId: v.id('workspaces'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(companyValidator),
  handler: async (context, args) => {
    await requireWorkspaceMember(context, args.workspaceId);

    validatePageSize(args.paginationOpts.numItems);

    const companiesPage = await context.db
      .query('workspaceCompanies')
      .withIndex('by_workspaceId_and_deletedAt_and_name', (index) =>
        index.eq('workspaceId', args.workspaceId).eq('deletedAt', null),
      )
      .paginate(args.paginationOpts);

    return {
      ...companiesPage,
      page: await Promise.all(
        companiesPage.page.map((company) => projectCompany(context, company)),
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
    await requireWorkspaceMember(context, args.workspaceId);
    const company = await context.db.get(args.companyId);

    if (
      company === null ||
      company.workspaceId !== args.workspaceId ||
      company.deletedAt !== null
    ) {
      return null;
    }

    return projectCompany(context, company);
  },
});

export const create = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    name: v.string(),
    industry: v.optional(industryInputValidator),
    domainName: v.optional(v.string()),
    accountOwnerId: v.optional(v.union(v.id('workspaceMembers'), v.null())),
  },
  returns: v.id('workspaceCompanies'),
  handler: async (context, args) => {
    const member = await requireWorkspaceMember(context, args.workspaceId);
    const accountOwnerId =
      args.accountOwnerId === undefined ? member._id : args.accountOwnerId;
    await validateOwner(context, args.workspaceId, accountOwnerId);
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
    return companyId;
  },
});

export const update = mutation({
  args: {
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
    const member = await requireWorkspaceMember(context, args.workspaceId);
    const company = await context.db.get(args.companyId);

    if (
      company === null ||
      company.workspaceId !== args.workspaceId ||
      company.deletedAt !== null
    ) {
      throw new ConvexError('COMPANY_NOT_FOUND');
    }

    if (company.revision !== args.expectedRevision) {
      throw new ConvexError('COMPANY_CHANGED');
    }

    if (args.accountOwnerId !== undefined) {
      await validateOwner(context, args.workspaceId, args.accountOwnerId);
    }

    await context.db.patch(company._id, {
      revision: company.revision + 1,
      name:
        args.name === undefined
          ? company.name
          : normalizeAccountName(args.name),
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
      updatedBy: member._id,
      updatedAt: Date.now(),
    });
    await appendAccountAudit(context, company._id, company);

    return null;
  },
});

export const softDelete = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    companyId: v.id('workspaceCompanies'),
  },
  returns: v.null(),
  handler: async (context, args) => {
    const member = await requireWorkspaceAdmin(context, args.workspaceId);
    const company = await context.db.get(args.companyId);

    if (
      company === null ||
      company.workspaceId !== args.workspaceId ||
      company.deletedAt !== null
    ) {
      throw new ConvexError('COMPANY_NOT_FOUND');
    }

    const now = Date.now();
    await context.db.patch(company._id, {
      revision: company.revision + 1,
      deletedAt: now,
      updatedAt: now,
      updatedBy: member._id,
    });
    await appendAccountAudit(context, company._id, company);

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
      timestamp: v.number(),
      before: v.union(accountValuesValidator, v.null()),
      after: accountValuesValidator,
    }),
  ),
  handler: async (context, args) => {
    await requireWorkspaceMember(context, args.workspaceId);
    const company = await context.db.get(args.companyId);
    if (company === null || company.workspaceId !== args.workspaceId)
      throw new ConvexError('COMPANY_NOT_FOUND');
    validatePageSize(args.paginationOpts.numItems);
    return context.db
      .query('accountAudit')
      .withIndex('by_companyId', (index) => index.eq('companyId', company._id))
      .paginate(args.paginationOpts);
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
    await requireWorkspaceMember(context, args.workspaceId);
    validatePageSize(args.paginationOpts.numItems);
    const members = await context.db
      .query('workspaceMembers')
      .withIndex('by_workspaceId_and_userId', (index) =>
        index.eq('workspaceId', args.workspaceId),
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
