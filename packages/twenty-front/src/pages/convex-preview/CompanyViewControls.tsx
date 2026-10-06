import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { useLingui } from '@lingui/react/macro';
import { useMutation } from 'convex/react';
import { useState, type FormEvent } from 'react';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import type { Id } from '../../../../../deployments/convex/convex/_generated/dataModel';
import {
  COMPANY_VIEW_COLUMNS,
  type CompanyViewConfiguration,
} from './companyViewConfiguration';

type CompanyViewControlsProps = {
  workspaceId: Id<'workspaces'>;
  manager: boolean;
  configuration: CompanyViewConfiguration;
  selectedViewId?: string;
  onChange: (configuration: CompanyViewConfiguration, viewId?: string) => void;
};

type SavedCompanyViewsProps = CompanyViewControlsProps;

const SavedCompanyViews = ({
  workspaceId,
  manager,
  configuration,
  selectedViewId,
  onChange,
}: SavedCompanyViewsProps) => {
  const { t } = useLingui();
  const views = useConvexPaginatedQuery(
    api.accountViews.list,
    { workspaceId },
    { initialNumItems: 25 },
  );
  const save = useMutation(api.accountViews.save);
  const remove = useMutation(api.accountViews.remove);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'private' | 'workspace'>('private');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const selected = views.results.find((view) => view._id === selectedViewId);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const viewId = await save({
        workspaceId,
        name: name.trim(),
        scope,
        configuration,
      });
      onChange(configuration, viewId);
      setName('');
    } catch {
      setError(t`Unable to save this view. Check its name and try again.`);
    } finally {
      setPending(false);
    }
  };
  const deleteView = async () => {
    if (selected === undefined) return;
    setPending(true);
    setError('');
    try {
      await remove({
        workspaceId,
        viewId: selected._id,
        expectedRevision: selected.revision,
      });
      onChange(configuration);
    } catch {
      setError(
        t`Unable to remove this view. It may have changed or your access may have ended.`,
      );
    } finally {
      setPending(false);
    }
  };
  const updateView = async () => {
    if (selected === undefined) return;
    setPending(true);
    setError('');
    try {
      await save({
        workspaceId,
        viewId: selected._id,
        expectedRevision: selected.revision,
        name: selected.name,
        scope: selected.scope,
        configuration,
      });
    } catch {
      setError(
        t`Unable to update this view. Reload its latest version and try again.`,
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="fenforce-editor" aria-label={t`Saved views`}>
      <label>
        {t`Saved view`}
        <select
          value={selectedViewId ?? ''}
          onChange={(event) => {
            const view = views.results.find(
              (entry) => entry._id === event.target.value,
            );
            if (view !== undefined) onChange(view.configuration, view._id);
            else onChange(configuration);
          }}
        >
          <option value="">{t`Custom view`}</option>
          {selectedViewId && selected === undefined && (
            <option value={selectedViewId}>{t`Current saved view`}</option>
          )}
          {views.results.map((view) => (
            <option key={view._id} value={view._id}>
              {view.name} ({view.scope === 'workspace' ? t`Shared` : t`Private`}
              )
            </option>
          ))}
        </select>
      </label>
      {(views.status === 'CanLoadMore' || views.status === 'LoadingMore') && (
        <button
          type="button"
          disabled={views.status === 'LoadingMore'}
          onClick={() => views.loadMore(25)}
        >{t`Load more views`}</button>
      )}
      {selected !== undefined && (selected.scope === 'private' || manager) && (
        <div>
          <button
            type="button"
            disabled={pending}
            onClick={() => void updateView()}
          >{t`Update selected view`}</button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void deleteView()}
          >{t`Remove selected view`}</button>
        </div>
      )}
      <form className="fenforce-form" onSubmit={submit}>
        <label>
          <span>{t`View name`}</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={100}
          />
        </label>
        <label>
          <span>{t`Sharing`}</span>
          <select
            value={scope}
            onChange={(event) =>
              setScope(
                event.target.value === 'workspace' ? 'workspace' : 'private',
              )
            }
          >
            <option value="private">{t`Only me`}</option>
            {manager && <option value="workspace">{t`Workspace`}</option>}
          </select>
        </label>
        <button type="submit" disabled={pending}>{t`Save as new view`}</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
};

export const CompanyViewControls = ({
  workspaceId,
  manager,
  configuration,
  selectedViewId,
  onChange: onViewChange,
}: CompanyViewControlsProps) => {
  const { t } = useLingui();
  const members = useConvexPaginatedQuery(
    api.workspaceCompanies.listEligibleOwners,
    { workspaceId },
    { initialNumItems: 50 },
  );
  const [showViews, setShowViews] = useState(false);
  const onChange = (
    nextConfiguration: CompanyViewConfiguration,
    viewId = selectedViewId,
  ) => onViewChange(nextConfiguration, viewId);
  return (
    <section aria-label={t`Company filters`}>
      <form
        className="fenforce-form"
        onSubmit={(event) => {
          event.preventDefault();
          const search = new FormData(event.currentTarget).get('search');
          onChange(
            {
              ...configuration,
              search: typeof search === 'string' ? search : '',
            },
            selectedViewId,
          );
        }}
      >
        <label>
          <span>{t`Search companies`}</span>
          <input
            key={configuration.search}
            name="search"
            type="search"
            defaultValue={configuration.search}
          />
        </label>
        <button type="submit">{t`Search`}</button>
      </form>
      <div className="fenforce-form">
        <label>
          <span>{t`Filter industry`}</span>
          <select
            value={
              configuration.filters.industry === null
                ? 'none'
                : (configuration.filters.industry ?? '')
            }
            onChange={(event) => {
              const value = event.target.value;
              const { industry: _industry, ...filters } = configuration.filters;
              onChange({
                ...configuration,
                filters:
                  value === ''
                    ? filters
                    : {
                        ...filters,
                        industry:
                          value === 'services'
                            ? 'services'
                            : value === 'manufacturing'
                              ? 'manufacturing'
                              : null,
                      },
              });
            }}
          >
            <option value="">{t`All industries`}</option>
            <option value="none">{t`No industry`}</option>
            <option value="services">{t`Services`}</option>
            <option value="manufacturing">{t`Manufacturing`}</option>
          </select>
        </label>
        <label>
          <span>{t`Filter owner`}</span>
          <select
            value={configuration.filters.ownerId ?? ''}
            onChange={(event) => {
              const { ownerId: _ownerId, ...filters } = configuration.filters;
              onChange({
                ...configuration,
                filters:
                  event.target.value === ''
                    ? filters
                    : {
                        ...filters,
                        ownerId: event.target.value as Id<'workspaceMembers'>,
                      },
              });
            }}
          >
            <option value="">{t`All permitted owners`}</option>
            {configuration.filters.ownerId &&
              !members.results.some(
                (member) => member.memberId === configuration.filters.ownerId,
              ) && (
                <option
                  value={configuration.filters.ownerId}
                >{t`Selected owner`}</option>
              )}
            {members.results.map((member) => (
              <option key={member.memberId} value={member.memberId}>
                {member.displayName}
              </option>
            ))}
          </select>
        </label>
        {members.status === 'CanLoadMore' && (
          <button
            type="button"
            onClick={() => members.loadMore(50)}
          >{t`Load more owners`}</button>
        )}
        <label>
          <span>{t`Sort by name`}</span>
          <select
            value={configuration.sort.direction}
            onChange={(event) =>
              onChange({
                ...configuration,
                sort: {
                  field: 'account.name',
                  direction: event.target.value === 'desc' ? 'desc' : 'asc',
                },
              })
            }
          >
            <option value="asc">{t`A to Z`}</option>
            <option value="desc">{t`Z to A`}</option>
          </select>
        </label>
        <fieldset>
          <legend>{t`Visible columns`}</legend>
          {COMPANY_VIEW_COLUMNS.map((column) => (
            <label key={column}>
              <input
                type="checkbox"
                checked={configuration.columns.includes(column)}
                disabled={
                  configuration.columns.length === 1 &&
                  configuration.columns.includes(column)
                }
                onChange={(event) =>
                  onChange({
                    ...configuration,
                    columns: event.target.checked
                      ? [...configuration.columns, column]
                      : configuration.columns.filter(
                          (entry) => entry !== column,
                        ),
                  })
                }
              />
              {column === 'account.name'
                ? t`Name`
                : column === 'account.owner'
                  ? t`Account Owner`
                  : t`Industry`}
            </label>
          ))}
        </fieldset>
      </div>
      <button
        type="button"
        aria-expanded={showViews}
        onClick={() => setShowViews(!showViews)}
      >{t`Saved views`}</button>
      {showViews && (
        <SavedCompanyViews
          workspaceId={workspaceId}
          manager={manager}
          configuration={configuration}
          selectedViewId={selectedViewId}
          onChange={onViewChange}
        />
      )}
    </section>
  );
};
