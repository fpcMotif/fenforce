import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v, type Infer } from 'convex/values';

import { ACCOUNT_FIELDS } from './accountFields';
import { industryValidator } from './accountContract';

export const accountFiltersValidator = v.object({
  industry: v.optional(industryValidator),
  ownerId: v.optional(v.id('workspaceMembers')),
});

export const accountSortDirectionValidator = v.union(
  v.literal('asc'),
  v.literal('desc'),
);

export const accountListArgs = {
  workspaceId: v.id('workspaces'),
  paginationOpts: paginationOptsValidator,
  search: v.optional(v.string()),
  filters: v.optional(accountFiltersValidator),
  sortDirection: v.optional(accountSortDirectionValidator),
};

const accountListValidator = v.object(accountListArgs);
export type AccountListArgs = Infer<typeof accountListValidator>;

export const normalizeAccountSearch = (search: string | undefined) => {
  if (search !== undefined && search.length > ACCOUNT_FIELDS.name.maxLength)
    throw new ConvexError('INVALID_ACCOUNT_SEARCH');
  return (search ?? '').toLowerCase();
};

export const validateAccountPageSize = (numItems: number) => {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > 100)
    throw new ConvexError('INVALID_PAGE_SIZE');
};
