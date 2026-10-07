import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { useLingui } from '@lingui/react/macro';
import { IconSortAscending, IconSortDescending } from 'twenty-ui/icon';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import type { Id } from '../../../../../deployments/convex/convex/_generated/dataModel';
import { ACCOUNT_FIELDS } from '../../../../../deployments/convex/convex/accountFields';
import { IndustryLabel } from './CompanyForm';
import { ListSearchForm } from './ListSearchForm';
import {
  NO_INDUSTRY_SEARCH_VALUE,
  type CompanyListQuery,
} from './companyListQuery';

type CompanyListControlsProps = {
  workspaceId: Id<'workspaces'>;
  query: CompanyListQuery;
  canFilterOwner: boolean;
  onChange: (query: CompanyListQuery) => void;
};

const ANY_VALUE = '';

export const CompanyListControls = ({
  workspaceId,
  query,
  canFilterOwner,
  onChange,
}: CompanyListControlsProps) => {
  const { t } = useLingui();
  const owners = useConvexPaginatedQuery(
    api.workspaceCompanies.listEligibleOwners,
    canFilterOwner ? { workspaceId } : 'skip',
    { initialNumItems: 50 },
  );
  const industryValue =
    query.industry === null
      ? NO_INDUSTRY_SEARCH_VALUE
      : (query.industry ?? ANY_VALUE);
  const isSelectedOwnerLoaded = owners.results.some(
    (owner) => owner.memberId === query.ownerId,
  );

  return (
    <div className="fenforce-list-controls">
      <ListSearchForm
        search={query.search}
        label={t`Search companies`}
        maxLength={ACCOUNT_FIELDS.name.maxLength}
        onSearch={(search) => onChange({ ...query, search })}
      />
      <label className="fenforce-list-filter">
        <span className="fenforce-sr-only">{t`Filter by industry`}</span>
        <select
          value={industryValue}
          onChange={(event) => {
            const value = event.target.value;
            onChange({
              ...query,
              industry:
                value === NO_INDUSTRY_SEARCH_VALUE
                  ? null
                  : ACCOUNT_FIELDS.industry.options.find(
                      (option) => option === value,
                    ),
            });
          }}
        >
          <option value={ANY_VALUE}>{t`All industries`}</option>
          {ACCOUNT_FIELDS.industry.options.map((option) => (
            <option key={option} value={option}>
              <IndustryLabel industry={option} />
            </option>
          ))}
          <option value={NO_INDUSTRY_SEARCH_VALUE}>{t`No industry`}</option>
        </select>
      </label>
      {canFilterOwner && (
        <label className="fenforce-list-filter">
          <span className="fenforce-sr-only">{t`Filter by account owner`}</span>
          <select
            value={query.ownerId ?? ANY_VALUE}
            onChange={(event) =>
              onChange({
                ...query,
                ownerId:
                  event.target.value === ANY_VALUE
                    ? undefined
                    : (event.target.value as Id<'workspaceMembers'>),
              })
            }
          >
            <option value={ANY_VALUE}>{t`All owners`}</option>
            {query.ownerId !== undefined && !isSelectedOwnerLoaded && (
              <option value={query.ownerId}>{t`Selected owner`}</option>
            )}
            {owners.results.map((owner) => (
              <option key={owner.memberId} value={owner.memberId}>
                {owner.displayName}
              </option>
            ))}
          </select>
        </label>
      )}
      {canFilterOwner && owners.status === 'CanLoadMore' && (
        <button
          type="button"
          className="fenforce-text-button"
          onClick={() => owners.loadMore(50)}
        >
          {t`Load more owners`}
        </button>
      )}
      <button
        type="button"
        className="fenforce-secondary-button fenforce-list-sort"
        onClick={() =>
          onChange({
            ...query,
            sortDirection: query.sortDirection === 'asc' ? 'desc' : 'asc',
          })
        }
      >
        {query.sortDirection === 'asc' ? (
          <IconSortAscending size={15} aria-hidden="true" />
        ) : (
          <IconSortDescending size={15} aria-hidden="true" />
        )}
        {query.sortDirection === 'asc' ? t`Sort: Name A–Z` : t`Sort: Name Z–A`}
      </button>
    </div>
  );
};
