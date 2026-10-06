import { ConvexError } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { canAccessAccount } from './accountPolicy';

export type AccessibleContact = {
  contact: Doc<'workspaceContacts'>;
  account: Doc<'workspaceCompanies'>;
};

export const requireAccessibleAccount = async (
  context: QueryCtx,
  member: Doc<'workspaceMembers'>,
  accountId: Id<'workspaceCompanies'>,
) => {
  const account = await context.db.get(accountId);
  if (
    account === null ||
    !canAccessAccount(member, account) ||
    account.deletedAt !== null
  )
    throw new ConvexError('COMPANY_NOT_FOUND');
  return account;
};

export const requireAccessibleContact = async (
  context: QueryCtx,
  member: Doc<'workspaceMembers'>,
  contactId: Id<'workspaceContacts'>,
): Promise<AccessibleContact> => {
  const contact = await context.db.get(contactId);
  if (contact === null || contact.workspaceId !== member.workspaceId)
    throw new ConvexError('CONTACT_NOT_FOUND');
  const account = await context.db.get(contact.accountId);
  if (account === null || !canAccessAccount(member, account))
    throw new ConvexError('CONTACT_NOT_FOUND');
  return { contact, account };
};

export const assertContactActive = (
  { contact, account }: AccessibleContact,
  expectTrashed: boolean,
) => {
  if (account.deletedAt !== null) throw new ConvexError('CONTACT_NOT_FOUND');
  if ((contact.deletedAt !== null) !== expectTrashed)
    throw new ConvexError('CONTACT_NOT_FOUND');
};

export const assertContactRevision = (
  contact: Doc<'workspaceContacts'>,
  expectedRevision: number,
) => {
  if (contact.revision !== expectedRevision)
    throw new ConvexError('CONTACT_CHANGED');
};
