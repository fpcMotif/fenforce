import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { useLingui } from '@lingui/react/macro';
import type { FunctionReturnType } from 'convex/server';
import { useState } from 'react';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import type { Id } from '../../../../../deployments/convex/convex/_generated/dataModel';

type ContactHistoryProps = {
  workspaceId: Id<'workspaces'>;
  contactId: Id<'workspaceContacts'>;
};
type ContactHistoryRecordsProps = ContactHistoryProps;

type ContactHistoryValues = FunctionReturnType<
  typeof api.workspaceContacts.history
>['page'][number]['after'];

const HistoryValues = ({ values }: { values: ContactHistoryValues | null }) => {
  const { t } = useLingui();
  if (values === null) return <p>{t`Not created yet`}</p>;
  return (
    <dl>
      <dt>{t`Last name`}</dt>
      <dd>{values.lastName}</dd>
      <dt>{t`Email`}</dt>
      <dd>{values.email ?? '—'}</dd>
      <dt>{t`Company`}</dt>
      <dd>
        {values.account.restricted
          ? t`Company you cannot access`
          : values.account.accountName}
      </dd>
      <dt>{t`State`}</dt>
      <dd>{values.deletedAt === null ? t`Active` : t`Trashed`}</dd>
    </dl>
  );
};

const ContactHistoryRecords = ({
  workspaceId,
  contactId,
}: ContactHistoryRecordsProps) => {
  const { t } = useLingui();
  const history = useConvexPaginatedQuery(
    api.workspaceContacts.history,
    { workspaceId, contactId },
    { initialNumItems: 10 },
  );
  return (
    <section aria-label={t`Person history`}>
      {history.status === 'LoadingFirstPage' && (
        <p role="status">{t`Loading history…`}</p>
      )}
      {history.results.map((entry) => (
        <article key={entry._id} className="fenforce-editor">
          <h3>
            {t`Revision`} {entry.after.revision}
          </h3>
          <p>
            {new Date(entry.timestamp).toLocaleString()} · {t`Changed by`}:{' '}
            {entry.actorName}
          </p>
          <details>
            <summary>{t`Before`}</summary>
            <HistoryValues values={entry.before} />
          </details>
          <details>
            <summary>{t`After`}</summary>
            <HistoryValues values={entry.after} />
          </details>
        </article>
      ))}
      {history.status === 'Exhausted' && history.results.length === 0 && (
        <p>{t`No history yet`}</p>
      )}
      {(history.status === 'CanLoadMore' ||
        history.status === 'LoadingMore') && (
        <button
          type="button"
          disabled={history.status === 'LoadingMore'}
          onClick={() => history.loadMore(10)}
        >{t`Load more history`}</button>
      )}
    </section>
  );
};

export const ContactHistory = ({
  workspaceId,
  contactId,
}: ContactHistoryProps) => {
  const { t } = useLingui();
  const [expanded, setExpanded] = useState(false);
  return (
    <section>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? t`Hide history` : t`Show history`}
      </button>
      {expanded && (
        <ContactHistoryRecords
          workspaceId={workspaceId}
          contactId={contactId}
        />
      )}
    </section>
  );
};
