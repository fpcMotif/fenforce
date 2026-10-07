import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { useLingui } from '@lingui/react/macro';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { MainButton } from 'twenty-ui/components';
import { IconPlus, IconTargetArrow } from 'twenty-ui/icon';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import { SalesAccessGate, useWorkspace } from './CompaniesWorkspace';
import { CompanyPicker, type SelectedCompany } from './CompanyPicker';
import { SalesProjectCreate } from './SalesProjectCreate';
import { useSalesLabels } from './SalesLabels';
import { useAccountOperation } from './useAccountOperation';
import './SalesProjects.css';

export const SalesDemoNotice = () => {
  const { t } = useLingui();
  return (
    <p className="fenforce-sales-notice">{t`Sales workflow demo. Approvals, customer confirmation and SAP responses are simulated. No email, Feishu request or SAP order is sent.`}</p>
  );
};

export const SalesProjectsPage = () => (
  <SalesAccessGate>
    <SalesProjectsWorkspace />
  </SalesAccessGate>
);

const SalesProjectsWorkspace = () => {
  const { t } = useLingui();
  const { workspaceId, workspaceName } = useWorkspace();
  const [company, setCompany] = useState<SelectedCompany>();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const router = useRouter();
  const create = useAccountOperation(api.salesProjects.create);
  return (
    <div className="fenforce-page">
      <div className="fenforce-breadcrumb">
        {workspaceName} / {t`Sales projects`}
      </div>
      <header className="fenforce-page-header">
        <div>
          <h1>{t`Sales projects`}</h1>
          <p>{t`Follow a product opportunity from sampling to a confirmed order.`}</p>
        </div>
        {company && (
          <MainButton
            type="button"
            startIcon={<IconPlus size={16} />}
            onClick={() => setCreating(true)}
          >{t`New sales project`}</MainButton>
        )}
      </header>
      <SalesDemoNotice />
      <section className="fenforce-sales-card" aria-label={t`Choose a company`}>
        <div className="fenforce-form">
          <CompanyPicker
            workspaceId={workspaceId}
            label={t`Company`}
            emptyLabel={t`Choose a company`}
            value={company}
            onChange={(selected) => {
              setCompany(selected);
              setCreating(false);
            }}
          />
        </div>
      </section>
      {company && creating && (
        <section
          className="fenforce-sales-card"
          aria-label={t`New sales project`}
        >
          <h2>{t`New sales project`}</h2>
          <SalesProjectCreate
            onCancel={() => setCreating(false)}
            onSave={async (values) => {
              const location = router.state.location;
              const projectId = await create.submit({
                workspaceId,
                accountId: company.accountId,
                ...values,
              });
              if (router.state.location !== location) return;
              setCreating(false);
              await navigate({
                to: '/object/sales-project/$projectId',
                params: { projectId },
                search: { workspace: workspaceId },
              });
            }}
          />
        </section>
      )}
      {company ? (
        <SalesProjectList key={company.accountId} company={company} />
      ) : (
        <p>{t`Choose a company to see its projects and confirm who owns the customer relationship.`}</p>
      )}
    </div>
  );
};

const SalesProjectList = ({ company }: { company: SelectedCompany }) => {
  const { t } = useLingui();
  const { stage: stageLabel } = useSalesLabels();
  const { workspaceId } = useWorkspace();
  const projects = useConvexPaginatedQuery(
    api.salesProjects.list,
    { workspaceId, accountId: company.accountId },
    { initialNumItems: 25 },
  );
  return (
    <section className="fenforce-records" aria-label={t`Sales projects`}>
      <div className="fenforce-records-toolbar">{t`Product opportunities`}</div>
      <div className="fenforce-table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{t`Project`}</th>
              <th scope="col">{t`Product`}</th>
              <th scope="col">{t`Next action`}</th>
              <th scope="col">{t`Status`}</th>
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
                <td>{project.productName}</td>
                <td>
                  {project.nextAction} · {project.nextActionDate}
                </td>
                <td>{stageLabel(project.stage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {projects.status === 'LoadingFirstPage' && (
        <p
          className="fenforce-table-message"
          role="status"
        >{t`Loading sales projects…`}</p>
      )}
      {projects.status === 'Exhausted' && projects.results.length === 0 && (
        <p className="fenforce-table-message">{t`No projects yet. Start with a product, specification and next customer action.`}</p>
      )}
      {projects.status === 'CanLoadMore' && (
        <div className="fenforce-load-more">
          <button
            type="button"
            className="fenforce-secondary-button"
            onClick={() => projects.loadMore(25)}
          >{t`Load more projects`}</button>
        </div>
      )}
    </section>
  );
};
