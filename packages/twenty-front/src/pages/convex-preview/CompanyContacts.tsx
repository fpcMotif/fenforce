import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { IconPlus, IconUser } from 'twenty-ui/icon';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import type { Id } from '../../../../../deployments/convex/convex/_generated/dataModel';
import { ContactForm, type ContactFormValues } from './ContactForm';
import { useAccountOperation } from './useAccountOperation';

type CompanyContactsProps = {
  workspaceId: Id<'workspaces'>;
  companyId: Id<'workspaceCompanies'>;
  companyName: string;
};

const PAGE_SIZE = 10;

export const CompanyContacts = ({
  workspaceId,
  companyId,
  companyName,
}: CompanyContactsProps) => {
  const { t } = useLingui();
  const createContact = useAccountOperation(api.workspaceContacts.create);
  const contacts = useConvexPaginatedQuery(
    api.workspaceContacts.list,
    { workspaceId, accountId: companyId },
    { initialNumItems: PAGE_SIZE },
  );
  const [isAdding, setIsAdding] = useState(false);
  const [addedName, setAddedName] = useState<string>();

  const saveContact = async (values: ContactFormValues) => {
    await createContact.submit({ workspaceId, ...values });
    setIsAdding(false);
    setAddedName(values.lastName);
  };

  return (
    <section
      className="fenforce-details fenforce-related"
      aria-label={t`People`}
    >
      <div className="fenforce-section-header">
        <h2>{t`People`}</h2>
        {!isAdding && (
          <button
            type="button"
            className="fenforce-secondary-button"
            onClick={() => {
              setAddedName(undefined);
              setIsAdding(true);
            }}
          >
            <IconPlus size={14} aria-hidden="true" /> {t`Add person`}
          </button>
        )}
      </div>
      {isAdding && (
        <section className="fenforce-editor" aria-label={t`New person`}>
          <h3>{t`New person`}</h3>
          <ContactForm
            workspaceId={workspaceId}
            initialCompany={{ accountId: companyId, accountName: companyName }}
            isReconnecting={createContact.isReconnecting}
            onSave={saveContact}
            onCancel={() => setIsAdding(false)}
          />
        </section>
      )}
      {addedName !== undefined && (
        <p role="status">{t`${addedName} was added.`}</p>
      )}
      {contacts.status === 'LoadingFirstPage' && (
        <p role="status">{t`Loading people…`}</p>
      )}
      {contacts.status === 'Exhausted' && contacts.results.length === 0 && (
        <p className="fenforce-muted">{t`No people linked to this company yet.`}</p>
      )}
      {contacts.results.length > 0 && (
        <ul className="fenforce-contact-list">
          {contacts.results.map((contact) => (
            <li key={contact._id}>
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
              <span className="fenforce-muted">{contact.email ?? '—'}</span>
            </li>
          ))}
        </ul>
      )}
      {(contacts.status === 'CanLoadMore' ||
        contacts.status === 'LoadingMore') && (
        <button
          type="button"
          className="fenforce-text-button fenforce-left-link"
          disabled={contacts.status === 'LoadingMore'}
          onClick={() => contacts.loadMore(PAGE_SIZE)}
        >
          {t`Load more people`}
        </button>
      )}
    </section>
  );
};
