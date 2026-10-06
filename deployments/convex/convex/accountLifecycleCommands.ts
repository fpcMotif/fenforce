import { ConvexError } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { appendAccountAudit } from './accountAudit';
import {
  canAccessAccount,
  requireSalesMember,
  validateAccountOwner,
} from './accountPolicy';

export type LifecycleArguments = {
  workspaceId: Id<'workspaces'>;
  companyId: Id<'workspaceCompanies'>;
  expectedRevision: number;
};

export const accessibleAccount = async (
  context: MutationCtx,
  args: LifecycleArguments,
) => {
  const member = await requireSalesMember(context, args.workspaceId);
  const company = await context.db.get(args.companyId);
  if (company === null || !canAccessAccount(member, company))
    throw new ConvexError('COMPANY_NOT_FOUND');
  return { member, company };
};

export const assertAccountRevision = (
  company: Doc<'workspaceCompanies'>,
  revision: number,
) => {
  if (company.revision !== revision) throw new ConvexError('COMPANY_CHANGED');
};

const verifyRepeatedTransition = async (
  context: MutationCtx,
  company: Doc<'workspaceCompanies'>,
  memberId: Id<'workspaceMembers'>,
  expectedRevision: number,
  trashed: boolean,
) => {
  if (company.revision === expectedRevision) return;
  const latest = await context.db
    .query('accountAudit')
    .withIndex('by_companyId', (index) => index.eq('companyId', company._id))
    .order('desc')
    .first();
  if (latest === null || latest.before === null)
    throw new ConvexError('COMPANY_CHANGED');
  const sameRequest =
    latest.actorId === memberId &&
    latest.before.revision === expectedRevision &&
    latest.after.revision === company.revision;
  const sameTransition =
    (latest.before.deletedAt !== null) !== trashed &&
    (latest.after.deletedAt !== null) === trashed;
  if (!sameRequest || !sameTransition) throw new ConvexError('COMPANY_CHANGED');
};

export const transitionAccount = async (
  context: MutationCtx,
  args: LifecycleArguments,
  trashed: boolean,
) => {
  const { member, company } = await accessibleAccount(context, args);
  if ((company.deletedAt !== null) === trashed) {
    await verifyRepeatedTransition(
      context,
      company,
      member._id,
      args.expectedRevision,
      trashed,
    );
    return { revision: company.revision, changed: false };
  }
  assertAccountRevision(company, args.expectedRevision);
  if (!trashed)
    await validateAccountOwner(
      context,
      args.workspaceId,
      company.accountOwnerId,
    );
  const now = Date.now();
  await context.db.patch(company._id, {
    deletedAt: trashed ? now : null,
    revision: company.revision + 1,
    updatedAt: now,
    updatedBy: member._id,
  });
  await appendAccountAudit(context, company._id, company);
  return { revision: company.revision + 1, changed: true };
};
