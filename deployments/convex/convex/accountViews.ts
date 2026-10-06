import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { mergedStream, stream } from 'convex-helpers/server/stream';

import { mutation, query, type MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireSalesMember } from './accountPolicy';
import { resolveAccountOwnerFilter } from './accountQueries';
import { validateAccountPageSize } from './accountQueryContract';
import {
  decodeAccountCursor,
  encodeAccountCursor,
  encodeOptionalAccountCursor,
} from './accountQueryCursor';
import {
  accountViewConfigurationValidator,
  accountViewScopeValidator,
  validateAccountView,
} from './accountViewContract';
import schema from './schema';

export const list = query({
  args: {
    workspaceId: v.id('workspaces'),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    validateAccountPageSize(args.paginationOpts.numItems);
    const fingerprint = JSON.stringify([
      'accountViews',
      args.workspaceId,
      member._id,
      member.role,
    ]);
    const views = stream(context.db, schema).query('accountViews');
    const page = await mergedStream(
      [
        views.withIndex('by_workspaceId_and_scope', (index) =>
          index.eq('workspaceId', args.workspaceId).eq('scope', 'workspace'),
        ),
        views.withIndex(
          'by_workspaceId_and_scope_and_createdByMemberId',
          (index) =>
            index
              .eq('workspaceId', args.workspaceId)
              .eq('scope', 'private')
              .eq('createdByMemberId', member._id),
        ),
      ],
      ['_creationTime', '_id'],
    ).paginate({
      ...args.paginationOpts,
      cursor:
        decodeAccountCursor(args.paginationOpts.cursor, fingerprint) ?? null,
      endCursor: decodeAccountCursor(
        args.paginationOpts.endCursor,
        fingerprint,
      ),
      maximumRowsRead: 100,
      maximumBytesRead: 16_000,
    });
    return {
      ...page,
      continueCursor: encodeAccountCursor(page.continueCursor, fingerprint),
      splitCursor: encodeOptionalAccountCursor(page.splitCursor, fingerprint),
    };
  },
});

const writableView = async (
  context: MutationCtx,
  member: Doc<'workspaceMembers'>,
  viewId: Id<'accountViews'>,
  expectedRevision: number | undefined,
) => {
  const view = await context.db.get(viewId);
  if (
    !view ||
    view.workspaceId !== member.workspaceId ||
    (view.scope === 'private' && view.createdByMemberId !== member._id)
  )
    throw new ConvexError('VIEW_NOT_FOUND');
  if (view.scope === 'workspace' && member.role !== 'manager')
    throw new ConvexError('FORBIDDEN');
  if (expectedRevision !== view.revision)
    throw new ConvexError('REVISION_CONFLICT');
  return view;
};

export const save = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    viewId: v.optional(v.id('accountViews')),
    expectedRevision: v.optional(v.number()),
    name: v.string(),
    scope: accountViewScopeValidator,
    configuration: accountViewConfigurationValidator,
  },
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    const name = validateAccountView(args.name, args.configuration);
    if (args.scope === 'workspace' && member.role !== 'manager')
      throw new ConvexError('FORBIDDEN');
    await resolveAccountOwnerFilter(
      context,
      member,
      args.configuration.filters.ownerId,
    );
    if (args.viewId) {
      const view = await writableView(
        context,
        member,
        args.viewId,
        args.expectedRevision,
      );
      if (view.scope !== args.scope && view.createdByMemberId !== member._id)
        throw new ConvexError('FORBIDDEN');
      await context.db.patch(view._id, {
        name,
        scope: args.scope,
        configuration: args.configuration,
        revision: view.revision + 1,
        updatedAt: Date.now(),
      });
      return view._id;
    }
    if (args.expectedRevision !== undefined)
      throw new ConvexError('INVALID_VIEW_REVISION');
    return context.db.insert('accountViews', {
      workspaceId: args.workspaceId,
      createdByMemberId: member._id,
      name,
      scope: args.scope,
      configuration: args.configuration,
      revision: 1,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: {
    workspaceId: v.id('workspaces'),
    viewId: v.id('accountViews'),
    expectedRevision: v.number(),
  },
  handler: async (context, args) => {
    const member = await requireSalesMember(context, args.workspaceId);
    const view = await writableView(
      context,
      member,
      args.viewId,
      args.expectedRevision,
    );
    await context.db.delete(view._id);
    return null;
  },
});
