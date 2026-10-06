import { ConvexError } from 'convex/values';

import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { appendContactAudit } from './contactAudit';
import {
  normalizeContactEmail,
  normalizeContactLastName,
} from './contactContract';

export const findContactBySourceId = (
  context: QueryCtx,
  workspaceId: Id<'workspaces'>,
  sourceId: string,
) =>
  context.db
    .query('workspaceContacts')
    .withIndex('by_workspaceId_and_sourceId', (index) =>
      index.eq('workspaceId', workspaceId).eq('sourceId', sourceId),
    )
    .unique();

export type ImportedContact = {
  workspaceId: Id<'workspaces'>;
  accountId: Id<'workspaceCompanies'>;
  actorId: Id<'workspaceMembers'>;
  sourceId: string;
  lastName: string;
  email: string | null;
};

export const insertImportedContact = async (
  context: MutationCtx,
  imported: ImportedContact,
) => {
  const existing = await findContactBySourceId(
    context,
    imported.workspaceId,
    imported.sourceId,
  );
  if (existing !== null) throw new ConvexError('DUPLICATE_CONTACT_SOURCE_ID');
  const account = await context.db.get(imported.accountId);
  if (account === null || account.workspaceId !== imported.workspaceId)
    throw new ConvexError('COMPANY_NOT_FOUND');
  const lastName = normalizeContactLastName(imported.lastName);
  const now = Date.now();
  const contactId = await context.db.insert('workspaceContacts', {
    workspaceId: imported.workspaceId,
    accountId: imported.accountId,
    revision: 1,
    lastName,
    lastNameSortKey: lastName.toLowerCase(),
    email: normalizeContactEmail(imported.email),
    sourceId: imported.sourceId,
    createdBy: imported.actorId,
    updatedBy: imported.actorId,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  await appendContactAudit(context, contactId, null);
  return contactId;
};
