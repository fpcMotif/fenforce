import { paginationResultValidator } from 'convex/server';
import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { requireSalesMember } from './accountPolicy';
import { appendContactAudit } from './contactAudit';
import { readContactReceipt, saveContactReceipt } from './contactOperations';
import {
  assertContactActive,
  assertContactRevision,
  requireAccessibleContact,
} from './contactPolicy';
import {
  contactValidator,
  listContactDocuments,
  projectContact,
  projectContactPage,
} from './contactQueries';
import { contactTrashArgs } from './contactQueryContract';

type ContactLifecycleArguments = {
  operationId: string;
  workspaceId: Id<'workspaces'>;
  contactId: Id<'workspaceContacts'>;
  expectedRevision: number;
};

const lifecycleArguments = {
  operationId: v.string(),
  workspaceId: v.id('workspaces'),
  contactId: v.id('workspaceContacts'),
  expectedRevision: v.number(),
};
const lifecycleResult = v.object({
  revision: v.number(),
  changed: v.boolean(),
});

const transitionContact = async (
  context: MutationCtx,
  args: ContactLifecycleArguments,
  trashed: boolean,
) => {
  const member = await requireSalesMember(context, args.workspaceId);
  const accessible = await requireAccessibleContact(
    context,
    member,
    args.contactId,
  );
  const operation = trashed ? 'trash' : 'restore';
  const receipt = await readContactReceipt(context, member, operation, args);
  if (receipt !== null)
    return { revision: receipt.revision, changed: receipt.changed };
  const { contact } = accessible;
  assertContactRevision(contact, args.expectedRevision);
  assertContactActive(accessible, !trashed);
  const now = Date.now();
  const revision = contact.revision + 1;
  await context.db.patch(contact._id, {
    deletedAt: trashed ? now : null,
    revision,
    updatedAt: now,
    updatedBy: member._id,
  });
  await appendContactAudit(context, contact._id, contact);
  await saveContactReceipt(context, member, operation, args, {
    contactId: contact._id,
    revision,
  });
  return { revision, changed: true };
};

export const trash = mutation({
  args: lifecycleArguments,
  returns: lifecycleResult,
  handler: (context, args) => transitionContact(context, args, true),
});

export const restore = mutation({
  args: lifecycleArguments,
  returns: lifecycleResult,
  handler: (context, args) => transitionContact(context, args, false),
});

export const listTrash = query({
  args: contactTrashArgs,
  returns: v.object({
    ...paginationResultValidator(contactValidator).fields,
    scannedCount: v.number(),
  }),
  handler: async (context, args) => {
    const { member, contactsPage } = await listContactDocuments(
      context,
      args,
      true,
    );
    return {
      ...contactsPage,
      page: await projectContactPage(context, member, contactsPage.page),
    };
  },
});

export const getTrashed = query({
  args: {
    workspaceId: v.id('workspaces'),
    contactId: v.id('workspaceContacts'),
  },
  returns: v.union(contactValidator, v.null()),
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    const contact = await context.db.get(args.contactId);
    if (contact === null || contact.deletedAt === null) return null;
    return projectContact(context, member, contact);
  },
});
