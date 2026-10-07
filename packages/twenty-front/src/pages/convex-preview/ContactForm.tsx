import { useLingui } from '@lingui/react/macro';
import { ConvexError } from 'convex/values';
import { useState, type FormEvent } from 'react';
import { isDefined } from 'twenty-shared/utils';
import { MainButton } from 'twenty-ui/components';

import type { Id } from '../../../../../deployments/convex/convex/_generated/dataModel';
import { CONTACT_FIELDS } from '../../../../../deployments/convex/convex/contactFields';
import { CompanyPicker, type SelectedCompany } from './CompanyPicker';

export type ContactFormValues = {
  lastName: string;
  email: string;
  accountId: Id<'workspaceCompanies'>;
};

type ContactFormProps = {
  workspaceId: Id<'workspaces'>;
  initialValues?: {
    lastName: string;
    email: string | null;
    company: SelectedCompany;
  };
  fixedCompany?: SelectedCompany;
  isReconnecting?: boolean;
  onSave: (values: ContactFormValues) => Promise<void>;
  onCancel: () => void;
};

const readFailureCode = (failure: unknown) =>
  failure instanceof ConvexError && typeof failure.data === 'string'
    ? failure.data
    : undefined;

export const ContactForm = ({
  workspaceId,
  initialValues,
  fixedCompany,
  isReconnecting = false,
  onSave,
  onCancel,
}: ContactFormProps) => {
  const { t } = useLingui();
  const [lastName, setLastName] = useState(initialValues?.lastName ?? '');
  const [email, setEmail] = useState(initialValues?.email ?? '');
  const [selectedCompany, setSelectedCompany] = useState(
    initialValues?.company,
  );
  const company = fixedCompany ?? selectedCompany;
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const describeFailure = (failure: unknown) => {
    switch (readFailureCode(failure)) {
      case 'CONTACT_CHANGED':
        return t`This person changed while you were editing. Cancel and reopen it to load the latest version.`;
      case 'COMPANY_NOT_FOUND':
        return t`That company is unavailable. Choose another company.`;
      case 'INVALID_CONTACT_LAST_NAME':
        return t`Enter a last name of up to 100 characters.`;
      case 'INVALID_CONTACT_EMAIL':
        return t`Enter a valid email address, or leave it blank.`;
      default:
        return t`Unable to save this person. Check the details and try again.`;
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (company === undefined) {
      setError(t`Choose a company for this person.`);
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      await onSave({
        lastName: lastName.trim(),
        email: email.trim(),
        accountId: company.accountId,
      });
    } catch (failure) {
      setError(describeFailure(failure));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="fenforce-form" onSubmit={submit}>
      <label>
        <span>{t`Last name`}</span>
        <input
          name={CONTACT_FIELDS.lastName.name}
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          maxLength={CONTACT_FIELDS.lastName.maxLength}
          required
          autoFocus
        />
      </label>
      <label>
        <span>{t`Email`}</span>
        <input
          name={CONTACT_FIELDS.email.name}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={CONTACT_FIELDS.email.maxLength}
          inputMode="email"
          autoComplete="off"
          placeholder="name@example.com"
        />
      </label>
      {isDefined(fixedCompany) ? (
        <label>
          <span>{t`Company`}</span>
          <input value={fixedCompany.accountName ?? ''} readOnly />
        </label>
      ) : (
        <CompanyPicker
          workspaceId={workspaceId}
          label={t`Company`}
          emptyLabel={t`Choose a company`}
          value={company}
          required
          disabled={isSaving}
          onChange={setSelectedCompany}
        />
      )}
      {isSaving && isReconnecting && (
        <p role="status">{t`Reconnecting… Your change will be confirmed when the connection returns.`}</p>
      )}
      {error && (
        <p className="fenforce-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="fenforce-form-actions">
        <button
          type="button"
          className="fenforce-secondary-button"
          onClick={onCancel}
        >
          {t`Cancel`}
        </button>
        <MainButton type="submit" loading={isSaving}>
          {initialValues ? t`Save changes` : t`Create person`}
        </MainButton>
      </div>
    </form>
  );
};
