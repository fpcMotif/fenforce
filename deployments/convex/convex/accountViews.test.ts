import { convexTest } from 'convex-test';
import { expect, it } from 'vitest';
import { salesActor } from '../testing/accountFixtures';
import { signedInAs } from '../testing/sessionFixtures';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const configuration = {
  columns: ['account.name' as const],
  search: 'a',
  filters: {},
  sort: { field: 'account.name' as const, direction: 'asc' as const },
};

it('paginates only shared and own private views and protects mutations with roles and revisions', async () => {
  const test = convexTest(schema, modules);
  const { session } = await signedInAs(test, 'Admin');
  const workspaceId = await session.mutation(api.workspaces.create, {
    name: 'Views',
  });
  const manager = await salesActor(test, workspaceId, 'manager', 'Manager');
  const seller = await salesActor(test, workspaceId, 'seller', 'Seller');
  const other = await salesActor(test, workspaceId, 'seller', 'Other');
  const sharedId = await manager.session.mutation(api.accountViews.save, {
    workspaceId,
    name: 'Shared',
    scope: 'workspace',
    configuration,
  });
  const privateId = await seller.session.mutation(api.accountViews.save, {
    workspaceId,
    name: 'Private',
    scope: 'private',
    configuration,
  });
  await other.session.mutation(api.accountViews.save, {
    workspaceId,
    name: 'Hidden',
    scope: 'private',
    configuration,
  });
  const first = await seller.session.query(api.accountViews.list, {
    workspaceId,
    paginationOpts: { numItems: 1, cursor: null },
  });
  const second = await seller.session.query(api.accountViews.list, {
    workspaceId,
    paginationOpts: { numItems: 1, cursor: first.continueCursor },
  });
  expect([...first.page, ...second.page].map((view) => view._id)).toEqual([
    sharedId,
    privateId,
  ]);
  await expect(
    other.session.mutation(api.accountViews.remove, {
      workspaceId,
      viewId: privateId,
      expectedRevision: 1,
    }),
  ).rejects.toThrow('VIEW_NOT_FOUND');
  await expect(
    seller.session.mutation(api.accountViews.remove, {
      workspaceId,
      viewId: sharedId,
      expectedRevision: 1,
    }),
  ).rejects.toThrow('FORBIDDEN');
  await seller.session.mutation(api.accountViews.save, {
    workspaceId,
    viewId: privateId,
    expectedRevision: 1,
    name: 'Updated',
    scope: 'private',
    configuration,
  });
  await expect(
    seller.session.mutation(api.accountViews.remove, {
      workspaceId,
      viewId: privateId,
      expectedRevision: 1,
    }),
  ).rejects.toThrow('REVISION_CONFLICT');
  await seller.session.mutation(api.accountViews.remove, {
    workspaceId,
    viewId: privateId,
    expectedRevision: 2,
  });
  await expect(
    seller.session.mutation(api.accountViews.save, {
      workspaceId,
      name: 'Invalid',
      scope: 'private',
      configuration: { ...configuration, columns: [] },
    }),
  ).rejects.toThrow('INVALID_VIEW_COLUMNS');
});

it('hides the owner filter of shared views from sellers', async () => {
  const test = convexTest(schema, modules);
  const { session } = await signedInAs(test, 'Admin');
  const workspaceId = await session.mutation(api.workspaces.create, {
    name: 'Views',
  });
  const manager = await salesActor(test, workspaceId, 'manager', 'Manager');
  const seller = await salesActor(test, workspaceId, 'seller', 'Seller');
  const other = await salesActor(test, workspaceId, 'seller', 'Other');
  await manager.session.mutation(api.accountViews.save, {
    workspaceId,
    name: 'Other pipeline',
    scope: 'workspace',
    configuration: {
      ...configuration,
      filters: { industry: 'services' as const, ownerId: other.memberId },
    },
  });
  const listAs = (actor: typeof seller) =>
    actor.session.query(api.accountViews.list, {
      workspaceId,
      paginationOpts: { numItems: 10, cursor: null },
    });

  const sellerViews = await listAs(seller);
  const managerViews = await listAs(manager);

  expect(sellerViews.page.map((view) => view.configuration.filters)).toEqual([
    { industry: 'services' },
  ]);
  expect(JSON.stringify(sellerViews.page)).not.toContain(other.memberId);
  expect(managerViews.page.map((view) => view.configuration.filters)).toEqual([
    { industry: 'services', ownerId: other.memberId },
  ]);
});
