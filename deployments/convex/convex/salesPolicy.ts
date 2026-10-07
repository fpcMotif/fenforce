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
    snapshot?.ownerId === account.accountOwnerId,
    'SALES_OWNER_CHANGED',
  );
  await salesRequireRequester(context, account, review);
  await salesCheckOwner(context, account);
};

export const salesCurrentBlockers = async (
  context: QueryCtx,
  project: SalesProject,
  account: Doc<'workspaceCompanies'>,
) => {
  const blockers = salesBlockers(project);
  for (const review of [project.orderReview, project.pricingReview]) {
    if (review === null) continue;
    if (!(await salesRequesterValid(context, account, review)))
      blockers.push('SALES_REQUESTER_ACCESS_CHANGED');
    const snapshot = await context.db.get(review.snapshotId);
    if (snapshot?.ownerId !== account.accountOwnerId)
      blockers.push('SALES_OWNER_CHANGED');
  }
  if (project.ownerCheckedId !== account.accountOwnerId)
    blockers.push('SALES_OWNER_CHANGED');
  return [...new Set(blockers)];
};
