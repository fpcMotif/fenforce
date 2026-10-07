import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v, type Infer } from 'convex/values';

import { CONTACT_FIELDS } from './contactFields';

export const contactListArgs = {
  workspaceId: v.id('workspaces'),
  paginationOpts: paginationOptsValidator,
  search: v.optional(v.string()),
  accountId: v.optional(v.id('workspaceCompanies')),
};

export const contactTrashArgs = contactListArgs;

const contactListValidator = v.object(contactListArgs);
export type ContactListArgs = Infer<typeof contactListValidator>;

export const normalizeContactSearch = (search: string | undefined) => {
  if (search !== undefined && search.length > CONTACT_FIELDS.lastName.maxLength)
    throw new ConvexError('INVALID_CONTACT_SEARCH');
  return (search ?? '').toLowerCase();
};
