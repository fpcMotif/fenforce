import { convexQuery, useConvexPaginatedQuery } from '@convex-dev/react-query';
import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { isString } from '@sniptt/guards';
import { ConvexError } from 'convex/values';
import { Fragment, type ComponentProps, type ReactNode } from 'react';
import { isDefined } from 'twenty-shared/utils';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import type { Id } from '../../../../../deployments/convex/convex/_generated/dataModel';
import { SalesAccessGate, useWorkspace } from './CompaniesWorkspace';
import { SalesProjectActions } from './SalesProjectActions';
import { SalesProjectSummary } from './SalesProjectSummary';
import { useSalesLabels } from './SalesLabels';
import { SalesDemoNotice } from './SalesProjectsPage';
import { useAccountOperation } from './useAccountOperation';
import './SalesProjects.css';

export const SalesProjectDetailPage = () => {
  const { projectId } = useParams({ from: '/object/sales-project/$projectId' });
  return (
    <SalesAccessGate>
      <SalesProjectDetail key={projectId} />
    </SalesAccessGate>
  );
};

export const SalesFacts = ({
  rows,
}: {
  rows: { label: string; value: ReactNode }[];
}) => (
  <dl className="fenforce-sales-facts">
    {rows.map(({ label, value }) => (
      <Fragment key={label}>
        <dt>{label}</dt>
        <dd>{value}</dd>
      </Fragment>
    ))}
  </dl>
);

const SalesProjectDetail = () => {
  const { t } = useLingui();
  const { workspaceId, role } = useWorkspace();
  const { label, problem } = useSalesLabels();
  const { projectId } = useParams({ from: '/object/sales-project/$projectId' });
  const query = useQuery(
    convexQuery(api.salesProjects.get, {
      workspaceId,
      projectId: projectId as Id<'salesProjects'>,
    }),
  );
  const execute = useAccountOperation(api.salesProjects.execute);
  if (query.isError) throw query.error;
  if (query.isPending)
    return (
      <div
        className="fenforce-page"
        role="status"
      >{t`Loading sales project…`}</div>
    );
  if (!query.data)
    return (
      <div className="fenforce-page">
        <h1>{t`Project unavailable`}</h1>
        <Link
          to="/objects/sales-projects"
          search={{ workspace: workspaceId }}
        >{t`Back to sales projects`}</Link>
      </div>
    );
  const project = query.data;
  const { currentReview, blockers } = project;
  return (
    <div className="fenforce-page">
      <Link
        className="fenforce-back-link"
        to="/objects/sales-projects"
        search={{ workspace: workspaceId }}
      >{t`Back to sales projects`}</Link>
      <header className="fenforce-page-header">
        <div>
          <h1>{project.title}</h1>
          <p>
            {project.materialCode} · {project.productName}
          </p>
        </div>
        <span className="fenforce-sales-status">{label(project.stage)}</span>
      </header>
      <SalesDemoNotice />
      <div className="fenforce-sales-grid">
        <div>
          <section
            className="fenforce-sales-card"
            aria-label={t`Product project`}
          >
            <h2>{t`Product project`}</h2>
            <SalesFacts
              rows={[
                {
                  label: t`Company`,
                  value: (
                    <Link
                      to="/object/company/$companyId"
                      params={{ companyId: project.accountId }}
                      search={{ workspace: workspaceId }}
                    >{t`Open company`}</Link>
                  ),
                },
                { label: t`Specification`, value: project.specification },
                { label: t`Application`, value: project.application },
                {
                  label: t`Quantity`,
                  value: `${project.quantityMilli / 1000} ${project.unit}`,
                },
                { label: t`Currency`, value: project.currency },
                { label: t`Revision`, value: project.revision },
                { label: t`Next action`, value: project.nextAction },
                { label: t`Follow-up date`, value: project.nextActionDate },
                {
                  label: t`Expected close date`,
                  value: project.closeDate ?? t`Not set`,
                },
                {
                  label: t`Primary contact`,
                  value: isDefined(project.primaryContactId) ? (
                    <Link
                      to="/object/person/$personId"
                      params={{ personId: project.primaryContactId }}
                      search={{ workspace: workspaceId }}
                    >{t`Open contact`}</Link>
                  ) : (
                    t`Not linked`
                  ),
                },
              ]}
            />
          </section>
          <SalesProjectSummary project={project} />
          <section className="fenforce-sales-card" aria-label={t`Order review`}>
            <h2>{t`Order review`}</h2>
            <p>
              {currentReview
                ? t`Review evidence is tied to the submitted commercial version.`
                : t`No active order review. Capture the customer PO and submit it for review.`}
            </p>
            {blockers.length > 0 ? (
              <ul>
                {blockers.map((blocker) => (
                  <li key={blocker}>{problem(blocker)}</li>
                ))}
              </ul>
            ) : (
              <p>{t`No outstanding confirmation prerequisites.`}</p>
            )}
          </section>
          <section
            className="fenforce-sales-card"
            aria-label={t`Order releases`}
          >
            <h2>{t`Order releases`}</h2>
            {project.releases.length === 0 && (
              <p>{t`Standard orders get one release on confirmation. Blanket orders need customer-confirmed releases.`}</p>
            )}
            {project.releases.map((release) => (
              <div key={release.reference}>
                <h3>{release.reference}</h3>
                <p>
                  {release.quantityMilli / 1000} {project.unit} ·{' '}
                  {release.deliveryDate}
                </p>
                <p>
                  {release.erpState === 'accepted'
                    ? t`Demo: accepted`
                    : label(release.erpState)}
                </p>
              </div>
            ))}
          </section>
        </div>
        <SalesProjectContactActions
          accountId={project.accountId}
          revision={project.revision}
          stage={project.stage}
          isManager={role === 'manager'}
          onExecute={async (command, expectedRevision) => {
            try {
              return await execute.submit({
                workspaceId,
                projectId: project._id,
                expectedRevision,
                command,
              });
            } catch (failure) {
              if (failure instanceof ConvexError && isString(failure.data))
                throw new Error(problem(failure.data));
              throw failure;
            }
          }}
        />
      </div>
      <SalesProjectHistory projectId={project._id} />
    </div>
  );
};

