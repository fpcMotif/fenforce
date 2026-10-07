import type { Doc, Id } from './_generated/dataModel';
import type { AccountListArgs } from './accountQueryContract';

export const accountQueryFingerprint = (
  args: AccountListArgs,
  member: Doc<'workspaceMembers'>,
  search: string,
  ownerId: Id<'workspaceMembers'> | undefined,
) =>
  JSON.stringify([
    1,
    args.workspaceId,
    member._id,
    member.role,
    search,
    args.filters?.industry === undefined ? '*' : args.filters.industry,
    ownerId ?? null,
    args.sortDirection ?? 'asc',
  ]);
