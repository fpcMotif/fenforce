import type { Id } from '../../../../../deployments/convex/convex/_generated/dataModel';

export const COMPANY_VIEW_COLUMNS = [
  'account.name',
  'account.owner',
  'account.industry',
] as const;
export type CompanyViewColumn = (typeof COMPANY_VIEW_COLUMNS)[number];
export type CompanyViewConfiguration = {
  columns: CompanyViewColumn[];
  search: string;
  filters: {
    industry?: 'services' | 'manufacturing' | null;
    ownerId?: Id<'workspaceMembers'>;
  };
  sort: { field: 'account.name'; direction: 'asc' | 'desc' };
};

export type CompanyViewSearch = {
  workspace?: string;
  q?: string;
  industry?: string;
  owner?: string;
  sort?: string;
  columns?: string;
  view?: string;
};

export const companyViewFromSearch = (
  search: CompanyViewSearch,
): CompanyViewConfiguration => ({
  columns:
    search.columns === undefined || search.columns === ''
      ? [...COMPANY_VIEW_COLUMNS]
      : [
          ...new Set(
            search.columns.split(',').flatMap((value) => {
              const column = COMPANY_VIEW_COLUMNS.find(
                (entry) => entry === value,
              );
              return column === undefined ? [] : [column];
            }),
          ),
        ],
  search: search.q ?? '',
  filters: {
    ...(search.industry === 'services' || search.industry === 'manufacturing'
      ? { industry: search.industry }
      : search.industry === 'none'
        ? { industry: null }
        : {}),
    ...(search.owner
      ? { ownerId: search.owner as Id<'workspaceMembers'> }
      : {}),
  },
  sort: {
    field: 'account.name',
    direction: search.sort === 'desc' ? 'desc' : 'asc',
  },
});

export const companyViewToSearch = (
  configuration: CompanyViewConfiguration,
): CompanyViewSearch => ({
  q: configuration.search || undefined,
  industry:
    configuration.filters.industry === null
      ? 'none'
      : configuration.filters.industry,
  owner: configuration.filters.ownerId,
  sort: configuration.sort.direction,
  columns: configuration.columns.join(','),
});
