import { convexQuery, useConvexPaginatedQuery } from '@convex-dev/react-query';
import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { IconTargetArrow } from 'twenty-ui/icon';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import { SALES_OPEN_STAGES } from '../../../../../deployments/convex/convex/salesContract';
import { SalesAccessGate, useWorkspace } from './CompaniesWorkspace';
import { useSalesLabels } from './SalesLabels';
import { formatSalesMinor, SalesPipelineTotals } from './SalesPipelineTotals';
import './SalesProjects.css';

type OpenStage = (typeof SALES_OPEN_STAGES)[number];

export const SalesPipelinePage = () => (
  <SalesAccessGate>
    <SalesPipeline />
  </SalesAccessGate>
);

const SalesPipeline = () => {
  const { t } = useLingui();
  const { workspaceId, workspaceName } = useWorkspace();
  const [stage, setStage] = useState<OpenStage>();
  const { stage: stageLabel } = useSalesLabels();
  const totals = useQuery(
    convexQuery(api.salesPipeline.totals, { workspaceId }),
  );
  if (totals.isError) throw totals.error;
  return (
    <div className="fenforce-page">
      <div className="fenforce-breadcrumb">
        {workspaceName} / {t`Sales pipeline`}
      </div>
      <header className="fenforce-page-header">
        <div>
          <h1>{t`Sales pipeline`}</h1>
          <p>{t`Open opportunities on the companies you can access, grouped by stage.`}</p>
        </div>
        <Link
          className="fenforce-secondary-button"
          to="/objects/sales-projects"
          search={{ workspace: workspaceId }}
        >{t`Sales projects by company`}</Link>
      </header>
      {totals.data ? (
        <SalesPipelineTotals
          groups={totals.data.groups}
          complete={totals.data.complete}
        />
      ) : (
        <p role="status">{t`Loading pipeline totals…`}</p>
      )}
      <section className="fenforce-sales-card" aria-label={t`Filter by stage`}>
        <label className="fenforce-form">
          <span>{t`Stage`}</span>
          <select
            value={stage ?? ''}
            onChange={(event) =>
              setStage(
                SALES_OPEN_STAGES.find((value) => value === event.target.value),
              )
            }
          >
            <option value="">{t`All open stages`}</option>
            {SALES_OPEN_STAGES.map((value) => (
              <option key={value} value={value}>
                {stageLabel(value)}
              </option>
            ))}
          </select>
        </label>
      </section>
      <SalesPipelineList key={stage ?? 'all'} stage={stage} />
    </div>
  );
};

const SalesPipelineList = ({ stage }: { stage: OpenStage | undefined }) => {
  const { t, i18n } = useLingui();
  const { workspaceId } = useWorkspace();
  const { stage: stageLabel } = useSalesLabels();
  const projects = useConvexPaginatedQuery(
    api.salesPipeline.list,
    { workspaceId, stage },
    { initialNumItems: 25 },
  );
  return (
    <section className="fenforce-records" aria-label={t`Open opportunities`}>
      <div className="fenforce-table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{t`Project`}</th>
              <th scope="col">{t`Company`}</th>
              <th scope="col">{t`Stage`}</th>
              <th scope="col">{t`Quoted amount`}</th>
              <th scope="col">{t`Expected close date`}</th>
              <th scope="col">{t`Next action`}</th>
            </tr>
          </thead>
          <tbody>
            {projects.results.map((project) => (
              <tr key={project._id}>
                <td>
                  <Link
                    className="fenforce-record-name"
                    to="/object/sales-project/$projectId"
                    params={{ projectId: project._id }}
                    search={{ workspace: workspaceId }}
                  >
                    <IconTargetArrow size={16} aria-hidden="true" />
                    {project.title}
                  </Link>
                </td>
                <td>{project.accountName}</td>
                <td>{stageLabel(project.stage)}</td>
                <td>
                  {isDefined(project.amountMinor)
                    ? formatSalesMinor(
                        project.amountMinor,
                        project.currency,
                        i18n.locale,
                      )
                    : t`Not quoted`}
                </td>
                <td>{project.closeDate ?? t`Not set`}</td>
                <td>
                  {project.nextAction} · {project.nextActionDate}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {projects.status === 'LoadingFirstPage' && (
        <p
          className="fenforce-table-message"
          role="status"
        >{t`Loading open opportunities…`}</p>
      )}
      {projects.status === 'Exhausted' && projects.results.length === 0 && (
        <p className="fenforce-table-message">{t`No open opportunities match this stage.`}</p>
      )}
      {projects.status === 'CanLoadMore' && (
        <div className="fenforce-load-more">
          <button
            type="button"
            className="fenforce-secondary-button"
            onClick={() => projects.loadMore(25)}
          >{t`Load more opportunities`}</button>
        </div>
      )}
    </section>
  );
};
