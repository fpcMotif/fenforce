import type { Infer } from 'convex/values';
import { isDefined } from 'twenty-shared/utils';

import type { Id } from '../../../../../deployments/convex/convex/_generated/dataModel';
import { ACCOUNT_FIELDS } from '../../../../../deployments/convex/convex/accountFields';
import type { accountViewConfigurationValidator } from '../../../../../deployments/convex/convex/accountViewContract';

export type AccountIndustry = (typeof ACCOUNT_FIELDS.industry.options)[number];

type AccountViewConfiguration = Infer<typeof accountViewConfigurationValidator>;

type CompanyListSortDirection = 'asc' | 'desc';

export type CompanyListQuery = {
  search: string;
  industry: AccountIndustry | null | undefined;
  ownerId: Id<'workspaceMembers'> | undefined;
  sortDirection: CompanyListSortDirection;
};

export type CompanyListSearch = {
  q?: string;
  industry?: AccountIndustry | 'none';
  owner?: string;
  sort?: CompanyListSortDirection;
  view?: string;
};

export const NO_INDUSTRY_SEARCH_VALUE = 'none';

const VIEW_COLUMNS: AccountViewConfiguration['columns'] = [
  'account.name',
  'account.industry',
  'account.owner',
];

const findIndustry = (value: unknown) =>
  ACCOUNT_FIELDS.industry.options.find((option) => option === value);

const readNonEmptyString = (value: unknown) =>
  typeof value === 'string' && value !== '' ? value : undefined;

export const parseCompanyListSearch = (
  search: Record<string, unknown>,
): CompanyListSearch => ({
  q: readNonEmptyString(search.q),
  industry:
    search.industry === NO_INDUSTRY_SEARCH_VALUE
      ? NO_INDUSTRY_SEARCH_VALUE
      : findIndustry(search.industry),
  owner: readNonEmptyString(search.owner),
  sort: search.sort === 'desc' ? 'desc' : undefined,
  view: readNonEmptyString(search.view),
});

export const readCompanyListQuery = (
  search: CompanyListSearch,
  canFilterOwner: boolean,
): CompanyListQuery => ({
  search: (search.q ?? '').slice(0, ACCOUNT_FIELDS.name.maxLength),
  industry:
    search.industry === NO_INDUSTRY_SEARCH_VALUE ? null : search.industry,
  ownerId:
    canFilterOwner && isDefined(search.owner)
      ? (search.owner as Id<'workspaceMembers'>)
      : undefined,
  sortDirection: search.sort ?? 'asc',
});

export const toCompanyListSearch = (
  query: CompanyListQuery,
  viewId?: Id<'accountViews'>,
): CompanyListSearch => ({
  q: query.search === '' ? undefined : query.search,
  industry: query.industry === null ? NO_INDUSTRY_SEARCH_VALUE : query.industry,
  owner: query.ownerId,
  sort: query.sortDirection === 'desc' ? 'desc' : undefined,
  view: viewId,
});

const toAccountFilters = (query: CompanyListQuery) => ({
  ...(query.industry === undefined ? {} : { industry: query.industry }),
  ...(query.ownerId === undefined ? {} : { ownerId: query.ownerId }),
});

export const toCompanyListArgs = (query: CompanyListQuery) => {
  const filters = toAccountFilters(query);
  return {
    ...(query.search === '' ? {} : { search: query.search }),
    ...(Object.keys(filters).length === 0 ? {} : { filters }),
    sortDirection: query.sortDirection,
  };
};

export const isFilteredCompanyListQuery = (query: CompanyListQuery) =>
  query.search !== '' ||
  query.industry !== undefined ||
  query.ownerId !== undefined;

export const toAccountViewConfiguration = (
  query: CompanyListQuery,
): AccountViewConfiguration => ({
  columns: VIEW_COLUMNS,
  search: query.search,
  filters: toAccountFilters(query),
  sort: { field: 'account.name', direction: query.sortDirection },
});

export const fromAccountViewConfiguration = (
  configuration: AccountViewConfiguration,
  canFilterOwner: boolean,
): CompanyListQuery => ({
  search: configuration.search,
  industry: configuration.filters.industry,
  ownerId: canFilterOwner ? configuration.filters.ownerId : undefined,
  sortDirection: configuration.sort.direction,
});
