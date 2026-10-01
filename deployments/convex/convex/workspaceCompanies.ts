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

const domainNameValidator = v.object({
  primaryLinkUrl: v.string(),
  primaryLinkLabel: v.string(),
  secondaryLinks: v.array(v.object({ url: v.string(), label: v.string() })),
});

const companyValidator = v.object({
  _id: v.id('workspaceCompanies'),
  _creationTime: v.number(),
  workspaceId: v.id('workspaces'),
  revision: v.number(),
  name: v.string(),
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

const normalizeName = (value: string) => {
  const name = value.trim();

  if (name.length === 0 || name.length > 255) {
    throw new ConvexError('INVALID_COMPANY_NAME');
  }

  return name;
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
    return;
  }

  const owner = await context.db.get(ownerId);

  if (owner === null || owner.workspaceId !== workspaceId) {
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

  return { ...company, accountOwnerName, createdByName };
};

export const list = query({
  args: {
    workspaceId: v.id('workspaces'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(companyValidator),
  handler: async (context, args) => {
    await requireWorkspaceMember(context, args.workspaceId);

    if (
      !Number.isInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > 100
    ) {
      throw new ConvexError('INVALID_PAGE_SIZE');
    }

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
    domainName: v.optional(v.string()),
    accountOwnerId: v.optional(v.union(v.id('workspaceMembers'), v.null())),
  },
  returns: v.id('workspaceCompanies'),
  handler: async (context, args) => {
    const member = await requireWorkspaceMember(context, args.workspaceId);
    const accountOwnerId = args.accountOwnerId ?? null;
    await validateOwner(context, args.workspaceId, accountOwnerId);
    const now = Date.now();

    return context.db.insert('workspaceCompanies', {
      workspaceId: args.workspaceId,
      revision: 1,
      name: normalizeName(args.name),
      domainName: normalizeDomainName(args.domainName ?? ''),
      accountOwnerId,
      createdBy: member._id,
      updatedBy: member._id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  },
});

export const update = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    companyId: v.id('workspaceCompanies'),
    expectedRevision: v.number(),
    name: v.optional(v.string()),
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
      name: args.name === undefined ? company.name : normalizeName(args.name),
      domainName:
        args.domainName === undefined
          ? company.domainName
          : normalizeDomainName(args.domainName),
      accountOwnerId:
        args.accountOwnerId === undefined
          ? company.accountOwnerId
          : args.accountOwnerId,
      updatedBy: member._id,
      updatedAt: Date.now(),
    });

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

    return null;
  },
});
