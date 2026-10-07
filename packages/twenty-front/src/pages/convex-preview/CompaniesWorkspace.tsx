import { useAuthActions } from '@convex-dev/auth/react';
import { convexQuery, useConvexPaginatedQuery } from '@convex-dev/react-query';
import { useLingui } from '@lingui/react/macro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useRouter,
  useSearch,
} from '@tanstack/react-router';
import { useConvexConnectionState } from 'convex/react';
import { ConvexError } from 'convex/values';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { isDefined } from 'twenty-shared/utils';
import { MainButton } from 'twenty-ui/components';
import {
  IconBuildingSkyscraper,
  IconChevronLeft,
  IconPlus,
  IconTrash,
  IconUsers,
} from 'twenty-ui/icon';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import type {
  Doc,
  Id,
} from '../../../../../deployments/convex/convex/_generated/dataModel';
import {
  CompanyForm,
  IndustryLabel,
  type CompanyFormValues,
} from './CompanyForm';
import { MemberAdministration } from './MemberAdministration';
import { CompanyTrash, CompanyTrashAction } from './CompanyLifecycle';
import { CompanyHistory } from './CompanyHistory';
import { isSalesRole } from '../../../../../deployments/convex/convex/membershipRole';
import { CompanyListControls } from './CompanyListControls';
import { CompanySavedViews } from './CompanySavedViews';
import { useAccountOperation } from './useAccountOperation';
import {
  isFilteredCompanyListQuery,
  readCompanyListQuery,
  toCompanyListArgs,
  toCompanyListSearch,
  type CompanyListQuery,
} from './companyListQuery';

