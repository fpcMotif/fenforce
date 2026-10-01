import { useLingui } from '@lingui/react/macro';
import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { useState, type FormEvent } from 'react';
import { MainButton } from 'twenty-ui/components';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import type { Id } from '../../../../../deployments/convex/convex/_generated/dataModel';

export type CompanyFormValues = {
  name: string;
  domainName: string;
  accountOwnerId: Id<'workspaceMembers'> | null;
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
  const [accountOwnerId, setAccountOwnerId] =
    useState<Id<'workspaceMembers'> | null>(
      initialValues?.accountOwnerId ?? null,
    );
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);
  const members = useConvexPaginatedQuery(
    api.workspaces.listMembers,
    { workspaceId },
    { initialNumItems: 50 },
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setHasError(false);

    try {
      await onSave({
        name: name.trim(),
        domainName: domainName.trim(),
        accountOwnerId,
      });
    } catch {
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="fenforce-form fenforce-company-form" onSubmit={submit}>
      <label>
        <span>{t`Name`}</span>
        <input
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={255}
          required
          autoFocus
        />
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
          name="accountOwnerId"
          value={accountOwnerId ?? ''}
          onChange={(event) =>
            setAccountOwnerId(
              event.target.value === ''
                ? null
                : (event.target.value as Id<'workspaceMembers'>),
            )
          }
          disabled={members.status === 'LoadingFirstPage'}
        >
          <option value="">{t`No owner`}</option>
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
      {hasError && (
        <p className="fenforce-form-error" role="alert">
          {t`Unable to save this company. Check the details and try again.`}
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
