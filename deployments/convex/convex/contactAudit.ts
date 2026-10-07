import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';

const values = (contact: Doc<'workspaceContacts'>) => ({
  accountId: contact.accountId,
  lastName: contact.lastName,
  email: contact.email,
  revision: contact.revision,
  deletedAt: contact.deletedAt,
});

export const appendContactAudit = async (
  context: MutationCtx,
  contactId: Id<'workspaceContacts'>,
  before: Doc<'workspaceContacts'> | null,
) => {
  const after = await context.db.get(contactId);
  if (after === null) throw new Error('Contact missing after accepted write');
  await context.db.insert('contactAudit', {
    workspaceId: after.workspaceId,
    contactId,
    actorId: after.updatedBy,
    timestamp: after.updatedAt,
    before: before === null ? null : values(before),
    after: values(after),
  });
};
