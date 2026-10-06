import type { PaginationOptions } from 'convex/server';
import { ConvexError, convexToJson, type Value } from 'convex/values';
import type { QueryStream } from 'convex-helpers/server/stream';

const encodeCursor = (position: string, fingerprint: string) =>
  JSON.stringify({ fingerprint, position });

const encodeOptionalCursor = (
  position: string | null | undefined,
  fingerprint: string,
) => (position ? encodeCursor(position, fingerprint) : null);

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

const isWithinEqualityRange = (
  indexKey: unknown,
  equalityIndexFilter: Value[],
) =>
  Array.isArray(indexKey) &&
  (indexKey.length === 0 ||
    (indexKey.length >= equalityIndexFilter.length &&
      equalityIndexFilter.every(
        (value, index) =>
          JSON.stringify(indexKey[index]) ===
          JSON.stringify(convexToJson(value)),
      )));

const decodeCursor = (
  cursor: string | null | undefined,
  fingerprint: string,
  equalityIndexFilter: Value[],
  invalidCursorCode: string,
) => {
  if (cursor === undefined || cursor === null) return cursor;
  try {
    if (cursor.length > 10_000) throw new Error('Cursor too long');
    const position = parseCursorEnvelope(cursor, fingerprint);
    if (!isWithinEqualityRange(JSON.parse(position), equalityIndexFilter))
      throw new Error('Invalid index position');
    return position;
  } catch {
    throw new ConvexError(invalidCursorCode);
  }
};

export const paginateWithFingerprintCursor = async <
  TItem extends NonNullable<unknown>,
>(
  query: QueryStream<TItem>,
  paginationOpts: PaginationOptions,
  fingerprint: string,
  invalidCursorCode: string,
) => {
  const equalityIndexFilter = query.getEqualityIndexFilter();
  const page = await query.paginate({
    ...paginationOpts,
    cursor:
      decodeCursor(
        paginationOpts.cursor,
        fingerprint,
        equalityIndexFilter,
        invalidCursorCode,
      ) ?? null,
    endCursor: decodeCursor(
      paginationOpts.endCursor,
      fingerprint,
      equalityIndexFilter,
      invalidCursorCode,
    ),
    maximumRowsRead: 100,
    maximumBytesRead: 16_000,
  });
  return {
    ...page,
    continueCursor: encodeCursor(page.continueCursor, fingerprint),
    splitCursor: encodeOptionalCursor(page.splitCursor, fingerprint),
  };
};
