import { useAuthActions } from '@convex-dev/auth/react';
import { convexQuery, useConvexPaginatedQuery } from '@convex-dev/react-query';
import { useLingui } from '@lingui/react/macro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useRouter,
  useSearch,
} from '@tanstack/react-router';
import { useConvexConnectionState, useMutation } from 'convex/react';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { MainButton } from 'twenty-ui/components';
import {
  IconBuildingSkyscraper,
  IconChevronLeft,
  IconPlus,
  IconUsers,
} from 'twenty-ui/icon';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import type {
  Doc,
  Id,
} from '../../../../../deployments/convex/convex/_generated/dataModel';
import { CompanyForm, type CompanyFormValues } from './CompanyForm';
import { MemberAdministration } from './MemberAdministration';

type WorkspaceContextValue = {
  workspaceId: Id<'workspaces'>;
  workspaceName: string;
  role: Doc<'workspaceMembers'>['role'];
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const useWorkspace = () => {
  const workspace = useContext(WorkspaceContext);

  if (workspace === null) {
    throw new Error('Workspace context is unavailable');
  }

  return workspace;
};

export const WorkspaceGate = ({ children }: { children: ReactNode }) => {
  const { t } = useLingui();
  const { signOut } = useAuthActions();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { workspace: requestedWorkspace } = useSearch({ strict: false });
  const connection = useConvexConnectionState();
  const workspaces = useConvexPaginatedQuery(
    api.workspaces.listMine,
    {},
    { initialNumItems: 50 },
  );
  const [logoutStatus, setLogoutStatus] = useState<
    'idle' | 'pending' | 'failed'
  >('idle');
  const logout = async () => {
    setLogoutStatus('pending');
    queryClient.clear();
    try {
      await signOut();
    } catch {
      setLogoutStatus('failed');
    }
  };

  if (logoutStatus !== 'idle') {
    return (
      <div className="fenforce-gate">
        <section className="fenforce-gate-card" role="status">
          <h1>
            {logoutStatus === 'failed'
              ? t`Unable to complete sign-out`
              : t`Signing out…`}
          </h1>
          {logoutStatus === 'failed' && (
            <button
              className="fenforce-secondary-button"
              type="button"
              onClick={() => void logout()}
            >{t`Try signing out again`}</button>
          )}
        </section>
      </div>
    );
  }

  if (workspaces.status === 'LoadingFirstPage') {
    return (
      <div className="fenforce-gate" role="status">
        <div className="fenforce-gate-card">{t`Loading your workspaces…`}</div>
      </div>
    );
  }

  const selected = workspaces.results.find(
    (workspace) => workspace.workspaceId === requestedWorkspace,
  );
  const firstWorkspace = workspaces.results[0];
  if (requestedWorkspace === undefined && firstWorkspace !== undefined) {
    return (
      <Navigate
        to="."
        search={{ workspace: firstWorkspace.workspaceId }}
        replace
      />
    );
  }
  if (selected === undefined) {
    return (
      <div className="fenforce-gate">
        <section className="fenforce-gate-card">
          <h1>{t`Workspace unavailable`}</h1>
          <p>{t`Choose an assigned workspace or contact your administrator.`}</p>
          {workspaces.results.map((workspace) => (
            <p key={workspace.workspaceId}>
              <Link
                to="/objects/companies"
                search={{ workspace: workspace.workspaceId }}
              >
                {workspace.name}
              </Link>
            </p>
          ))}
          {workspaces.status === 'CanLoadMore' && (
            <button
              type="button"
              onClick={() => workspaces.loadMore(50)}
            >{t`Load more workspaces`}</button>
          )}
          <button
            className="fenforce-secondary-button"
            type="button"
            onClick={() => void logout()}
          >{t`Sign out`}</button>
        </section>
      </div>
    );
  }

  const workspaceId = selected.workspaceId;
  const workspaceName = selected.name;
  const isAdministrator = selected.role === 'admin';
  if (isAdministrator && location.pathname !== '/settings/members') {
    return (
      <Navigate
        to="/settings/members"
        search={{ workspace: workspaceId }}
        replace
      />
    );
  }
  return (
    <WorkspaceContext.Provider
      key={workspaceId}
      value={{ workspaceId, workspaceName, role: selected.role }}
    >
      <div className="fenforce-app">
        <aside className="fenforce-sidebar">
          <div className="fenforce-brand">Fenforce</div>
          <label className="fenforce-workspace-picker">
            <span className="fenforce-sr-only">{t`Workspace`}</span>
            <select
              value={workspaceId}
              onChange={(event) => {
                void navigate({
                  to: '/objects/companies',
                  search: { workspace: event.target.value },
                });
              }}
            >
              {workspaces.results.map((workspace) => (
                <option
                  key={workspace.workspaceId}
                  value={workspace.workspaceId}
                >
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
          {workspaces.status === 'CanLoadMore' && (
            <button
              className="fenforce-text-button fenforce-sidebar-more"
              type="button"
              onClick={() => workspaces.loadMore(50)}
            >{t`Load more workspaces`}</button>
          )}
          <div className="fenforce-sidebar-section">
            {isAdministrator ? t`Administration` : t`Objects`}
          </div>
          <nav aria-label={t`Workspace navigation`}>
            <Link
              to={isAdministrator ? '/settings/members' : '/objects/companies'}
              search={{ workspace: workspaceId }}
              className="fenforce-sidebar-link"
              activeProps={{
                className: 'fenforce-sidebar-link fenforce-sidebar-link-active',
              }}
            >
              {isAdministrator ? (
                <IconUsers size={16} />
              ) : (
                <IconBuildingSkyscraper size={16} />
              )}
              <span>{isAdministrator ? t`Members` : t`Companies`}</span>
            </Link>
          </nav>
          <button
            className="fenforce-signout"
            type="button"
            onClick={() => void logout()}
          >{t`Sign out`}</button>
        </aside>
        <div className="fenforce-content">
          {!connection.isWebSocketConnected && connection.hasEverConnected && (
            <div
              className="fenforce-connection"
              role="status"
            >{t`Connection interrupted. Your changes will resume when you reconnect.`}</div>
          )}
          <main>{children}</main>
        </div>
      </div>
    </WorkspaceContext.Provider>
  );
};

const formatDate = (timestamp: number) =>
  new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(timestamp));

export const WorkspaceAdministrationPage = () => {
  const { t } = useLingui();
  const { workspaceId, role } = useWorkspace();
  if (role !== 'admin')
    return (
      <div
        className="fenforce-page"
        role="alert"
      >{t`Administrator access is required.`}</div>
    );
  return <MemberAdministration workspaceId={workspaceId} />;
};

export const CompaniesPage = () => {
  const { t } = useLingui();
  const { workspaceId, workspaceName } = useWorkspace();
  const navigate = useNavigate();
  const router = useRouter();
  const createCompany = useMutation(api.workspaceCompanies.create);
  const companies = useConvexPaginatedQuery(
    api.workspaceCompanies.list,
    { workspaceId },
    { initialNumItems: 25 },
  );
  const [isCreating, setIsCreating] = useState(false);

  const saveCompany = async (values: CompanyFormValues) => {
    const location = router.state.location;
    const companyId = await createCompany({ workspaceId, ...values });
    if (router.state.location !== location) return;
    setIsCreating(false);
    await navigate({
      to: '/object/company/$companyId',
      params: { companyId },
      search: { workspace: workspaceId },
    });
  };

  return (
    <div className="fenforce-page">
      <div className="fenforce-breadcrumb">
        {workspaceName} / {t`Companies`}
      </div>
      <header className="fenforce-page-header">
        <div>
          <h1>{t`Companies`}</h1>
          <p>{t`Manage the companies in your workspace.`}</p>
        </div>
        <MainButton
          type="button"
          startIcon={<IconPlus size={16} />}
          onClick={() => setIsCreating(true)}
        >
          {t`New company`}
        </MainButton>
      </header>
      {isCreating && (
        <section className="fenforce-editor" aria-label={t`New company`}>
          <h2>{t`New company`}</h2>
          <CompanyForm
            workspaceId={workspaceId}
            onSave={saveCompany}
            onCancel={() => setIsCreating(false)}
          />
        </section>
      )}
      <section className="fenforce-records" aria-label={t`Companies`}>
        <div className="fenforce-records-toolbar">
          <span>{t`All companies`}</span>
          <span className="fenforce-muted">
            {companies.status === 'LoadingFirstPage'
              ? t`Loading…`
              : t`${companies.results.length} loaded`}
          </span>
        </div>
        <div className="fenforce-table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">{t`Name`}</th>
                <th scope="col">{t`Domain Name`}</th>
                <th scope="col">{t`Account Owner`}</th>
                <th scope="col">{t`Created by`}</th>
                <th scope="col">{t`Creation date`}</th>
              </tr>
            </thead>
            <tbody>
              {companies.results.map((company) => (
                <tr key={company._id}>
                  <td>
                    <Link
                      to="/object/company/$companyId"
                      params={{ companyId: company._id }}
                      search={{ workspace: workspaceId }}
                      className="fenforce-record-name"
                    >
                      <span className="fenforce-company-icon">
                        <IconBuildingSkyscraper size={15} />
                      </span>
                      {company.name}
                    </Link>
                  </td>
                  <td>
                    {company.domainName.primaryLinkUrl ? (
                      <a
                        className="fenforce-domain-link"
                        href={company.domainName.primaryLinkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {company.domainName.primaryLinkLabel}
                      </a>
                    ) : (
                      <span className="fenforce-muted">—</span>
                    )}
                  </td>
                  <td>
                    {company.accountOwnerName ?? (
                      <span className="fenforce-muted">—</span>
                    )}
                  </td>
                  <td>{company.createdByName}</td>
                  <td>{formatDate(company.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {companies.status === 'LoadingFirstPage' && (
          <div className="fenforce-table-message" role="status">
            {t`Loading companies…`}
          </div>
        )}
        {companies.status !== 'LoadingFirstPage' &&
          companies.results.length === 0 && (
            <div className="fenforce-table-message">
              <IconBuildingSkyscraper size={24} />
              <strong>{t`No companies yet`}</strong>
              <span>{t`Create a company to start building your records.`}</span>
            </div>
          )}
        {(companies.status === 'CanLoadMore' ||
          companies.status === 'LoadingMore') && (
          <div className="fenforce-load-more">
            <button
              type="button"
              className="fenforce-secondary-button"
              disabled={companies.status === 'LoadingMore'}
              onClick={() => companies.loadMore(25)}
            >
              {companies.status === 'LoadingMore' ? t`Loading…` : t`Load more`}
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

export const CompanyDetailPage = () => {
  const { t } = useLingui();
  const { workspaceId, workspaceName } = useWorkspace();
  const { companyId } = useParams({ from: '/object/company/$companyId' });
  const updateCompany = useMutation(api.workspaceCompanies.update);
  const company = useQuery(
    convexQuery(api.workspaceCompanies.get, {
      workspaceId,
      companyId: companyId as Id<'workspaceCompanies'>,
    }),
  );
  const [editingRevision, setEditingRevision] = useState<number | null>(null);

  if (company.isPending) {
    return (
      <div className="fenforce-page" role="status">{t`Loading company…`}</div>
    );
  }

  if (company.isError) {
    return (
      <div className="fenforce-page" role="alert">
        <h1>{t`Unable to load company`}</h1>
        <p>{t`Check your connection and try again.`}</p>
      </div>
    );
  }

  if (company.data === null) {
    return (
      <div className="fenforce-page">
        <h1>{t`Company not found`}</h1>
        <Link
          to="/objects/companies"
          search={{ workspace: workspaceId }}
        >{t`Back to companies`}</Link>
      </div>
    );
  }

  const record = company.data;
  const saveCompany = async (values: CompanyFormValues) => {
    if (editingRevision === null) {
      return;
    }

    await updateCompany({
      workspaceId,
      companyId: record._id,
      expectedRevision: editingRevision,
      ...values,
    });
    setEditingRevision(null);
  };

  return (
    <div className="fenforce-page fenforce-detail-page">
      <div className="fenforce-breadcrumb">
        {workspaceName} /{' '}
        <Link
          to="/objects/companies"
          search={{ workspace: workspaceId }}
        >{t`Companies`}</Link>{' '}
        / {record.name}
      </div>
      <header className="fenforce-page-header">
        <div>
          <Link
            to="/objects/companies"
            search={{ workspace: workspaceId }}
            className="fenforce-back-link"
          >
            <IconChevronLeft size={16} /> {t`Companies`}
          </Link>
          <h1>{record.name}</h1>
        </div>
        {editingRevision === null && (
          <MainButton
            type="button"
            onClick={() => setEditingRevision(record.revision)}
          >
            {t`Edit company`}
          </MainButton>
        )}
      </header>
      {editingRevision !== null ? (
        <section className="fenforce-editor" aria-label={t`Edit company`}>
          <h2>{t`Edit company`}</h2>
          <CompanyForm
            key={record._id}
            workspaceId={workspaceId}
            initialValues={{
              name: record.name,
              domainName: record.domainName.primaryLinkLabel,
              accountOwnerId: record.accountOwnerId,
            }}
            onSave={saveCompany}
            onCancel={() => setEditingRevision(null)}
          />
        </section>
      ) : (
        <section className="fenforce-details" aria-label={t`Company details`}>
          <h2>{t`Details`}</h2>
          <dl>
            <div>
              <dt>{t`Name`}</dt>
              <dd>{record.name}</dd>
            </div>
            <div>
              <dt>{t`Domain Name`}</dt>
              <dd>{record.domainName.primaryLinkLabel || '—'}</dd>
            </div>
            <div>
              <dt>{t`Account Owner`}</dt>
              <dd>{record.accountOwnerName ?? '—'}</dd>
            </div>
            <div>
              <dt>{t`Created by`}</dt>
              <dd>{record.createdByName}</dd>
            </div>
            <div>
              <dt>{t`Creation date`}</dt>
              <dd>{formatDate(record.createdAt)}</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
};
