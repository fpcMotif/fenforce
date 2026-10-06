import { ConvexError, v, type Infer } from 'convex/values';

import {
  accountFiltersValidator,
  accountSortDirectionValidator,
  normalizeAccountSearch,
} from './accountQueryContract';

export const accountViewScopeValidator = v.union(
  v.literal('private'),
  v.literal('workspace'),
);
export const accountViewConfigurationValidator = v.object({
  columns: v.array(
    v.union(
      v.literal('account.name'),
      v.literal('account.owner'),
      v.literal('account.industry'),
    ),
  ),
  search: v.string(),
  filters: accountFiltersValidator,
  sort: v.object({
    field: v.literal('account.name'),
    direction: accountSortDirectionValidator,
  }),
});

export const validateAccountView = (
  name: string,
  configuration: Infer<typeof accountViewConfigurationValidator>,
) => {
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 100)
    throw new ConvexError('INVALID_VIEW_NAME');
  if (
    configuration.columns.length === 0 ||
    new Set(configuration.columns).size !== configuration.columns.length
  )
    throw new ConvexError('INVALID_VIEW_COLUMNS');
  normalizeAccountSearch(configuration.search);
  return normalizedName;
};
