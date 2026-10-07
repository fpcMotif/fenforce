import { convexQuery, useConvexPaginatedQuery } from '@convex-dev/react-query';
import { useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useRouter,
  useSearch,
} from '@tanstack/react-router';
import { ConvexError } from 'convex/values';
import { useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { MainButton } from 'twenty-ui/components';
import { IconChevronLeft, IconPlus, IconTrash, IconUser } from 'twenty-ui/icon';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import type { Id } from '../../../../../deployments/convex/convex/_generated/dataModel';
import { CONTACT_FIELDS } from '../../../../../deployments/convex/convex/contactFields';
import {
  SalesAccessGate,
  formatDate,
  useWorkspace,
} from './CompaniesWorkspace';
import { CompanyPicker } from './CompanyPicker';
import { ContactForm, type ContactFormValues } from './ContactForm';
import { ContactHistory } from './ContactHistory';
import { ContactTrash, ContactTrashAction } from './ContactLifecycle';
import {
  isFilteredContactListQuery,
  readContactListQuery,
  toContactListArgs,
  toContactListSearch,
  type ContactListQuery,
} from './contactListQuery';
import { ListSearchForm } from './ListSearchForm';
import { useAccountOperation } from './useAccountOperation';

const PAGE_SIZE = 25;

export const PeoplePage = () => (
  <SalesAccessGate>
    <PeopleRecords />
  </SalesAccessGate>
);

export const PeopleTrashPage = () => {
  const { workspaceId } = useWorkspace();
  return (
    <SalesAccessGate>
      <ContactTrash workspaceId={workspaceId} />
    </SalesAccessGate>
  );
};

export const PersonDetailPage = () => (
  <SalesAccessGate>
    <PersonRecordDetail />
  </SalesAccessGate>
);

const isCompanyFilterError = (error: unknown) =>
  error instanceof ConvexError && error.data === 'COMPANY_NOT_FOUND';

const PeopleRecords = () => {
  const { t } = useLingui();
  const { workspaceId, workspaceName } = useWorkspace();
  const navigate = useNavigate();
  const router = useRouter();
  const query = readContactListQuery(useSearch({ from: '/objects/people' }));
  const createContact = useAccountOperation(api.workspaceContacts.create);
  const [isCreating, setIsCreating] = useState(false);

  const showQuery = (nextQuery: ContactListQuery) =>
    void navigate({
      to: '/objects/people',
      search: { workspace: workspaceId, ...toContactListSearch(nextQuery) },
    });

  const saveContact = async (values: ContactFormValues) => {
    const location = router.state.location;
    const contactId = await createContact.submit({ workspaceId, ...values });
    if (router.state.location !== location) return;
    setIsCreating(false);
    await navigate({
      to: '/object/person/$personId',
      params: { personId: contactId },
      search: { workspace: workspaceId },
    });
  };

  return (
    <div className="fenforce-page">
      <div className="fenforce-breadcrumb">
        {workspaceName} / {t`People`}
      </div>
      <header className="fenforce-page-header">
        <div>
          <h1>{t`People`}</h1>
          <p>{t`Find the people who work at your companies.`}</p>
        </div>
        <div className="fenforce-header-actions">
          <Link
            to="/objects/people/trash"
            search={{ workspace: workspaceId }}
            className="fenforce-secondary-button fenforce-link-button"
          >
            <IconTrash size={15} aria-hidden="true" /> {t`People trash`}
          </Link>
          <MainButton
            type="button"
            startIcon={<IconPlus size={16} />}
            onClick={() => setIsCreating(true)}
          >
            {t`New person`}
          </MainButton>
        </div>
      </header>
      {isCreating && (
        <section className="fenforce-editor" aria-label={t`New person`}>
          <h2>{t`New person`}</h2>
          <ContactForm
            workspaceId={workspaceId}
            isReconnecting={createContact.isReconnecting}
            onSave={saveContact}
            onCancel={() => setIsCreating(false)}
          />
        </section>
      )}
      <section className="fenforce-records" aria-label={t`People`}>
        <div className="fenforce-list-controls">
          <ListSearchForm
            search={query.search}
            label={t`Search people`}
            maxLength={CONTACT_FIELDS.lastName.maxLength}
            onSearch={(search) => showQuery({ ...query, search })}
          />
        </div>
        <ErrorBoundary
          key={query.accountId}
          fallbackRender={({ error }) => {
            if (query.accountId === undefined || !isCompanyFilterError(error))
              throw error;
            return (
              <div className="fenforce-table-message" role="alert">
                <strong>{t`That company is unavailable`}</strong>
                <button
                  type="button"
                  className="fenforce-secondary-button"
                  onClick={() => showQuery({ ...query, accountId: undefined })}
                >{t`Show all people`}</button>
              </div>
            );
          }}
        >
          <PeopleTable query={query} onQueryChange={showQuery} />
        </ErrorBoundary>
      </section>
    </div>
  );
};

const PeopleTable = ({
  query,
  onQueryChange,
}: {
  query: ContactListQuery;
  onQueryChange: (query: ContactListQuery) => void;
}) => {
  const { t } = useLingui();
  const { workspaceId } = useWorkspace();
  const contacts = useConvexPaginatedQuery(
    api.workspaceContacts.list,
    { workspaceId, ...toContactListArgs(query) },
    { initialNumItems: PAGE_SIZE },
  );
  const isFiltered = isFilteredContactListQuery(query);
  const isLoading = contacts.status === 'LoadingFirstPage';
  const isEmpty =
    contacts.status === 'Exhausted' && contacts.results.length === 0;
  const selectedCompanyName = contacts.results.find(
    (contact) => contact.accountId === query.accountId,
  )?.accountName;

  return (
    <>
      <div className="fenforce-list-controls">
        <div className="fenforce-list-filter">
          <CompanyPicker
            workspaceId={workspaceId}
            label={t`Filter by company`}
            emptyLabel={t`All companies`}
            value={
              query.accountId === undefined
                ? undefined
                : {
                    accountId: query.accountId,
                    accountName: selectedCompanyName,
                  }
            }
            onChange={(company) =>
              onQueryChange({ ...query, accountId: company?.accountId })
            }
          />
        </div>
      </div>
      <div className="fenforce-records-toolbar">
        <span>{isFiltered ? t`Filtered people` : t`All people`}</span>
        <span className="fenforce-muted">
          {isLoading ? t`Loading…` : t`${contacts.results.length} loaded`}
        </span>
      </div>
      <div className="fenforce-table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">{t`Last name`}</th>
              <th scope="col">{t`Email`}</th>
              <th scope="col">{t`Company`}</th>
              <th scope="col">{t`Created by`}</th>
              <th scope="col">{t`Creation date`}</th>
            </tr>
          </thead>
          <tbody>
            {contacts.results.map((contact) => (
              <tr key={contact._id}>
                <td>
                  <Link
                    to="/object/person/$personId"
                    params={{ personId: contact._id }}
                    search={{ workspace: workspaceId }}
                    className="fenforce-record-name"
                  >
                    <span className="fenforce-company-icon">
                      <IconUser size={15} />
                    </span>
                    {contact.lastName}
                  </Link>
                </td>
                <td>
                  {contact.email ?? <span className="fenforce-muted">—</span>}
                </td>
                <td>
                  <Link
                    to="/object/company/$companyId"
                    params={{ companyId: contact.accountId }}
                    search={{ workspace: workspaceId }}
                    className="fenforce-domain-link"
                  >
                    {contact.accountName}
                  </Link>
                </td>
                <td>{contact.createdByName}</td>
                <td>{formatDate(contact.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isLoading && (
        <div className="fenforce-table-message" role="status">
          {t`Loading people…`}
        </div>
      )}
      {isEmpty && isFiltered && (
        <div className="fenforce-table-message" role="status">
          <strong>{t`No people match`}</strong>
          <span>{t`Change the search or company to see more people.`}</span>
        </div>
      )}
      {isEmpty && !isFiltered && (
        <div className="fenforce-table-message">
          <IconUser size={24} />
          <strong>{t`No people yet`}</strong>
          <span>{t`Add a person to one of your companies.`}</span>
        </div>
      )}
      {contacts.status === 'CanLoadMore' && contacts.results.length === 0 && (
        <div className="fenforce-table-message" role="status">
          {t`No people loaded yet. Load more to keep searching.`}
        </div>
      )}
      {(contacts.status === 'CanLoadMore' ||
        contacts.status === 'LoadingMore') && (
        <div className="fenforce-load-more">
          <button
            type="button"
            className="fenforce-secondary-button"
            disabled={contacts.status === 'LoadingMore'}
            onClick={() => contacts.loadMore(PAGE_SIZE)}
          >
            {contacts.status === 'LoadingMore' ? t`Loading…` : t`Load more`}
          </button>
        </div>
      )}
    </>
  );
};

const PersonRecordDetail = () => {
  const { t } = useLingui();
  const { workspaceId, workspaceName } = useWorkspace();
  const navigate = useNavigate();
  const router = useRouter();
  const location = useLocation();
  const { personId } = useParams({ from: '/object/person/$personId' });
  const updateContact = useAccountOperation(api.workspaceContacts.update);
  const contact = useQuery(
    convexQuery(api.workspaceContacts.get, {
      workspaceId,
      contactId: personId as Id<'workspaceContacts'>,
    }),
  );
  const [editingRevision, setEditingRevision] = useState<number | null>(null);

  if (contact.isPending) {
    return (
      <div className="fenforce-page" role="status">{t`Loading person…`}</div>
    );
  }

  if (contact.isError) {
    return (
      <div className="fenforce-page" role="alert">
        <h1>{t`Unable to load person`}</h1>
        <p>{t`Check your connection and try again.`}</p>
      </div>
    );
  }

  if (contact.data === null) {
    return (
      <div className="fenforce-page">
        <h1>{t`Person not found`}</h1>
        <Link
          to="/objects/people"
          search={{ workspace: workspaceId }}
        >{t`Back to people`}</Link>
      </div>
    );
  }

  const record = contact.data;
  const saveContact = async (values: ContactFormValues) => {
    if (editingRevision === null) return;
    await updateContact.submit({
      workspaceId,
      contactId: record._id,
      expectedRevision: editingRevision,
      lastName: values.lastName,
      email: values.email,
      ...(values.accountId === record.accountId
        ? {}
        : { accountId: values.accountId }),
    });
    setEditingRevision(null);
  };

  return (
    <div className="fenforce-page fenforce-detail-page">
      <div className="fenforce-breadcrumb">
        {workspaceName} /{' '}
        <Link
          to="/objects/people"
          search={{ workspace: workspaceId }}
        >{t`People`}</Link>{' '}
        / {record.lastName}
      </div>
      <header className="fenforce-page-header">
        <div>
          <Link
            to="/objects/people"
            search={{ workspace: workspaceId }}
            className="fenforce-back-link"
          >
            <IconChevronLeft size={16} /> {t`People`}
          </Link>
          <h1>{record.lastName}</h1>
        </div>
        {editingRevision === null && record.permissions.canUpdate && (
          <MainButton
            type="button"
            onClick={() => setEditingRevision(record.revision)}
          >
            {t`Edit person`}
          </MainButton>
        )}
      </header>
      {editingRevision === null && record.permissions.canTrash && (
        <ContactTrashAction
          workspaceId={workspaceId}
          contactId={record._id}
          revision={record.revision}
          onComplete={() => {
            if (router.state.location !== location) return;
            void navigate({
              to: '/objects/people/trash',
              search: { workspace: workspaceId },
            });
          }}
        />
      )}
      <ContactHistory workspaceId={workspaceId} contactId={record._id} />
      {editingRevision !== null && record.permissions.canUpdate ? (
        <section className="fenforce-editor" aria-label={t`Edit person`}>
          <h2>{t`Edit person`}</h2>
          <ContactForm
            key={record._id}
            workspaceId={workspaceId}
            isReconnecting={updateContact.isReconnecting}
            initialValues={{
              lastName: record.lastName,
              email: record.email,
              company: {
                accountId: record.accountId,
                accountName: record.accountName,
              },
            }}
            onSave={saveContact}
            onCancel={() => setEditingRevision(null)}
          />
        </section>
      ) : (
        <section className="fenforce-details" aria-label={t`Person details`}>
          <h2>{t`Details`}</h2>
          <dl>
            <div>
              <dt>{t`Last name`}</dt>
              <dd>{record.lastName}</dd>
            </div>
            <div>
              <dt>{t`Email`}</dt>
              <dd>{record.email ?? '—'}</dd>
            </div>
            <div>
              <dt>{t`Company`}</dt>
              <dd>
                <Link
                  to="/object/company/$companyId"
                  params={{ companyId: record.accountId }}
                  search={{ workspace: workspaceId }}
                >
                  {record.accountName}
                </Link>
              </dd>
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
