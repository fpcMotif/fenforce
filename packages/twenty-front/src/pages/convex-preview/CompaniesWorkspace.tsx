import { useAuthActions } from '@convex-dev/auth/react';
import { convexQuery, useConvexPaginatedQuery } from '@convex-dev/react-query';
import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useConvexConnectionState, useMutation } from 'convex/react';
import {
  createContext,
  useContext,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { MainButton } from 'twenty-ui/components';
import {
  IconBuildingSkyscraper,
  IconChevronLeft,
  IconPlus,
} from 'twenty-ui/icon';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import type { Id } from '../../../../../deployments/convex/convex/_generated/dataModel';
import { CompanyForm, type CompanyFormValues } from './CompanyForm';

type WorkspaceContextValue = {
  workspaceId: Id<'workspaces'>;
  workspaceName: string;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const useWorkspace = () => {
  const workspace = useContext(WorkspaceContext);

  if (workspace === null) {
    throw new Error('Workspace context is unavailable');
  }

  return workspace;
};

const WorkspaceCreation = ({
  onCreated,
}: {
  onCreated: (workspaceId: Id<'workspaces'>, name: string) => void;
}) => {
  const { t } = useLingui();
  const createWorkspace = useMutation(api.workspaces.create);
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setHasError(false);

    try {
      const workspaceId = await createWorkspace({ name: name.trim() });
      onCreated(workspaceId, name.trim());
    } catch {
      setHasError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fenforce-gate">
      <section className="fenforce-gate-card">
        <div className="fenforce-gate-mark">
          <IconBuildingSkyscraper size={22} />
        </div>
        <h1>{t`Create your workspace`}</h1>
        <p className="fenforce-gate-copy">{t`Your companies belong to a workspace.`}</p>
        <form className="fenforce-form" onSubmit={submit}>
          <label>
            <span>{t`Workspace name`}</span>
            <input
              name="workspaceName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              required
              autoFocus
            />
          </label>
          {hasError && (
            <p className="fenforce-form-error" role="alert">
              {t`Unable to create a workspace. Try again.`}
            </p>
          )}
          <MainButton type="submit" fullWidth loading={isSubmitting}>
            {t`Create workspace`}
          </MainButton>
        </form>
      </section>
    </div>
  );
};

export const WorkspaceGate = ({ children }: { children: ReactNode }) => {
  const { t } = useLingui();
  const { signOut } = useAuthActions();
  const connection = useConvexConnectionState();
  const workspaces = useConvexPaginatedQuery(
    api.workspaces.listMine,
    {},
    { initialNumItems: 50 },
  );
  const [preferredWorkspace, setPreferredWorkspace] = useState<{
    workspaceId: Id<'workspaces'>;
    name: string;
  } | null>(null);

  if (workspaces.status === 'LoadingFirstPage') {
    return (
      <div className="fenforce-gate" role="status">
        <div className="fenforce-gate-card">{t`Loading your workspaces…`}</div>
      </div>
    );
  }

  if (workspaces.results.length === 0 && preferredWorkspace === null) {
    return (
      <WorkspaceCreation
        onCreated={(workspaceId, name) =>
          setPreferredWorkspace({ workspaceId, name })
        }
      />
    );
  }

  const selected =
    workspaces.results.find(
      (workspace) => workspace.workspaceId === preferredWorkspace?.workspaceId,
    ) ?? workspaces.results[0];
  const workspaceId = preferredWorkspace?.workspaceId ?? selected?.workspaceId;
  const workspaceName =
    selected?.workspaceId === workspaceId
      ? selected.name
      : (preferredWorkspace?.name ?? '');

  if (workspaceId === undefined) {
    return null;
  }

  return (
    <WorkspaceContext.Provider value={{ workspaceId, workspaceName }}>
      <div className="fenforce-app">
        <aside className="fenforce-sidebar">
          <div className="fenforce-brand">Fenforce</div>
          <label className="fenforce-workspace-picker">
            <span className="fenforce-sr-only">{t`Workspace`}</span>
            <select
              value={workspaceId}
              onChange={(event) => {
                const nextWorkspace = workspaces.results.find(
                  (workspace) => workspace.workspaceId === event.target.value,
                );

                if (nextWorkspace) {
                  setPreferredWorkspace({
                    workspaceId: nextWorkspace.workspaceId,
                    name: nextWorkspace.name,
                  });
                }
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
              {selected === undefined && (
                <option value={workspaceId}>{workspaceName}</option>
              )}
            </select>
          </label>
          {workspaces.status === 'CanLoadMore' && (
            <button
              className="fenforce-text-button fenforce-sidebar-more"
              type="button"
              onClick={() => workspaces.loadMore(50)}
            >
              {t`Load more workspaces`}
            </button>
          )}
          <div className="fenforce-sidebar-section">{t`Objects`}</div>
          <nav aria-label={t`Workspace navigation`}>
            <Link
              to="/objects/companies"
              className="fenforce-sidebar-link"
              activeProps={{
                className: 'fenforce-sidebar-link fenforce-sidebar-link-active',
              }}
            >
              <IconBuildingSkyscraper size={16} />
              <span>{t`Companies`}</span>
            </Link>
          </nav>
          <button
            className="fenforce-signout"
            type="button"
            onClick={() => void signOut()}
          >
            {t`Sign out`}
          </button>
        </aside>
        <div className="fenforce-content">
          {!connection.isWebSocketConnected && connection.hasEverConnected && (
            <div className="fenforce-connection" role="status">
              {t`Connection interrupted. Your changes will resume when you reconnect.`}
            </div>
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

export const CompaniesPage = () => {
  const { t } = useLingui();
  const { workspaceId, workspaceName } = useWorkspace();
  const navigate = useNavigate();
  const createCompany = useMutation(api.workspaceCompanies.create);
  const companies = useConvexPaginatedQuery(
    api.workspaceCompanies.list,
    { workspaceId },
    { initialNumItems: 25 },
  );
  const [isCreating, setIsCreating] = useState(false);

  const saveCompany = async (values: CompanyFormValues) => {
    const companyId = await createCompany({ workspaceId, ...values });
    setIsCreating(false);
    await navigate({ to: '/object/company/$companyId', params: { companyId } });
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
        <Link to="/objects/companies">{t`Back to companies`}</Link>
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
        {workspaceName} / <Link to="/objects/companies">{t`Companies`}</Link> /{' '}
        {record.name}
      </div>
      <header className="fenforce-page-header">
        <div>
          <Link to="/objects/companies" className="fenforce-back-link">
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