const SalesProjectContactActions = ({
  accountId,
  revision,
  stage,
  isManager,
  onExecute,
}: Omit<ComponentProps<typeof SalesProjectActions>, 'contacts'> & {
  accountId: Id<'workspaceCompanies'>;
}) => {
  const { workspaceId } = useWorkspace();
  const contacts = useConvexPaginatedQuery(
    api.workspaceContacts.list,
    { workspaceId, accountId },
    { initialNumItems: 100 },
  );
  return (
    <SalesProjectActions
      revision={revision}
      stage={stage}
      isManager={isManager}
      onExecute={onExecute}
      contacts={contacts.results.map((contact) => ({
        id: contact._id,
        name: contact.lastName,
      }))}
    />
  );
};

const SalesProjectHistory = ({
  projectId,
}: {
  projectId: Id<'salesProjects'>;
}) => {
  const { t } = useLingui();
  const { workspaceId } = useWorkspace();
  const { label } = useSalesLabels();
  const history = useConvexPaginatedQuery(
    api.salesProjects.history,
    { workspaceId, projectId },
    { initialNumItems: 25 },
  );
  return (
    <section className="fenforce-sales-card" aria-label={t`Project history`}>
      <h2>{t`Project history`}</h2>
      <ol className="fenforce-sales-history">
        {history.results.map((event) => (
          <li key={event._id}>
            <strong>{label(event.command.type)}</strong>
            <p>{event.actorName}</p>
            {isDefined(event.fromStage) &&
              event.fromStage !== event.toStage && (
                <p>{t`${label(event.fromStage)} to ${label(event.toStage)}`}</p>
              )}
            {event.command.type === 'logActivity' && (
              <p>{event.command.text}</p>
            )}
            {event.command.type === 'recordSample' && (
              <p>
                {label(event.command.status)} · {event.command.notes}
              </p>
            )}
            {'evidenceReference' in event.command && (
              <p>{event.command.evidenceReference}</p>
            )}
            {event.previousQuote && (
              <p>
                {t`Previous quote version`}: {event.previousQuote.version} ·{' '}
                {event.previousQuote.unitPriceMinor / 100} ·{' '}
                {event.previousQuote.incoterm} {event.previousQuote.namedPlace}
              </p>
            )}
            <time dateTime={new Date(event._creationTime).toISOString()}>
              {new Date(event._creationTime).toLocaleString()}
            </time>
          </li>
        ))}
      </ol>
      {history.status === 'CanLoadMore' && (
        <button
          type="button"
          className="fenforce-secondary-button"
          onClick={() => history.loadMore(25)}
        >{t`Load more history`}</button>
      )}
    </section>
  );
};