type WorkspaceContextValue = {
  workspaceId: Id<'workspaces'>;
  workspaceName: string;
  role: Doc<'workspaceMembers'>['role'];
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const WorkspaceRedirectEffect = ({
  workspaceId,
  to,
}: {
  workspaceId: Id<'workspaces'>;
  to: '.' | '/settings/members';
}) => {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to, search: { workspace: workspaceId }, replace: true });
  }, [navigate, to, workspaceId]);
  return null;
};

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
  const requestedMembership = useQuery(
    convexQuery(
      api.workspaces.getMine,
      isDefined(requestedWorkspace) && logoutStatus === 'idle'
        ? { workspaceId: requestedWorkspace }
        : 'skip',
    ),
  );
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

  if (requestedMembership.isError) {
    throw requestedMembership.error;
  }

  if (
    workspaces.status === 'LoadingFirstPage' ||
    (isDefined(requestedWorkspace) && requestedMembership.isPending)
  ) {
    return (
      <div className="fenforce-gate" role="status">
        <div className="fenforce-gate-card">{t`Loading your workspaces…`}</div>
      </div>
    );
  }

  const selected = requestedMembership.data ?? undefined;
  const firstWorkspace = workspaces.results[0];
  if (requestedWorkspace === undefined && firstWorkspace !== undefined) {
    return (
      <WorkspaceRedirectEffect
        to="."
        workspaceId={firstWorkspace.workspaceId}
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
      <WorkspaceRedirectEffect
        to="/settings/members"
        workspaceId={workspaceId}
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
              {!workspaces.results.some(
                (workspace) => workspace.workspaceId === workspaceId,
              ) && <option value={workspaceId}>{workspaceName}</option>}
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
            {isSalesRole(selected.role) && (
              <Link
                to="/objects/companies/trash"
                search={{ workspace: workspaceId }}
                className="fenforce-sidebar-link"
              >
                <IconTrash size={16} />
                <span>{t`Trash`}</span>
              </Link>
            )}
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

const SalesAccessGate = ({ children }: { children: ReactNode }) => {
  const { t } = useLingui();
  const { role } = useWorkspace();
  if (!isSalesRole(role))
    return (
      <div
        className="fenforce-page"
        role="alert"
      >{t`Sales access is required.`}</div>
    );
  return children;
};

export const CompaniesPage = () => (
  <SalesAccessGate>
    <CompanyRecordsWithOwnerFilterFallback />
  </SalesAccessGate>
);

const OwnerFilterResetEffect = ({
  owner,
  onReset,
}: {
  owner: string;
  onReset: (owner: string) => void;
}) => {
  const navigate = useNavigate();
  useEffect(() => {
    onReset(owner);
    void navigate({
      to: '/objects/companies',
      search: (search) => ({ ...search, owner: undefined }),
      replace: true,
    });
  }, [navigate, onReset, owner]);
  return null;
};

const isOwnerFilterError = (error: unknown) =>
  error instanceof ConvexError
    ? error.data === 'FORBIDDEN'
    : error instanceof Error &&
      error.message.includes('ArgumentValidationError') &&
      error.message.includes('ownerId');

const CompanyRecordsWithOwnerFilterFallback = () => {
  const { role } = useWorkspace();
  const { owner } = useSearch({ from: '/objects/companies' });
  const [unavailableOwner, setUnavailableOwner] = useState<string>();
  return (
    <ErrorBoundary
      key={unavailableOwner}
      fallbackRender={({ error }) => {
        if (
          role !== 'manager' ||
          !isDefined(owner) ||
          owner === unavailableOwner ||
          !isOwnerFilterError(error)
        )
          throw error;
        return (
          <OwnerFilterResetEffect owner={owner} onReset={setUnavailableOwner} />
        );
      }}
    >
      <CompanyRecords unavailableOwner={unavailableOwner} />
    </ErrorBoundary>
  );
};

export const CompanyTrashPage = () => {
  const { workspaceId } = useWorkspace();
  return (
    <SalesAccessGate>
      <CompanyTrash workspaceId={workspaceId} />
    </SalesAccessGate>
  );
};

const CompanyRecords = ({
  unavailableOwner,
}: {
  unavailableOwner: string | undefined;
}) => {
  const { t } = useLingui();
  const { workspaceId, workspaceName, role } = useWorkspace();
  const navigate = useNavigate();
  const router = useRouter();
  const listSearch = useSearch({ from: '/objects/companies' });
  const canFilterOwner = role === 'manager';
  const isOwnerFilterReset =
    isDefined(unavailableOwner) &&
    (!isDefined(listSearch.owner) || listSearch.owner === unavailableOwner);
  const query = readCompanyListQuery(
    listSearch.owner === unavailableOwner
      ? { ...listSearch, owner: undefined }
      : listSearch,
    canFilterOwner,
  );
  const activeViewId = listSearch.view as Id<'accountViews'> | undefined;
  const isFiltered = isFilteredCompanyListQuery(query);
  const createCompany = useAccountOperation(api.workspaceCompanies.create);
  const companies = useConvexPaginatedQuery(
    api.workspaceCompanies.list,
    { workspaceId, ...toCompanyListArgs(query) },
    { initialNumItems: 25 },
  );
  const [isCreating, setIsCreating] = useState(false);

  const showQuery = (
    nextQuery: CompanyListQuery | undefined,
    viewId?: Id<'accountViews'>,
  ) =>
    void navigate({
      to: '/objects/companies',
      search: {
        workspace: workspaceId,
        ...(nextQuery === undefined
          ? {}
          : toCompanyListSearch(nextQuery, viewId)),
      },
    });

  const saveCompany = async (values: CompanyFormValues) => {
    const location = router.state.location;
    const companyId = await createCompany.submit({ workspaceId, ...values });
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
            canReassignOwner={role === 'manager'}
            isReconnecting={createCompany.isReconnecting}
            onSave={saveCompany}
            onCancel={() => setIsCreating(false)}
          />
        </section>
      )}
      <section className="fenforce-records" aria-label={t`Companies`}>
        {isOwnerFilterReset && (
          <p role="status">{t`That owner filter is unavailable, so all companies are shown.`}</p>
        )}
        <CompanySavedViews
          workspaceId={workspaceId}
          query={query}
          activeViewId={activeViewId}
          isDefaultQuery={!isFiltered && query.sortDirection === 'asc'}
          canShareViews={role === 'manager'}
          canFilterOwner={canFilterOwner}
          onSelect={showQuery}
          onDeleted={(viewId) => {
            if (viewId === activeViewId) showQuery(query);
          }}
        />
        <CompanyListControls
          workspaceId={workspaceId}
          query={query}
          canFilterOwner={canFilterOwner}
          onChange={(nextQuery) => showQuery(nextQuery)}
        />
        <div className="fenforce-records-toolbar">
          <span>{isFiltered ? t`Filtered companies` : t`All companies`}</span>
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
                <th scope="col">{t`Industry`}</th>
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
                    <IndustryLabel industry={company.industry} />
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
          companies.results.length === 0 &&
          isFiltered && (
            <div className="fenforce-table-message" role="status">
              <strong>{t`No companies match`}</strong>
              <span>{t`Change the search or filters to see more companies.`}</span>
            </div>
          )}
        {companies.status !== 'LoadingFirstPage' &&
          companies.results.length === 0 &&
          !isFiltered && (
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

export const CompanyDetailPage = () => (
  <SalesAccessGate>
    <CompanyRecordDetail />
  </SalesAccessGate>
);

const CompanyRecordDetail = () => {
  const { t } = useLingui();
  const { workspaceId, workspaceName } = useWorkspace();
  const navigate = useNavigate();
  const router = useRouter();
  const location = useLocation();
  const { companyId } = useParams({ from: '/object/company/$companyId' });
  const updateCompany = useAccountOperation(api.workspaceCompanies.update);
  const company = useQuery(
    convexQuery(api.workspaceCompanies.get, {
      workspaceId,
      companyId: companyId as Id<'workspaceCompanies'>,
    }),
  );
  const [editingRevision, setEditingRevision] = useState<number | null>(null);
  const [trashRejectedRevision, setTrashRejectedRevision] = useState<
    number | null
  >(null);

  if (
    isDefined(company.data) &&
    trashRejectedRevision !== null &&
    company.data.revision > trashRejectedRevision
  ) {
    setTrashRejectedRevision(null);
  }

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
        {trashRejectedRevision !== null && (
          <p role="alert">{t`This company changed before your move to trash was saved. Your request was not applied.`}</p>
        )}
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

    await updateCompany.submit({
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
        {editingRevision === null && record.permissions.canUpdate && (
          <MainButton
            type="button"
            onClick={() => setEditingRevision(record.revision)}
          >
            {t`Edit company`}
          </MainButton>
        )}
      </header>
      {editingRevision === null && record.permissions.canTrash && (
        <CompanyTrashAction
          workspaceId={workspaceId}
          companyId={record._id}
          revision={record.revision}
          onComplete={() => {
            if (router.state.location !== location) return;
            void navigate({
              to: '/objects/companies/trash',
              search: { workspace: workspaceId },
            });
          }}
          onChanged={() => setTrashRejectedRevision(record.revision)}
        />
      )}
      <CompanyHistory workspaceId={workspaceId} companyId={record._id} />
      {editingRevision !== null && record.permissions.canUpdate ? (
        <section className="fenforce-editor" aria-label={t`Edit company`}>
          <h2>{t`Edit company`}</h2>
          <CompanyForm
            key={record._id}
            workspaceId={workspaceId}
            canReassignOwner={record.permissions.canReassign}
            ownerName={record.accountOwnerName}
            isReconnecting={updateCompany.isReconnecting}
            initialValues={{
              name: record.name,
              industry: record.industry,
              domainName: record.domainName.primaryLinkLabel,
              accountOwnerId: record.accountOwnerId ?? undefined,
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
              <dt>{t`Industry`}</dt>
              <dd>
                <IndustryLabel industry={record.industry} />
              </dd>
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
