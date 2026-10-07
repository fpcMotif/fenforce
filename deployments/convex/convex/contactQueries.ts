import { type QueryStream, stream } from 'convex-helpers/server/stream';
import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import {
  assertAccountQueryIndexReady,
  authorizedAccountStream,
  resolveAccountOwnerFilter,
} from './accountQueries';
import { canAccessAccount, requireSalesMember } from './accountPolicy';
import { validateAccountPageSize } from './accountQueryContract';
import { requireAccessibleAccount } from './contactPolicy';
import {
  normalizeContactSearch,
  type ContactListArgs,
} from './contactQueryContract';
import { paginateWithFingerprintCursor } from './fingerprintCursor';
import { memberDisplayName } from './memberDisplayName';
import schema from './schema';
import { SingleAccountStream } from './singleAccountStream';

export const contactValidator = v.object({
  _id: v.id('workspaceContacts'),
  _creationTime: v.number(),
  workspaceId: v.id('workspaces'),
  accountId: v.id('workspaceCompanies'),
  accountName: v.string(),
  lastName: v.string(),
  email: v.union(v.string(), v.null()),
  revision: v.number(),
  createdBy: v.id('workspaceMembers'),
  createdByName: v.string(),
  updatedBy: v.id('workspaceMembers'),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.union(v.number(), v.null()),
  permissions: v.object({
    canUpdate: v.boolean(),
    canTrash: v.boolean(),
    canRestore: v.boolean(),
  }),
});

export type AccountCache = Map<
  Id<'workspaceCompanies'>,
  Doc<'workspaceCompanies'> | null
>;

const CONTACT_INDEX_FIELDS = [
  'accountId',
  'deletedAt',
  'lastNameSortKey',
  '_creationTime',
  '_id',
];

const indexedAccountContactStream = (
  context: QueryCtx,
  accountId: Id<'workspaceCompanies'>,
  trashed: boolean,
) => {
  const contacts = stream(context.db, schema).query('workspaceContacts');
  return trashed
    ? contacts.withIndex(
        'by_accountId_and_deletedAt_and_lastNameSortKey',
        (index) => index.eq('accountId', accountId).gt('deletedAt', null),
      )
    : contacts.withIndex(
        'by_accountId_and_deletedAt_and_lastNameSortKey',
        (index) => index.eq('accountId', accountId).eq('deletedAt', null),
      );
};

const accountContactStream = (
  context: QueryCtx,
  accountId: Id<'workspaceCompanies'>,
  trashed: boolean,
) =>
  new SingleAccountStream(
    indexedAccountContactStream(context, accountId, trashed),
    accountId,
  );

const accessibleContactStream = async (
  context: QueryCtx,
  member: Doc<'workspaceMembers'>,
  accountId: Id<'workspaceCompanies'> | undefined,
  trashed: boolean,
): Promise<QueryStream<Doc<'workspaceContacts'>>> => {
  if (accountId !== undefined) {
    await requireAccessibleAccount(context, member, accountId);
    return accountContactStream(context, accountId, trashed);
  }
  const ownerId = await resolveAccountOwnerFilter(context, member, undefined);
  await assertAccountQueryIndexReady(context, member.workspaceId, ownerId);
  return authorizedAccountStream(context, member.workspaceId, ownerId).flatMap(
    async (account) => accountContactStream(context, account._id, trashed),
    CONTACT_INDEX_FIELDS,
  );
};

export const contactQueryFingerprint = (
  args: ContactListArgs,
  member: Doc<'workspaceMembers'>,
  search: string,
  trashed: boolean,
) =>
  JSON.stringify([
    1,
    args.workspaceId,
    member._id,
    member.role,
    search,
    args.accountId ?? null,
    trashed,
  ]);

export const listContactDocuments = async (
  context: QueryCtx,
  args: ContactListArgs,
  trashed: boolean,
) => {
  const member = await requireSalesMember(context, args.workspaceId);
  validateAccountPageSize(args.paginationOpts.numItems);
  const search = normalizeContactSearch(args.search);
  const fingerprint = contactQueryFingerprint(args, member, search, trashed);
  const contacts = await accessibleContactStream(
    context,
    member,
    args.accountId,
    trashed,
  );
  let scannedCount = 0;
  const contactsPage = await paginateWithFingerprintCursor(
    contacts.filterWith(async (contact) => {
      scannedCount++;
      return contact.lastNameSortKey.includes(search);
    }),
    args.paginationOpts,
    fingerprint,
    'INVALID_CONTACT_CURSOR',
  );
  return { member, contactsPage: { ...contactsPage, scannedCount } };
};

export const loadAccount = async (
  context: QueryCtx,
  accountId: Id<'workspaceCompanies'>,
  accountCache: AccountCache,
) => {
  if (!accountCache.has(accountId))
    accountCache.set(accountId, await context.db.get(accountId));
  return accountCache.get(accountId) ?? null;
};

export const projectContact = async (
  context: QueryCtx,
  member: Doc<'workspaceMembers'>,
  contact: Doc<'workspaceContacts'>,
  accountCache: AccountCache = new Map(),
) => {
  const account = await loadAccount(context, contact.accountId, accountCache);
  if (
    account === null ||
    contact.workspaceId !== member.workspaceId ||
    !canAccessAccount(member, account) ||
    account.deletedAt !== null
  )
    return null;
  const isActive = contact.deletedAt === null;
  return {
    _id: contact._id,
    _creationTime: contact._creationTime,
    workspaceId: contact.workspaceId,
    accountId: contact.accountId,
    accountName: account.name,
    lastName: contact.lastName,
    email: contact.email,
    revision: contact.revision,
    createdBy: contact.createdBy,
    createdByName: await memberDisplayName(
      context,
      contact.workspaceId,
      contact.createdBy,
    ),
    updatedBy: contact.updatedBy,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
    deletedAt: contact.deletedAt,
    permissions: {
      canUpdate: isActive,
      canTrash: isActive,
      canRestore: !isActive,
    },
  };
};

export const projectContactPage = async (
  context: QueryCtx,
  member: Doc<'workspaceMembers'>,
  contacts: Array<Doc<'workspaceContacts'>>,
) => {
  const accountCache: AccountCache = new Map();
  const projected = [];
  for (const contact of contacts) {
    const visible = await projectContact(
      context,
      member,
      contact,
      accountCache,
    );
    if (visible !== null) projected.push(visible);
  }
  return projected;
};
