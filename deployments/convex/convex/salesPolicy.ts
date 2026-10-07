import { ConvexError } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { canAccessAccount, validateAccountOwner } from './accountPolicy';
import type { SalesProject, SalesReviewState } from './salesContract';
import { salesBlockers, salesRequire } from './salesValidation';

export const salesAccessibleProject = async (
  context: QueryCtx,
  member: Doc<'workspaceMembers'>,
  projectId: Id<'salesProjects'>,
) => {
  const project = await context.db.get(projectId);
  if (project === null || project.workspaceId !== member.workspaceId)
    return null;
  const account = await context.db.get(project.accountId);
  if (
    account === null ||
    account.deletedAt !== null ||
    !canAccessAccount(member, account)
  )
    return null;
  return { project, account };
};

export const salesRequireProject = async (
  context: QueryCtx,
  member: Doc<'workspaceMembers'>,
  projectId: Id<'salesProjects'>,
) => {
  const accessible = await salesAccessibleProject(context, member, projectId);
  if (accessible === null) throw new ConvexError('SALES_PROJECT_NOT_FOUND');
  return accessible;
};

export const salesRequirePrimaryContact = async (
  context: QueryCtx,
  account: Doc<'workspaceCompanies'>,
  contactId: Id<'workspaceContacts'> | null,
) => {
  if (contactId === null) return null;
  const contact = await context.db.get(contactId);
  if (
    contact === null ||
    contact.workspaceId !== account.workspaceId ||
    contact.accountId !== account._id ||
    contact.deletedAt !== null
  )
    throw new ConvexError('CONTACT_NOT_FOUND');
  return contactId;
};

export const salesCheckOwner = async (
  context: QueryCtx,
  account: Doc<'workspaceCompanies'>,
) => {
  await validateAccountOwner(
    context,
    account.workspaceId,
    account.accountOwnerId,
  );
  if (account.accountOwnerId === null)
    throw new ConvexError('INVALID_ACCOUNT_OWNER');
  return account.accountOwnerId;
};

export const salesRequesterValid = async (
  context: QueryCtx,
  account: Doc<'workspaceCompanies'>,
  review: SalesReviewState,
) => {
  const requester = await context.db.get(review.requesterId);
  if (requester === null || requester.active === false) return false;
  return canAccessAccount(requester, account);
};

export const salesRequireRequester = async (
  context: QueryCtx,
  account: Doc<'workspaceCompanies'>,
  review: SalesReviewState,
) => {
  salesRequire(
    await salesRequesterValid(context, account, review),
    'SALES_REQUESTER_ACCESS_CHANGED',
  );
};

const salesApproversValid = async (
  context: QueryCtx,
  account: Doc<'workspaceCompanies'>,
  review: SalesReviewState,
) => {
  for (const actorId of new Set(
    review.decisions.map((decision) => decision.actorId),
  )) {
    const actor = await context.db.get(actorId);
    if (actor === null || actor.active === false || actor.role !== 'manager')
      return false;
    if (!canAccessAccount(actor, account)) return false;
  }
  return true;
};

export const salesSimulationEnabled = () =>
  process.env.FENFORCE_SALES_SIMULATION_ENABLED === 'true';

const salesSimulatedApprovalBlocked = (review: SalesReviewState) =>
  !salesSimulationEnabled() &&
  review.decisions.some((decision) => decision.simulation);

export const salesRequireApprovers = async (
  context: QueryCtx,
  account: Doc<'workspaceCompanies'>,
  review: SalesReviewState,
) => {
  salesRequire(
    !salesSimulatedApprovalBlocked(review),
    'SALES_SIMULATED_APPROVAL',
  );
  salesRequire(
    await salesApproversValid(context, account, review),
    'SALES_APPROVER_ACCESS_CHANGED',
  );
};

export const salesRequireSnapshot = async (
  context: QueryCtx,
  project: SalesProject,
  review: SalesReviewState,
  account: Doc<'workspaceCompanies'>,
) => {
  const snapshot = await context.db.get(review.snapshotId);
  salesRequire(
    snapshot !== null && snapshot.projectId === project._id,
    'SALES_REVIEW_NOT_CURRENT',
  );
  salesRequire(
    review.quoteVersion === project.quoteVersion,
    'SALES_REVIEW_NOT_CURRENT',
  );
  salesRequire(
    snapshot.ownerId === account.accountOwnerId,
    'SALES_OWNER_CHANGED',
  );
  await salesRequireRequester(context, account, review);
  await salesCheckOwner(context, account);
};

const salesReviewBlockers = async (
  context: QueryCtx,
  account: Doc<'workspaceCompanies'>,
  review: SalesReviewState,
) => {
  const snapshot = await context.db.get(review.snapshotId);
  const checks: [boolean, string][] = [
    [
      await salesRequesterValid(context, account, review),
      'SALES_REQUESTER_ACCESS_CHANGED',
    ],
    [!salesSimulatedApprovalBlocked(review), 'SALES_SIMULATED_APPROVAL'],
    [
      await salesApproversValid(context, account, review),
      'SALES_APPROVER_ACCESS_CHANGED',
    ],
    [snapshot?.ownerId === account.accountOwnerId, 'SALES_OWNER_CHANGED'],
  ];
  return checks.filter(([valid]) => !valid).map(([, code]) => code);
};

export const salesCurrentBlockers = async (
  context: QueryCtx,
  project: SalesProject,
  account: Doc<'workspaceCompanies'>,
) => {
  const blockers = salesBlockers(project);
  for (const review of [project.orderReview, project.pricingReview])
    if (review !== null)
      blockers.push(...(await salesReviewBlockers(context, account, review)));
  if (project.ownerCheckedId !== account.accountOwnerId)
    blockers.push('SALES_OWNER_CHANGED');
  return [...new Set(blockers)];
};
