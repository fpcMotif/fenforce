import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { useLingui } from '@lingui/react/macro';
import { ConvexError } from 'convex/values';
import { useRef, useState } from 'react';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import type { Id } from '../../../../../deployments/convex/convex/_generated/dataModel';
import { ContactHistory } from './ContactHistory';
import { useAccountOperation } from './useAccountOperation';

type ContactLifecycleProps = {
  workspaceId: Id<'workspaces'>;
  contactId: Id<'workspaceContacts'>;
  revision: number;
  onComplete: () => void;
};
type ContactTrashActionProps = ContactLifecycleProps;

const PAGE_SIZE = 25;

const isContactChanged = (failure: unknown) =>
  failure instanceof ConvexError && failure.data === 'CONTACT_CHANGED';

export const ContactTrashAction = ({
  workspaceId,
  contactId,
  revision,
  onComplete,
}: ContactTrashActionProps) => {
  const { t } = useLingui();
  const trash = useAccountOperation(api.contactLifecycle.trash);
  const [confirmationRevision, setConfirmationRevision] = useState<
    number | null
  >(null);
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const submit = async () => {
    if (confirmationRevision === null) return;
    setError('');
    try {
      await trash.submit({
        workspaceId,
        contactId,
        expectedRevision: confirmationRevision,
      });
      onComplete();
    } catch (failure) {
      setError(
        isContactChanged(failure)
          ? t`This person changed. Cancel and try again with the latest version.`
          : t`Unable to move this person to trash. Try again.`,
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
          <p>{t`Move this person to trash? You can restore them later.`}</p>
          {trash.isReconnecting && (
            <p role="status">{t`Reconnecting… Your change will be confirmed when the connection returns.`}</p>
          )}
          {error && <p role="alert">{error}</p>}
          <button
            autoFocus
            type="button"
            disabled={trash.isPending}
            onClick={() => {
              setConfirmationRevision(null);
              setError('');
              requestAnimationFrame(() => trigger.current?.focus());
            }}
          >{t`Cancel`}</button>
          <button
            type="button"
            disabled={trash.isPending}
            onClick={() => void submit()}
          >
            {trash.isPending ? t`Moving…` : t`Confirm move to trash`}
          </button>
        </section>
      )}
    </div>
  );
};

const TrashedContact = ({
  workspaceId,
  contactId,
  revision,
  onComplete,
  lastName,
  accountName,
}: ContactLifecycleProps & { lastName: string; accountName: string }) => {
  const { t } = useLingui();
  const restore = useAccountOperation(api.contactLifecycle.restore);
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    try {
      await restore.submit({
        workspaceId,
        contactId,
        expectedRevision: revision,
      });
      onComplete();
    } catch (failure) {
      setError(
        isContactChanged(failure)
          ? t`This person changed. Review the latest details and try again.`
          : t`Unable to restore this person. Try again.`,
      );
    }
  };
  return (
    <section className="fenforce-editor" aria-label={lastName}>
      <h2>{lastName}</h2>
      <p>
        {t`Company`}: {accountName}
      </p>
      <button
        type="button"
        disabled={restore.isPending}
        onClick={() => void submit()}
      >{t`Restore`}</button>
      <ContactHistory workspaceId={workspaceId} contactId={contactId} />
      {restore.isReconnecting && (
        <p role="status">{t`Reconnecting… Your change will be confirmed when the connection returns.`}</p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
};

export const ContactTrash = ({
  workspaceId,
}: {
  workspaceId: Id<'workspaces'>;
}) => {
  const { t } = useLingui();
  const contacts = useConvexPaginatedQuery(
    api.contactLifecycle.listTrash,
    { workspaceId },
    { initialNumItems: PAGE_SIZE },
  );
  const [restored, setRestored] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const canLoadMore =
    contacts.status === 'CanLoadMore' || contacts.status === 'LoadingMore';
  return (
    <div className="fenforce-page">
      <h1 ref={heading} tabIndex={-1}>{t`People trash`}</h1>
      {restored && (
        <p role="status">{t`Person restored. They are available in People.`}</p>
      )}
      {contacts.status === 'LoadingFirstPage' && (
        <p role="status">{t`Loading trash…`}</p>
      )}
      {contacts.status === 'Exhausted' && contacts.results.length === 0 && (
        <p>{t`Trash is empty`}</p>
      )}
      {contacts.status === 'CanLoadMore' && contacts.results.length === 0 && (
        <p>{t`No trashed people loaded yet. Load more to keep looking.`}</p>
      )}
      {contacts.results.map((contact) => (
        <TrashedContact
          key={contact._id}
          workspaceId={workspaceId}
          contactId={contact._id}
          revision={contact.revision}
          lastName={contact.lastName}
          accountName={contact.accountName}
          onComplete={() => {
            setRestored(true);
            heading.current?.focus();
          }}
        />
      ))}
      {canLoadMore && (
        <button
          type="button"
          disabled={contacts.status === 'LoadingMore'}
          onClick={() => contacts.loadMore(PAGE_SIZE)}
        >{t`Load more`}</button>
      )}
    </div>
  );
};
