import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { useLingui } from '@lingui/react/macro';
import { useDeferredValue, useState } from 'react';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import type { Id } from '../../../../../deployments/convex/convex/_generated/dataModel';
import { ACCOUNT_FIELDS } from '../../../../../deployments/convex/convex/accountFields';

export type SelectedCompany = {
  accountId: Id<'workspaceCompanies'>;
  accountName: string | undefined;
};

type CompanyPickerProps = {
  workspaceId: Id<'workspaces'>;
  label: string;
  emptyLabel: string;
  value: SelectedCompany | undefined;
  required?: boolean;
  disabled?: boolean;
  onChange: (company: SelectedCompany | undefined) => void;
};

const PAGE_SIZE = 25;

export const CompanyPicker = ({
  workspaceId,
  label,
  emptyLabel,
  value,
  required = false,
  disabled = false,
  onChange,
}: CompanyPickerProps) => {
  const { t } = useLingui();
  const [draft, setDraft] = useState('');
  const search = useDeferredValue(draft.trim());
  const companies = useConvexPaginatedQuery(
    api.workspaceCompanies.list,
    {
      workspaceId,
      ...(search === '' ? {} : { search }),
      sortDirection: 'asc',
    },
    { initialNumItems: PAGE_SIZE },
  );
  const isSelectedLoaded = companies.results.some(
    (company) => company._id === value?.accountId,
  );
  const isEmptySearch =
    companies.status === 'Exhausted' && companies.results.length === 0;

  return (
    <fieldset className="fenforce-company-picker" disabled={disabled}>
      <legend>{label}</legend>
      <label>
        <span className="fenforce-sr-only">{t`Search companies`}</span>
        <input
          type="search"
          value={draft}
          maxLength={ACCOUNT_FIELDS.name.maxLength}
          placeholder={t`Search companies`}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <label>
        <span className="fenforce-sr-only">{label}</span>
        <select
          value={value?.accountId ?? ''}
          required={required}
          onChange={(event) => {
            const company = companies.results.find(
              (result) => result._id === event.target.value,
            );
            onChange(
              company === undefined
                ? undefined
                : { accountId: company._id, accountName: company.name },
            );
          }}
        >
          <option value="">{emptyLabel}</option>
          {value !== undefined && !isSelectedLoaded && (
            <option value={value.accountId}>
              {value.accountName ?? t`Selected company`}
            </option>
          )}
          {companies.results.map((company) => (
            <option key={company._id} value={company._id}>
              {company.name}
            </option>
          ))}
        </select>
      </label>
      {companies.status === 'LoadingFirstPage' && (
        <p className="fenforce-muted" role="status">{t`Loading companies…`}</p>
      )}
      {isEmptySearch && (
        <p className="fenforce-muted" role="status">{t`No companies match`}</p>
      )}
      {(companies.status === 'CanLoadMore' ||
        companies.status === 'LoadingMore') && (
        <button
          type="button"
          className="fenforce-text-button fenforce-left-link"
          disabled={companies.status === 'LoadingMore'}
          onClick={() => companies.loadMore(PAGE_SIZE)}
        >
          {t`Load more companies`}
        </button>
      )}
    </fieldset>
  );
};
