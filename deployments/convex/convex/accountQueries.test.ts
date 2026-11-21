import { convexTest } from 'convex-test';
import type { FunctionReturnType } from 'convex/server';
import { expect, it } from 'vitest';

import { salesActor } from '../testing/accountFixtures';
import { signedInAs } from '../testing/sessionFixtures';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const paginationOpts = { numItems: 25, cursor: null };

const createFixture = async () => {
  const test = convexTest(schema, modules);
  const { session: admin } = await signedInAs(test, 'Administrator');
  const workspaceId = await admin.mutation(api.workspaces.create, {
    name: 'Account query fixture',
  });
  const manager = await salesActor(test, workspaceId, 'manager', 'Manager');
  const seller = await salesActor(test, workspaceId, 'seller', 'Seller');
  return { test, admin, workspaceId, manager, seller };
};

it('finds a case-insensitive literal substring within an authorized account name', async () => {
  const { manager, workspaceId } = await createFixture();
  const companyId = await manager.session.mutation(
    api.workspaceCompanies.create,
    { workspaceId, name: 'Northstar Labs' },
  );
  await manager.session.mutation(api.workspaceCompanies.create, {
    workspaceId,
    name: 'North port',
  });
  const result = await manager.session.query(api.workspaceCompanies.list, {
    workspaceId,
    paginationOpts,
    search: 'hStAr L',
  });
  expect(result.page.map((company) => company._id)).toEqual([companyId]);
});

it('combines exact owner and nullable industry filters without expanding seller access', async () => {
  const { manager, seller, workspaceId } = await createFixture();
  await manager.session.mutation(api.workspaceCompanies.create, {
    workspaceId,
    name: 'Manager account',
  });
  await seller.session.mutation(api.workspaceCompanies.create, {
    workspaceId,
    name: 'Seller services',
    industry: 'services',
  });
  const expectedId = await seller.session.mutation(
    api.workspaceCompanies.create,
    { workspaceId, name: 'Seller without industry' },
  );
  const result = await manager.session.query(api.workspaceCompanies.list, {
    workspaceId,
    paginationOpts,
    filters: { ownerId: seller.memberId, industry: null },
  });
  expect(result.page.map((company) => company._id)).toEqual([expectedId]);
  await expect(
    seller.session.query(api.workspaceCompanies.list, {
      workspaceId,
      paginationOpts,
      filters: { ownerId: manager.memberId },
    }),
  ).rejects.toThrow('FORBIDDEN');
});

it('blocks incomplete legacy sorting until the bounded backfill makes every account searchable', async () => {
  const { test, manager, workspaceId } = await createFixture();
  await test.run((context) =>
    context.db.insert('workspaceCompanies', {
      workspaceId,
      name: 'Legacy record',
      revision: 1,
      domainName: {
        primaryLinkUrl: '',
        primaryLinkLabel: '',
        secondaryLinks: [],
      },
      accountOwnerId: manager.memberId,
      createdBy: manager.memberId,
      updatedBy: manager.memberId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
    }),
  );
  await expect(
    manager.session.query(api.workspaceCompanies.list, {
      workspaceId,
      paginationOpts,
    }),
  ).rejects.toThrow('ACCOUNT_QUERY_INDEX_NOT_READY');
  await test.mutation(internal.accountQueryMigration.backfillNames, {});
  expect(
    (
      await manager.session.query(api.workspaceCompanies.list, {
        workspaceId,
        paginationOpts,
        search: 'legacy',
      })
    ).page.map((row) => row.name),
  ).toEqual(['Legacy record']);
});

it('rejects a continuation cursor reused with a different search or sort', async () => {
  const { manager, workspaceId } = await createFixture();
  for (const name of ['alpha', 'bravo'])
    await manager.session.mutation(api.workspaceCompanies.create, {
      workspaceId,
      name,
    });
  const first = await manager.session.query(api.workspaceCompanies.list, {
    workspaceId,
    paginationOpts: { numItems: 1, cursor: null },
    search: 'a',
  });
  await expect(
    manager.session.query(api.workspaceCompanies.list, {
      workspaceId,
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
      search: 'z',
    }),
  ).rejects.toThrow('INVALID_ACCOUNT_CURSOR');
  await expect(
    manager.session.query(api.workspaceCompanies.list, {
      workspaceId,
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
      search: 'a',
      sortDirection: 'desc',
    }),
  ).rejects.toThrow('INVALID_ACCOUNT_CURSOR');
});

it('keeps duplicate normalized names stable across pages and treats Unicode and punctuation literally', async () => {
  const { manager, workspaceId } = await createFixture();
  const names = ['Alpha', 'alpha', 'ALPHA', 'A.b 🦊 é', 'Axb fox é'];
  for (const name of names)
    await manager.session.mutation(api.workspaceCompanies.create, {
      workspaceId,
      name,
    });
  const whole = await manager.session.query(api.workspaceCompanies.list, {
    workspaceId,
    paginationOpts,
  });
  const identifiers: string[] = [];
  let cursor: string | null = null;
  for (let index = 0; index < names.length; index++) {
    const page: FunctionReturnType<typeof api.workspaceCompanies.list> =
      await manager.session.query(api.workspaceCompanies.list, {
        workspaceId,
        paginationOpts: { numItems: 1, cursor },
      });
    identifiers.push(...page.page.map((company) => company._id));
    cursor = page.continueCursor;
  }
  expect(identifiers).toEqual(whole.page.map((company) => company._id));
  expect(new Set(identifiers).size).toBe(names.length);
  const literal = await manager.session.query(api.workspaceCompanies.list, {
    workspaceId,
    paginationOpts,
    search: '.b 🦊 é',
  });
  expect(literal.page.map((company) => company.name)).toEqual(['A.b 🦊 é']);
  const descending = await manager.session.query(api.workspaceCompanies.list, {
    workspaceId,
    paginationOpts,
    sortDirection: 'desc',
  });
  expect(descending.page.map((company) => company._id)).toEqual(
    [...identifiers].reverse(),
  );
});

it('rejects seller replay of manager cursors and rechecks disabled membership on continuation', async () => {
  const { test, manager, seller, workspaceId } = await createFixture();
  await manager.session.mutation(api.workspaceCompanies.create, {
    workspaceId,
    name: 'Manager private',
  });
  const first = await manager.session.query(api.workspaceCompanies.list, {
    workspaceId,
    paginationOpts: { numItems: 1, cursor: null },
  });
  await expect(
    seller.session.query(api.workspaceCompanies.list, {
      workspaceId,
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
    }),
  ).rejects.toThrow('INVALID_ACCOUNT_CURSOR');
  await test.run((context) =>
    context.db.patch(manager.memberId, { active: false }),
  );
  await expect(
    manager.session.query(api.workspaceCompanies.list, {
      workspaceId,
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
    }),
  ).rejects.toThrow();
});
