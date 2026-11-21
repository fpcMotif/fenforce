import { useConvexPaginatedQuery } from '@convex-dev/react-query';
import { useLingui } from '@lingui/react/macro';
import { useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useState, type FormEvent } from 'react';
import { MainButton } from 'twenty-ui/components';

import { api } from '../../../../../deployments/convex/convex/_generated/api';
import type { Id } from '../../../../../deployments/convex/convex/_generated/dataModel';

type MemberAdministrationProps = { workspaceId: Id<'workspaces'> };

export const MemberAdministration = ({
  workspaceId,
}: MemberAdministrationProps) => {
  const { t } = useLingui();
  const invite = useMutation(api.employeeIdentity.invite);
  const disableMember = useMutation(api.employeeIdentity.disableMember);
  const members = useConvexPaginatedQuery(
    api.employeeIdentity.listMembers,
    { workspaceId },
    { initialNumItems: 50 },
  );
  const [subject, setSubject] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'seller' | 'manager' | 'admin'>('seller');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const inviteEmployee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setMessage('');
    setError('');
    try {
      await invite({
        workspaceId,
        subject: subject.trim(),
        displayName: displayName.trim(),
        role,
      });
      setSubject('');
      setDisplayName('');
      setMessage(
        t`Invitation created. The employee can sign in with this subject.`,
      );
    } catch (failure) {
      setError(
        failure instanceof ConvexError &&
          failure.data === 'INVITATION_ALREADY_EXISTS'
          ? t`An invitation already exists for this employee subject.`
          : t`Unable to invite this employee. Check the details and try again.`,
      );
    } finally {
      setPending(false);
    }
  };

  const revoke = async (memberId: Id<'workspaceMembers'>) => {
    setPending(true);
    setMessage('');
    setError('');
    try {
      await disableMember({ workspaceId, memberId });
      setMessage(
        t`Access revoked. Historical records retain this employee's identity.`,
      );
    } catch {
      setError(
        t`Unable to revoke access. Check your permissions and try again.`,
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fenforce-page">
      <header className="fenforce-page-header">
        <div>
          <h1>{t`Members`}</h1>
          <p>{t`Manage employee invitations and workspace access.`}</p>
        </div>
      </header>
      <section className="fenforce-editor" aria-label={t`Invite employee`}>
        <h2>{t`Invite employee`}</h2>
        <form className="fenforce-form" onSubmit={inviteEmployee}>
          <label>
            <span>{t`Employee subject`}</span>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={200}
              required
            />
          </label>
          <label>
            <span>{t`Display name`}</span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={200}
              required
            />
          </label>
          <label>
            <span>{t`Role`}</span>
            <select
              value={role}
              onChange={(event) => {
                const value = event.target.value;
                if (
                  value === 'seller' ||
                  value === 'manager' ||
                  value === 'admin'
                )
                  setRole(value);
              }}
            >
              <option value="seller">{t`Seller`}</option>
              <option value="manager">{t`Sales manager`}</option>
              <option value="admin">{t`Administrator`}</option>
            </select>
          </label>
          <MainButton
            type="submit"
            loading={pending}
          >{t`Invite employee`}</MainButton>
        </form>
      </section>
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="fenforce-form-error" role="alert">
          {error}
        </p>
      )}
      <section className="fenforce-records" aria-label={t`Workspace members`}>
        <table>
          <thead>
            <tr>
              <th scope="col">{t`Name`}</th>
              <th scope="col">{t`Role`}</th>
              <th scope="col">{t`Access`}</th>
              <th scope="col">{t`Actions`}</th>
            </tr>
          </thead>
          <tbody>
            {members.results.map((member) => (
              <tr key={member.memberId}>
                <td>{member.displayName}</td>
                <td>
                  {member.role === 'admin'
                    ? t`Administrator`
                    : member.role === 'manager'
                      ? t`Sales manager`
                      : member.role === 'seller'
                        ? t`Seller`
                        : t`Member`}
                </td>
                <td>{member.active ? t`Active` : t`Revoked`}</td>
                <td>
                  {member.active && (
                    <button
                      className="fenforce-secondary-button"
                      type="button"
                      disabled={pending}
                      aria-label={t`Revoke access for ${member.displayName}`}
                      onClick={() => void revoke(member.memberId)}
                    >{t`Revoke access`}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.status === 'LoadingFirstPage' && (
          <p role="status">{t`Loading members…`}</p>
        )}
        {members.status === 'Exhausted' && members.results.length === 0 && (
          <p>{t`No members found`}</p>
        )}
        {members.status === 'CanLoadMore' && (
          <button
            type="button"
            className="fenforce-secondary-button"
            onClick={() => members.loadMore(50)}
          >{t`Load more members`}</button>
        )}
      </section>
    </div>
  );
};
