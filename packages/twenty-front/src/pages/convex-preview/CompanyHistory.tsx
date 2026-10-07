import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import type {
  Doc,
  Id,
} from '../../../../../deployments/convex/convex/_generated/dataModel';
import { IndustryLabel } from './CompanyForm';

type CompanyHistoryProps = {
  workspaceId: Id<'workspaces'>;
  companyId: Id<'workspaceCompanies'>;
};
type CompanyHistoryRecordsProps = CompanyHistoryProps;

const HistoryValues = ({
  values,
  ownerName,
}: {
  values: Doc<'accountAudit'>['after'] | null;
  ownerName: string | null;
}) => {
  const { t } = useLingui();
  if (values === null) return <p>{t`Not created yet`}</p>;
  return (
    <dl>
      <dt>{t`Name`}</dt>
      <dd>{values.name}</dd>
      <dt>{t`Industry`}</dt>
      <dd>
        <IndustryLabel industry={values.industry} />
      </dd>
      <dt>{t`Account Owner`}</dt>
      <dd>{ownerName ?? '—'}</dd>
      <dt>{t`Domain Name`}</dt>
      <dd>
        {values.domainName.primaryLinkLabel || '—'}{' '}
        {values.domainName.primaryLinkUrl}
      </dd>
      {values.domainName.secondaryLinks.map((link, index) => (
        <div key={`${index}:${link.url}`}>
          <dt>{t`Additional domain`}</dt>
          <dd>
            {link.label} {link.url}
          </dd>
        </div>
      ))}
      <dt>{t`State`}</dt>
      <dd>{values.deletedAt === null ? t`Active` : t`Trashed`}</dd>
    </dl>
  );
};

const CompanyHistoryRecords = ({
  workspaceId,
  companyId,
}: CompanyHistoryRecordsProps) => {
  const { t } = useLingui();
  const history = useConvexPaginatedQuery(
    api.workspaceCompanies.history,
    { workspaceId, companyId },
    { initialNumItems: 10 },
  );
  return (
    <section aria-label={t`Company history`}>
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
            <HistoryValues
              values={entry.before}
              ownerName={entry.beforeOwnerName}
            />
          </details>
          <details>
            <summary>{t`After`}</summary>
            <HistoryValues
              values={entry.after}
              ownerName={entry.afterOwnerName}
            />
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

export const CompanyHistory = ({
  workspaceId,
  companyId,
}: CompanyHistoryProps) => {
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
        <CompanyHistoryRecords
          workspaceId={workspaceId}
          companyId={companyId}
        />
      )}
    </section>
  );
};
