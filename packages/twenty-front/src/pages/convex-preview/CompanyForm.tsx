import { useLingui } from '@lingui/react/macro';
import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { ConvexError } from 'convex/values';
import { useState, type FormEvent } from 'react';
import { MainButton } from 'twenty-ui/components';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import type { Id } from '../../../../../deployments/convex/convex/_generated/dataModel';
import { ACCOUNT_FIELDS } from '../../../../../deployments/convex/convex/accountFields';

type AccountIndustry = (typeof ACCOUNT_FIELDS.industry.options)[number];

export type CompanyFormValues = {
  name: string;
  industry: AccountIndustry | null;
  domainName?: string;
  accountOwnerId?: Id<'workspaceMembers'>;
};

type CompanyFormProps = {
  workspaceId: Id<'workspaces'>;
  initialValues?: CompanyFormValues;
  onSave: (values: CompanyFormValues) => Promise<void>;
  onCancel: () => void;
};

export const CompanyForm = ({
  workspaceId,
  initialValues,
  onSave,
  onCancel,
}: CompanyFormProps) => {
  const { t } = useLingui();
  const [name, setName] = useState(initialValues?.name ?? '');
  const [domainName, setDomainName] = useState(initialValues?.domainName ?? '');
  const [industry, setIndustry] = useState<AccountIndustry | ''>(
    initialValues?.industry ?? '',
  );
  const [accountOwnerId, setAccountOwnerId] = useState<
    Id<'workspaceMembers'> | undefined
  >(initialValues?.accountOwnerId);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const members = useConvexPaginatedQuery(
    api.workspaceCompanies.listEligibleOwners,
    { workspaceId },
    { initialNumItems: 50 },
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError('');

    try {
      await onSave({
        name: name.trim(),
        industry: industry || null,
        ...(domainName === initialValues?.domainName
          ? {}
          : { domainName: domainName.trim() }),
        ...(accountOwnerId === undefined ||
        accountOwnerId === initialValues?.accountOwnerId
          ? {}
          : { accountOwnerId }),
      });
    } catch (failure) {
      setError(
        failure instanceof ConvexError && failure.data === 'COMPANY_CHANGED'
          ? t`This company changed while you were editing. Cancel and reopen it to load the latest version.`
          : t`Unable to save this company. Check the details and try again.`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="fenforce-form fenforce-company-form" onSubmit={submit}>
      <label>
        <span>{t`Name`}</span>
        <input
          name={ACCOUNT_FIELDS.name.name}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={ACCOUNT_FIELDS.name.maxLength}
          required
          autoFocus
        />
      </label>
      <label>
        <span>{t`Industry`}</span>
        <select
          name={ACCOUNT_FIELDS.industry.name}
          value={industry}
          onChange={(event) => {
            const value = event.target.value;
            setIndustry(
              ACCOUNT_FIELDS.industry.options.find(
                (option) => option === value,
              ) ?? '',
            );
          }}
        >
          <option value="">{t`No industry`}</option>
          {ACCOUNT_FIELDS.industry.options.map((option) => (
            <option key={option} value={option}>
              {option === 'services' ? t`Services` : t`Manufacturing`}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{t`Domain Name`}</span>
        <input
          name="domainName"
          value={domainName}
          onChange={(event) => setDomainName(event.target.value)}
          placeholder="example.com"
        />
      </label>
      <label>
        <span>{t`Account Owner`}</span>
        <select
          name={ACCOUNT_FIELDS.owner.name}
          value={accountOwnerId ?? ''}
          onChange={(event) =>
            setAccountOwnerId(
              event.target.value === ''
                ? undefined
                : (event.target.value as Id<'workspaceMembers'>),
            )
          }
          disabled={members.status === 'LoadingFirstPage'}
        >
          <option value="">
            {initialValues ? t`Keep current owner` : t`You (default owner)`}
          </option>
          {initialValues?.accountOwnerId !== undefined &&
            !members.results.some(
              (member) => member.memberId === initialValues.accountOwnerId,
            ) && (
              <option
                value={initialValues.accountOwnerId}
              >{t`Current owner`}</option>
            )}
          {members.results.map((member) => (
            <option key={member.memberId} value={member.memberId}>
              {member.displayName}
            </option>
          ))}
        </select>
      </label>
      {members.status === 'CanLoadMore' && (
        <button
          type="button"
          className="fenforce-text-button fenforce-left-link"
          onClick={() => members.loadMore(50)}
        >
          {t`Load more members`}
        </button>
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
          {initialValues ? t`Save changes` : t`Create company`}
        </MainButton>
      </div>
    </form>
  );
};
