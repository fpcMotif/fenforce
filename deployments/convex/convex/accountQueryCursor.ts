import type { PaginationOptions } from 'convex/server';
import { ConvexError } from 'convex/values';
import type { QueryStream } from 'convex-helpers/server/stream';
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

const encodeAccountCursor = (position: string, fingerprint: string) =>
  JSON.stringify({ fingerprint, position });

const encodeOptionalAccountCursor = (
  position: string | null | undefined,
  fingerprint: string,
) => (position ? encodeAccountCursor(position, fingerprint) : null);

const parseCursorEnvelope = (cursor: string, fingerprint: string) => {
  const parsed: unknown = JSON.parse(cursor);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('fingerprint' in parsed) ||
    !('position' in parsed)
  )
    throw new Error('Invalid cursor object');
  if (parsed.fingerprint !== fingerprint || typeof parsed.position !== 'string')
    throw new Error('Cursor context changed');
  return parsed.position;
};

const decodeAccountCursor = (
  cursor: string | null | undefined,
  fingerprint: string,
) => {
  if (cursor === undefined || cursor === null) return cursor;
  try {
    if (cursor.length > 10_000) throw new Error('Cursor too long');
    const position = parseCursorEnvelope(cursor, fingerprint);
    if (!Array.isArray(JSON.parse(position)))
      throw new Error('Invalid index position');
    return position;
  } catch {
    throw new ConvexError('INVALID_ACCOUNT_CURSOR');
  }
};

export const paginateWithAccountCursor = async <
  TItem extends NonNullable<unknown>,
>(
  query: QueryStream<TItem>,
  paginationOpts: PaginationOptions,
  fingerprint: string,
) => {
  const page = await query.paginate({
    ...paginationOpts,
    cursor: decodeAccountCursor(paginationOpts.cursor, fingerprint) ?? null,
    endCursor: decodeAccountCursor(paginationOpts.endCursor, fingerprint),
    maximumRowsRead: 100,
    maximumBytesRead: 16_000,
  });
  return {
    ...page,
    continueCursor: encodeAccountCursor(page.continueCursor, fingerprint),
    splitCursor: encodeOptionalAccountCursor(page.splitCursor, fingerprint),
  };
};
