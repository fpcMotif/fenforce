import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { useLingui } from '@lingui/react/macro';
import { ConvexError } from 'convex/values';
import { useRef, useState } from 'react';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import type { Id } from '../../../../../deployments/convex/convex/_generated/dataModel';
import { CompanyHistory } from './CompanyHistory';
import { useAccountOperation } from './useAccountOperation';

type CompanyLifecycleProps = {
  workspaceId: Id<'workspaces'>;
  companyId: Id<'workspaceCompanies'>;
  revision: number;
  onComplete: () => void;
};
type CompanyTrashActionProps = CompanyLifecycleProps & {
  onChanged: () => void;
};

export const CompanyTrashAction = ({
  workspaceId,
  companyId,
  revision,
  onComplete,
  onChanged,
}: CompanyTrashActionProps) => {
  const { t } = useLingui();
  const trash = useAccountOperation(api.accountLifecycle.trash);
  const [confirmationRevision, setConfirmationRevision] = useState<
    number | null
  >(null);
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const pending = trash.isPending;
  const submit = async () => {
    if (confirmationRevision === null) return;
    setError('');
    try {
      await trash.submit({
        workspaceId,
        companyId,
        expectedRevision: confirmationRevision,
      });
      onComplete();
    } catch (failure) {
      const changed =
        failure instanceof ConvexError && failure.data === 'COMPANY_CHANGED';
      // The change that won may already have removed this action from the page.
      if (changed) onChanged();
      setError(
        changed
          ? t`This company changed. Cancel and try again with the latest version.`
          : t`Unable to move this company to trash. Try again.`,
      );
    }
  };
  return (
    <div>
      <button
        ref={trigger}
        type="button"
        className="fenforce-secondary-button"
        disabled={confirmationRevision !== null}
        onClick={() => setConfirmationRevision(revision)}
      >{t`Move to trash`}</button>
      {confirmationRevision !== null && (
        <section
          className="fenforce-editor"
          aria-label={t`Confirm move to trash`}
        >
          <p>{t`Move this company to trash? You can restore it later.`}</p>
          {trash.isReconnecting && (
            <p role="status">{t`Reconnecting… Your change will be confirmed when the connection returns.`}</p>
          )}
          {error && <p role="alert">{error}</p>}
          <button
            autoFocus
            type="button"
            disabled={pending}
            onClick={() => {
              setConfirmationRevision(null);
              setError('');
              requestAnimationFrame(() => trigger.current?.focus());
            }}
          >{t`Cancel`}</button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void submit()}
          >
            {pending ? t`Moving…` : t`Confirm move to trash`}
          </button>
        </section>
      )}
    </div>
  );
};

const TrashedCompany = ({
  workspaceId,
  companyId,
  revision,
  onComplete,
  onRestoreChanged,
  name,
  ownerName,
  canReassign,
}: CompanyLifecycleProps & {
  onRestoreChanged: () => void;
  name: string;
  ownerName: string | null;
  canReassign: boolean;
}) => {
  const { t } = useLingui();
  const restore = useAccountOperation(api.accountLifecycle.restore);
  const reassign = useAccountOperation(api.accountLifecycle.reassignTrashed);
  const members = useConvexPaginatedQuery(
    api.workspaceCompanies.listEligibleOwners,
    canReassign ? { workspaceId } : 'skip',
    { initialNumItems: 50 },
  );
  const [ownerId, setOwnerId] = useState('');
  const [error, setError] = useState('');
  const pending = restore.isPending || reassign.isPending;
  const submit = async (action: 'restore' | 'reassign') => {
    setError('');
    try {
      if (action === 'restore') {
        await restore.submit({
          workspaceId,
          companyId,
          expectedRevision: revision,
        });
        onComplete();
      } else {
        await reassign.submit({
          workspaceId,
          companyId,
          expectedRevision: revision,
          accountOwnerId: ownerId as Id<'workspaceMembers'>,
        });
        setOwnerId('');
      }
    } catch (failure) {
      if (
        action === 'restore' &&
        failure instanceof ConvexError &&
        failure.data === 'COMPANY_CHANGED'
      ) {
        // The trash page reports it, since the winning change may already
        // have removed this company from the list.
        onRestoreChanged();
        return;
      }
      setError(
        failure instanceof ConvexError &&
          failure.data === 'INVALID_ACCOUNT_OWNER'
          ? t`The owner is unavailable. A manager must assign an active owner before restoring this company.`
          : failure instanceof ConvexError && failure.data === 'COMPANY_CHANGED'
            ? t`This company changed. Review the latest details and try again.`
            : t`Unable to update this company. Try again.`,
      );
    }
  };
  return (
    <section className="fenforce-editor" aria-label={name}>
      <h2>{name}</h2>
      <p>{t`Account Owner: ${ownerName ?? '—'}`}</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => void submit('restore')}
      >{t`Restore`}</button>
      {canReassign && (
        <div className="fenforce-form">
          <label>
            <span>{t`New owner`}</span>
            <select
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
              disabled={pending}
            >
              <option value="">{t`Choose an active owner`}</option>
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
            >{t`Load more members`}</button>
          )}
          <button
            type="button"
            disabled={pending || ownerId === ''}
            onClick={() => void submit('reassign')}
          >{t`Assign owner`}</button>
        </div>
      )}
      <CompanyHistory workspaceId={workspaceId} companyId={companyId} />
      {(restore.isReconnecting || reassign.isReconnecting) && (
        <p role="status">{t`Reconnecting… Your change will be confirmed when the connection returns.`}</p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
};

export const CompanyTrash = ({
  workspaceId,
}: {
  workspaceId: Id<'workspaces'>;
}) => {
  const { t } = useLingui();
  const companies = useConvexPaginatedQuery(
    api.accountLifecycle.listTrash,
    { workspaceId },
    { initialNumItems: 25 },
  );
  const [restored, setRestored] = useState(false);
  const [changedRestoreName, setChangedRestoreName] = useState<string | null>(
    null,
  );
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <div className="fenforce-page">
      <h1 ref={heading} tabIndex={-1}>{t`Trash`}</h1>
      {restored && (
        <p role="status">{t`Company restored. It is available in Companies.`}</p>
      )}
      {changedRestoreName !== null && (
        <p role="alert">{t`${changedRestoreName} changed before your restore was saved. Your request was not applied.`}</p>
      )}
      {companies.status === 'LoadingFirstPage' && (
        <p role="status">{t`Loading trash…`}</p>
      )}
      {companies.status === 'Exhausted' && companies.results.length === 0 && (
        <p>{t`Trash is empty`}</p>
      )}
      {companies.results.map((company) => (
        <TrashedCompany
          key={company._id}
          workspaceId={workspaceId}
          companyId={company._id}
          revision={company.revision}
          name={company.name}
          ownerName={company.accountOwnerName}
          canReassign={company.permissions.canReassign}
          onComplete={() => {
            setRestored(true);
            setChangedRestoreName(null);
            heading.current?.focus();
          }}
          onRestoreChanged={() => {
            setRestored(false);
            setChangedRestoreName(company.name);
          }}
        />
      ))}
      {(companies.status === 'CanLoadMore' ||
        companies.status === 'LoadingMore') && (
        <button
          type="button"
          disabled={companies.status === 'LoadingMore'}
          onClick={() => companies.loadMore(25)}
        >{t`Load more`}</button>
      )}
    </div>
  );
};
