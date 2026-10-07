import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { useLingui } from '@lingui/react/macro';
import { useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useRef, useState, type FormEvent } from 'react';
import { IconTable, IconTrash } from 'twenty-ui/icon';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import type {
  Doc,
  Id,
} from '../../../../../deployments/convex/convex/_generated/dataModel';
import { ACCOUNT_VIEW_NAME_MAX_LENGTH } from '../../../../../deployments/convex/convex/accountViewContract';
import {
  fromAccountViewConfiguration,
  toAccountViewConfiguration,
  type CompanyListQuery,
} from './companyListQuery';

type CompanySavedViewsProps = {
  workspaceId: Id<'workspaces'>;
  query: CompanyListQuery;
  activeViewId: Id<'accountViews'> | undefined;
  isDefaultQuery: boolean;
  canShareViews: boolean;
  canFilterOwner: boolean;
  onSelect: (
    query: CompanyListQuery | undefined,
    viewId: Id<'accountViews'> | undefined,
  ) => void;
  onDeleted: (viewId: Id<'accountViews'>) => void;
};

const SaveViewForm = ({
  workspaceId,
  query,
  canShareViews,
  onSaved,
  onCancel,
}: {
  workspaceId: Id<'workspaces'>;
  query: CompanyListQuery;
  canShareViews: boolean;
  onSaved: (viewId: Id<'accountViews'>) => void;
  onCancel: () => void;
}) => {
  const { t } = useLingui();
  const save = useMutation(api.accountViews.save);
  const [name, setName] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const viewId = await save({
        workspaceId,
        name: name.trim(),
        scope: canShareViews && isShared ? 'workspace' : 'private',
        configuration: toAccountViewConfiguration(query),
      });
      onSaved(viewId);
    } catch (failure) {
      setError(
        failure instanceof ConvexError && failure.data === 'INVALID_VIEW_NAME'
          ? t`Enter a view name of up to ${ACCOUNT_VIEW_NAME_MAX_LENGTH} characters.`
          : t`Unable to save this view. Try again.`,
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <form
      className="fenforce-form fenforce-save-view"
      aria-label={t`Save view`}
      onSubmit={(event) => void submit(event)}
    >
      <label>
        <span>{t`View name`}</span>
        <input
          value={name}
          maxLength={ACCOUNT_VIEW_NAME_MAX_LENGTH}
          required
          autoFocus
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {canShareViews && (
        <label className="fenforce-checkbox">
          <input
            type="checkbox"
            checked={isShared}
            onChange={(event) => setIsShared(event.target.checked)}
          />
          <span>{t`Share with workspace`}</span>
        </label>
      )}
      {error && (
        <p className="fenforce-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="fenforce-form-actions">
        <button
          type="button"
          className="fenforce-secondary-button"
          disabled={pending}
          onClick={onCancel}
        >
          {t`Cancel`}
        </button>
        <button
          type="submit"
          className="fenforce-secondary-button"
          disabled={pending}
        >
          {pending ? t`Saving…` : t`Save view`}
        </button>
      </div>
    </form>
  );
};

const DeleteViewConfirmation = ({
  workspaceId,
  view,
  onDeleted,
  onCancel,
}: {
  workspaceId: Id<'workspaces'>;
  view: Doc<'accountViews'>;
  onDeleted: () => void;
  onCancel: () => void;
}) => {
  const { t } = useLingui();
  const remove = useMutation(api.accountViews.remove);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const viewName = view.name;
  const submit = async () => {
    setPending(true);
    setError('');
    try {
      await remove({
        workspaceId,
        viewId: view._id,
        expectedRevision: view.revision,
      });
      onDeleted();
    } catch (failure) {
      setError(
        failure instanceof ConvexError && failure.data === 'REVISION_CONFLICT'
          ? t`This view changed. Cancel and try again.`
          : t`Unable to delete this view. Try again.`,
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <section
      className="fenforce-view-confirmation"
      aria-label={t`Confirm delete view`}
    >
      <p>{t`Delete the view “${viewName}”?`}</p>
      {error && (
        <p className="fenforce-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="fenforce-form-actions">
        <button
          autoFocus
          type="button"
          className="fenforce-secondary-button"
          disabled={pending}
          onClick={onCancel}
        >
          {t`Cancel`}
        </button>
        <button
          type="button"
          className="fenforce-secondary-button"
          disabled={pending}
          onClick={() => void submit()}
        >
          {pending ? t`Deleting…` : t`Delete view`}
        </button>
      </div>
    </section>
  );
};

export const CompanySavedViews = ({
  workspaceId,
  query,
  activeViewId,
  isDefaultQuery,
  canShareViews,
  canFilterOwner,
  onSelect,
  onDeleted,
}: CompanySavedViewsProps) => {
  const { t } = useLingui();
  const views = useConvexPaginatedQuery(
    api.accountViews.list,
    { workspaceId },
    { initialNumItems: 25 },
  );
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeletion, setPendingDeletion] =
    useState<Doc<'accountViews'> | null>(null);
  const saveTrigger = useRef<HTMLButtonElement>(null);
  const returnFocusToSaveTrigger = () =>
    requestAnimationFrame(() => saveTrigger.current?.focus());

  return (
    <div className="fenforce-saved-views">
      <nav aria-label={t`Saved views`}>
        <ul className="fenforce-view-list">
          <li>
            <button
              type="button"
              className="fenforce-view-button"
              aria-current={
                activeViewId === undefined && isDefaultQuery
                  ? 'true'
                  : undefined
              }
              onClick={() => onSelect(undefined, undefined)}
            >
              {t`All companies`}
            </button>
          </li>
          {views.results.map((view) => (
            <li key={view._id}>
              <button
                type="button"
                className="fenforce-view-button"
                aria-current={view._id === activeViewId ? 'true' : undefined}
                onClick={() =>
                  onSelect(
                    fromAccountViewConfiguration(
                      view.configuration,
                      canFilterOwner,
                    ),
                    view._id,
                  )
                }
              >
                <IconTable size={14} aria-hidden="true" />
                {view.name}
                {view.scope === 'workspace' && (
                  <span className="fenforce-muted">{t`Shared`}</span>
                )}
              </button>
              {(view.scope === 'private' || canShareViews) && (
                <button
                  type="button"
                  className="fenforce-text-button fenforce-view-delete"
                  aria-label={t`Delete view ${view.name}`}
                  disabled={pendingDeletion !== null}
                  onClick={() => setPendingDeletion(view)}
                >
                  <IconTrash size={14} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <div className="fenforce-view-actions">
        {(views.status === 'CanLoadMore' || views.status === 'LoadingMore') && (
          <button
            type="button"
            className="fenforce-text-button"
            disabled={views.status === 'LoadingMore'}
            onClick={() => views.loadMore(25)}
          >
            {t`Load more views`}
          </button>
        )}
        <button
          ref={saveTrigger}
          type="button"
          className="fenforce-secondary-button"
          disabled={isSaving}
          onClick={() => setIsSaving(true)}
        >
          {t`Save current view`}
        </button>
      </div>
      {isSaving && (
        <SaveViewForm
          workspaceId={workspaceId}
          query={query}
          canShareViews={canShareViews}
          onSaved={(viewId) => {
            setIsSaving(false);
            onSelect(query, viewId);
            returnFocusToSaveTrigger();
          }}
          onCancel={() => {
            setIsSaving(false);
            returnFocusToSaveTrigger();
          }}
        />
      )}
      {pendingDeletion !== null && (
        <DeleteViewConfirmation
          key={pendingDeletion._id}
          workspaceId={workspaceId}
          view={pendingDeletion}
          onDeleted={() => {
            setPendingDeletion(null);
            onDeleted(pendingDeletion._id);
            returnFocusToSaveTrigger();
          }}
          onCancel={() => {
            setPendingDeletion(null);
            returnFocusToSaveTrigger();
          }}
        />
      )}
    </div>
  );
};
