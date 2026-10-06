import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import { v, type Infer } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { canAccessAccount, requireSalesMember } from './accountPolicy';
import { validateAccountPageSize } from './accountQueryContract';
import { appendContactAudit } from './contactAudit';
import {
  contactValuesValidator,
  normalizeContactEmail,
  normalizeContactLastName,
} from './contactContract';
import { readContactReceipt, saveContactReceipt } from './contactOperations';
import {
  assertContactActive,
  assertContactRevision,
  requireAccessibleAccount,
  requireAccessibleContact,
} from './contactPolicy';
import {
  contactValidator,
  listContactDocuments,
  loadAccount,
  projectContact,
  projectContactPage,
  type AccountCache,
} from './contactQueries';
import { contactListArgs } from './contactQueryContract';
import { memberDisplayName } from './memberDisplayName';

export const list = query({
  args: contactListArgs,
  returns: v.object({
    ...paginationResultValidator(contactValidator).fields,
    scannedCount: v.number(),
  }),
  handler: async (context, args) => {
    const { member, contactsPage } = await listContactDocuments(
      context,
      args,
      false,
    );
    return {
      ...contactsPage,
      page: await projectContactPage(context, member, contactsPage.page),
    };
  },
});

export const get = query({
  args: {
    workspaceId: v.id('workspaces'),
    contactId: v.id('workspaceContacts'),
  },
  returns: v.union(contactValidator, v.null()),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    const contact = await context.db.get(args.contactId);
    if (contact === null || contact.deletedAt !== null) return null;
    return projectContact(context, member, contact);
  },
});

export const create = mutation({
  args: {
    operationId: v.string(),
    workspaceId: v.id('workspaces'),
    accountId: v.id('workspaceCompanies'),
    lastName: v.string(),
    email: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.id('workspaceContacts'),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    const receipt = await readContactReceipt(context, member, 'create', args);
    if (receipt !== null) return receipt.contactId;
    await requireAccessibleAccount(context, member, args.accountId);
    const lastName = normalizeContactLastName(args.lastName);
    const email = normalizeContactEmail(args.email ?? null);
    const now = Date.now();
    const contactId = await context.db.insert('workspaceContacts', {
      workspaceId: args.workspaceId,
      accountId: args.accountId,
      revision: 1,
      lastName,
      lastNameSortKey: lastName.toLowerCase(),
      email,
      sourceId: null,
      createdBy: member._id,
      updatedBy: member._id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await appendContactAudit(context, contactId, null);
    await saveContactReceipt(context, member, 'create', args, {
      contactId,
      revision: 1,
    });
    return contactId;
  },
});

type ContactEdits = {
  lastName?: string;
  email?: string | null;
  accountId?: Id<'workspaceCompanies'>;
};

const contactChanges = (
  contact: Doc<'workspaceContacts'>,
  args: ContactEdits,
) => {
  const lastName =
    args.lastName === undefined
      ? contact.lastName
      : normalizeContactLastName(args.lastName);
  return {
    accountId: args.accountId ?? contact.accountId,
    lastName,
    lastNameSortKey: lastName.toLowerCase(),
    email:
      args.email === undefined
        ? contact.email
        : normalizeContactEmail(args.email),
  };
};

export const update = mutation({
  args: {
    operationId: v.string(),
    workspaceId: v.id('workspaces'),
    contactId: v.id('workspaceContacts'),
    expectedRevision: v.number(),
    lastName: v.optional(v.string()),
    email: v.optional(v.union(v.string(), v.null())),
    accountId: v.optional(v.id('workspaceCompanies')),
  },
  returns: v.object({ revision: v.number() }),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    const accessible = await requireAccessibleContact(
      context,
      member,
      args.contactId,
    );
    const receipt = await readContactReceipt(context, member, 'update', args);
    if (receipt !== null) return { revision: receipt.revision };
    const { contact } = accessible;
    assertContactRevision(contact, args.expectedRevision);
    assertContactActive(accessible, false);
    if (args.accountId !== undefined && args.accountId !== contact.accountId)
      await requireAccessibleAccount(context, member, args.accountId);
    const revision = contact.revision + 1;
    await context.db.patch(contact._id, {
      ...contactChanges(contact, args),
      revision,
      updatedBy: member._id,
      updatedAt: Date.now(),
    });
    await appendContactAudit(context, contact._id, contact);
    await saveContactReceipt(context, member, 'update', args, {
      contactId: contact._id,
      revision,
    });
    return { revision };
  },
});

const historyAccountValidator = v.union(
  v.object({
    restricted: v.literal(false),
    accountId: v.id('workspaceCompanies'),
    accountName: v.string(),
  }),
  v.object({ restricted: v.literal(true) }),
);

const historyValuesValidator = v.object({
  account: historyAccountValidator,
  lastName: v.string(),
  email: v.union(v.string(), v.null()),
  revision: v.number(),
  deletedAt: v.union(v.number(), v.null()),
});

const historyAccount = async (
  context: QueryCtx,
  member: Doc<'workspaceMembers'>,
  accountId: Id<'workspaceCompanies'>,
  accountCache: AccountCache,
): Promise<Infer<typeof historyAccountValidator>> => {
  const account = await loadAccount(context, accountId, accountCache);
  if (account === null || !canAccessAccount(member, account))
    return { restricted: true };
  return { restricted: false, accountId, accountName: account.name };
};

const historyValues = async (
  context: QueryCtx,
  member: Doc<'workspaceMembers'>,
  values: Infer<typeof contactValuesValidator>,
  accountCache: AccountCache,
) => ({
  account: await historyAccount(
    context,
    member,
    values.accountId,
    accountCache,
  ),
  lastName: values.lastName,
  email: values.email,
  revision: values.revision,
  deletedAt: values.deletedAt,
});

const projectHistoryEntry = async (
  context: QueryCtx,
  member: Doc<'workspaceMembers'>,
  entry: Doc<'contactAudit'>,
  accountCache: AccountCache,
) => ({
  _id: entry._id,
  _creationTime: entry._creationTime,
  contactId: entry.contactId,
  actorId: entry.actorId,
  actorName: await memberDisplayName(context, entry.workspaceId, entry.actorId),
  timestamp: entry.timestamp,
  before:
    entry.before === null
      ? null
      : await historyValues(context, member, entry.before, accountCache),
  after: await historyValues(context, member, entry.after, accountCache),
});

export const history = query({
  args: {
    workspaceId: v.id('workspaces'),
    contactId: v.id('workspaceContacts'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      _id: v.id('contactAudit'),
      _creationTime: v.number(),
      contactId: v.id('workspaceContacts'),
      actorId: v.id('workspaceMembers'),
      actorName: v.string(),
      timestamp: v.number(),
      before: v.union(historyValuesValidator, v.null()),
      after: historyValuesValidator,
    }),
  ),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    const { contact } = await requireAccessibleContact(
      context,
      member,
      args.contactId,
    );
    validateAccountPageSize(args.paginationOpts.numItems);
    const result = await context.db
      .query('contactAudit')
      .withIndex('by_contactId', (index) => index.eq('contactId', contact._id))
      .paginate(args.paginationOpts);
    const accountCache: AccountCache = new Map();
    const page = [];
    for (const entry of result.page)
      page.push(
        await projectHistoryEntry(context, member, entry, accountCache),
      );
    return { ...result, page };
  },
});
