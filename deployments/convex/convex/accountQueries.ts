import { stream } from 'convex-helpers/server/stream';
import { ConvexError } from 'convex/values';

import type { QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireSalesMember } from './accountPolicy';
import {
  normalizeAccountSearch,
  validateAccountPageSize,
  type AccountListArgs,
} from './accountQueryContract';
import schema from './schema';
import { accountQueryFingerprint } from './accountQueryCursor';
import { paginateWithFingerprintCursor } from './fingerprintCursor';

export const listAccountDocuments = async (
  context: QueryCtx,
  args: AccountListArgs,
) => {
  const member = await requireSalesMember(context, args.workspaceId);
  const search = normalizeAccountSearch(args.search);
  const ownerId = await resolveAccountOwnerFilter(
    context,
    member,
    args.filters?.ownerId,
  );
  const fingerprint = accountQueryFingerprint(args, member, search, ownerId);
  await assertAccountQueryIndexReady(context, args.workspaceId, ownerId);
  validateAccountPageSize(args.paginationOpts.numItems);
  const accessible = authorizedAccountStream(
    context,
    args.workspaceId,
    ownerId,
  );
  let scannedCount = 0;
  const companiesPage = await paginateWithFingerprintCursor(
    accessible
      .order(args.sortDirection ?? 'asc')
      .filterWith(async (company) => {
        scannedCount++;
        return (
          company.name.toLowerCase().includes(search) &&
          (args.filters?.industry === undefined ||
            (company.industry ?? null) === args.filters.industry)
        );
      }),
    args.paginationOpts,
    fingerprint,
    'INVALID_ACCOUNT_CURSOR',
  );
  return { member, companiesPage: { ...companiesPage, scannedCount } };
};

export const authorizedAccountStream = (
  context: QueryCtx,
  workspaceId: Id<'workspaces'>,
  ownerId: Id<'workspaceMembers'> | undefined,
) => {
  const companies = stream(context.db, schema).query('workspaceCompanies');
  return ownerId === undefined
    ? companies.withIndex(
        'by_workspaceId_and_deletedAt_and_nameSortKey',
        (index) => index.eq('workspaceId', workspaceId).eq('deletedAt', null),
      )
    : companies.withIndex(
        'by_workspaceId_and_accountOwnerId_and_deletedAt_and_nameSortKey',
        (index) =>
          index
            .eq('workspaceId', workspaceId)
            .eq('accountOwnerId', ownerId)
            .eq('deletedAt', null),
      );
};

export const assertAccountQueryIndexReady = async (
  context: QueryCtx,
  workspaceId: Id<'workspaces'>,
  ownerId: Id<'workspaceMembers'> | undefined,
) => {
  const firstAccount = await authorizedAccountStream(
    context,
    workspaceId,
    ownerId,
  ).first();
  if (firstAccount !== null && firstAccount.nameSortKey === undefined)
    throw new ConvexError('ACCOUNT_QUERY_INDEX_NOT_READY');
};

export const resolveAccountOwnerFilter = async (
  context: QueryCtx,
  member: Doc<'workspaceMembers'>,
  ownerId: Id<'workspaceMembers'> | undefined,
) => {
  if (member.role === 'seller') {
    if (ownerId !== undefined && ownerId !== member._id)
      throw new ConvexError('FORBIDDEN');
    return member._id;
  }
  if (ownerId !== undefined) {
    const owner = await context.db.get(ownerId);
    if (!owner || owner.workspaceId !== member.workspaceId)
      throw new ConvexError('FORBIDDEN');
  }
  return ownerId;
};
