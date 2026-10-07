import { useLingui } from '@lingui/react/macro';
import { useState, type FormEvent } from 'react';
import { IconSearch } from 'twenty-ui/icon';

type ListSearchFormProps = {
  search: string;
  label: string;
  maxLength: number;
  onSearch: (search: string) => void;
};

export const ListSearchForm = ({
  search,
  label,
  maxLength,
  onSearch,
}: ListSearchFormProps) => {
  const { t } = useLingui();
  const [draft, setDraft] = useState(search);
  const [appliedSearch, setAppliedSearch] = useState(search);
  if (appliedSearch !== search) {
    setAppliedSearch(search);
    setDraft(search);
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(draft.trim());
  };
  return (
    <form role="search" className="fenforce-list-search" onSubmit={submit}>
      <label className="fenforce-list-search-field">
        <span className="fenforce-sr-only">{label}</span>
        <IconSearch size={15} aria-hidden="true" />
        <input
          type="search"
          value={draft}
          maxLength={maxLength}
          placeholder={t`Search by name`}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <button type="submit" className="fenforce-secondary-button">
        {t`Search`}
      </button>
      {search !== '' && (
        <button
          type="button"
          className="fenforce-text-button"
          onClick={() => onSearch('')}
        >
          {t`Clear search`}
        </button>
      )}
    </form>
  );
};
