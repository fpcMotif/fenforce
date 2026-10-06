import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { expect, it } from 'vitest';

import { m1Fixture, paginationOpts } from '../testing/contactFixtures';
import { api } from './_generated/api';

type Fixture = Awaited<ReturnType<typeof m1Fixture>>;
type Session = Fixture['seller']['session'];
type ListArgs = Omit<
  FunctionArgs<typeof api.workspaceContacts.list>,
  'paginationOpts'
>;

const traverse = async (session: Session, args: ListArgs, numItems = 1) => {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let pages = 0; pages < 500; pages++) {
    const page: FunctionReturnType<typeof api.workspaceContacts.list> =
      await session.query(api.workspaceContacts.list, {
        ...args,
        paginationOpts: { numItems, cursor },
      });
    expect(page.scannedCount).toBeLessThanOrEqual(100);
    ids.push(...page.page.map((contact) => contact._id));
    if (page.isDone) return ids;
    cursor = page.continueCursor;
  }
  throw new Error('The contact traversal did not finish');
};

const seedContacts = async (fixture: Fixture) => {
  const { workspaceId, seller, other, accountA, accountB } = fixture;
  const ids = { contactA: fixture.contactA } as Record<string, string>;
  for (const [session, accountId, lastName] of [
    [seller.session, accountA, 'adams'],
    [seller.session, accountA, 'Zimmer'],
    [other.session, accountB, 'Baker'],
    [other.session, accountB, 'Synthetic twin'],
  ] as const)
    ids[lastName] = await session.mutation(api.workspaceContacts.create, {
      operationId: `create-${lastName}`,
      workspaceId,
      accountId,
      lastName,
    });
  return ids;
};

it('M1-F01 pages of size 1 concatenate to the complete authorized list for each role', async () => {
  const fixture = await m1Fixture();
  const ids = await seedContacts(fixture);
  const { workspaceId, seller, other, manager } = fixture;
  const managerIds = await traverse(manager.session, { workspaceId });
  expect(managerIds).toEqual([
    ids.adams,
    ids.contactA,
    ids.Zimmer,
    ids.Baker,
    ids['Synthetic twin'],
  ]);
  expect(managerIds).toEqual(
    await traverse(manager.session, { workspaceId }, 25),
  );
  expect(await traverse(seller.session, { workspaceId })).toEqual([
    ids.adams,
    ids.contactA,
    ids.Zimmer,
  ]);
  expect(await traverse(other.session, { workspaceId })).toEqual([
    ids.Baker,
    ids['Synthetic twin'],
  ]);
  expect(
    await traverse(manager.session, { workspaceId, search: 'SYNTH' }),
  ).toEqual([ids.contactA, ids['Synthetic twin']]);
  expect(
    await traverse(seller.session, { workspaceId, search: 'synth' }),
  ).toEqual([ids.contactA]);
  expect(
    await traverse(manager.session, {
      workspaceId,
      accountId: fixture.accountB,
    }),
  ).toEqual([ids.Baker, ids['Synthetic twin']]);
});

it('rejects invalid search, page size, cursor reuse and inaccessible account filters', async () => {
  const fixture = await m1Fixture();
  const { workspaceId, seller, manager, accountB, accountX } = fixture;
  await expect(
    seller.session.query(api.workspaceContacts.list, {
      workspaceId,
      paginationOpts,
      search: 'x'.repeat(101),
    }),
  ).rejects.toThrow('INVALID_CONTACT_SEARCH');
  for (const numItems of [0, 101, 1.5])
    await expect(
      seller.session.query(api.workspaceContacts.list, {
        workspaceId,
        paginationOpts: { numItems, cursor: null },
      }),
    ).rejects.toThrow('INVALID_PAGE_SIZE');
  for (const accountId of [accountB, accountX])
    await expect(
      seller.session.query(api.workspaceContacts.list, {
        workspaceId,
        paginationOpts,
        accountId,
      }),
    ).rejects.toThrow('COMPANY_NOT_FOUND');
  await seedContacts(fixture);
  const first = await manager.session.query(api.workspaceContacts.list, {
    workspaceId,
    paginationOpts: { numItems: 1, cursor: null },
  });
  for (const args of [{ search: 'a' }, { accountId: accountB }])
    await expect(
      manager.session.query(api.workspaceContacts.list, {
        workspaceId,
        paginationOpts: { numItems: 1, cursor: first.continueCursor },
        ...args,
      }),
    ).rejects.toThrow('INVALID_CONTACT_CURSOR');
  await expect(
    seller.session.query(api.workspaceContacts.list, {
      workspaceId,
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
    }),
  ).rejects.toThrow('INVALID_CONTACT_CURSOR');
  await expect(
    manager.session.query(api.contactLifecycle.listTrash, {
      workspaceId,
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
    }),
  ).rejects.toThrow('INVALID_CONTACT_CURSOR');
});

it('rejects a forged seller cursor positioned in another seller account range', async () => {
  const fixture = await m1Fixture();
  const { workspaceId, seller, other, accountB } = fixture;
  await seedContacts(fixture);
  const trashedId = await other.session.mutation(api.workspaceContacts.create, {
    operationId: 'create-secret',
    workspaceId,
    accountId: accountB,
    lastName: 'SecretB',
  });
  await other.session.mutation(api.contactLifecycle.trash, {
    operationId: 'trash-secret',
    workspaceId,
    contactId: trashedId,
    expectedRevision: 1,
  });
  const forgedCursor = (trashed: boolean) =>
    JSON.stringify({
      fingerprint: JSON.stringify([
        1,
        workspaceId,
        seller.memberId,
        'seller',
        '',
        null,
        trashed,
      ]),
      position: JSON.stringify([workspaceId, other.memberId, null, '']),
    });
  for (const numItems of [1, 2]) {
    await expect(
      seller.session.query(api.workspaceContacts.list, {
        workspaceId,
        paginationOpts: { numItems, cursor: forgedCursor(false) },
      }),
    ).rejects.toThrow('INVALID_CONTACT_CURSOR');
    await expect(
      seller.session.query(api.workspaceContacts.list, {
        workspaceId,
        paginationOpts: {
          numItems,
          cursor: null,
          endCursor: forgedCursor(false),
        },
      }),
    ).rejects.toThrow('INVALID_CONTACT_CURSOR');
    await expect(
      seller.session.query(api.contactLifecycle.listTrash, {
        workspaceId,
        paginationOpts: { numItems, cursor: forgedCursor(true) },
      }),
    ).rejects.toThrow('INVALID_CONTACT_CURSOR');
  }
});

it('continues across accounts whose name order is the reverse of their id order', async () => {
  const fixture = await m1Fixture();
  const { test, workspaceId, manager, other } = fixture;
  const accountIds = await test.run(async (context) => {
    const inserted = [];
    for (let index = 0; index < 6; index++)
      inserted.push(
        await context.db.insert('workspaceCompanies', {
          workspaceId,
          revision: 1,
          name: 'pending',
          nameSortKey: 'pending',
          domainName: {
            primaryLinkUrl: '',
            primaryLinkLabel: '',
            secondaryLinks: [],
          },
          accountOwnerId: other.memberId,
          createdBy: other.memberId,
          updatedBy: other.memberId,
          createdAt: 0,
          updatedAt: 0,
          deletedAt: null,
        }),
      );
    const descendingIds = [...inserted].sort().reverse();
    for (const [position, accountId] of descendingIds.entries())
      await context.db.patch(accountId, {
        name: `aaa reversed ${position}`,
        nameSortKey: `aaa reversed ${position}`,
      });
    return descendingIds;
  });
  const expectedIds: string[] = [];
  for (const [position, accountId] of accountIds.entries())
    for (const suffix of ['first', 'second', 'third'])
      expectedIds.push(
        await manager.session.mutation(api.workspaceContacts.create, {
          operationId: `reversed-${position}-${suffix}`,
          workspaceId,
          accountId,
          lastName: `Reversed ${suffix}`,
        }),
      );
  const managerIds = await traverse(manager.session, { workspaceId }, 2);
  expect(managerIds.slice(0, expectedIds.length)).toEqual(expectedIds);
  expect(new Set(managerIds).size).toBe(managerIds.length);
});

it('returns short non-final pages for a seller with many accounts and no contacts', async () => {
  const fixture = await m1Fixture();
  const { test, workspaceId, seller, other, accountB } = fixture;
  await test.run(async (context) => {
    for (let index = 0; index < 150; index++)
      await context.db.insert('workspaceCompanies', {
        workspaceId,
        revision: 1,
        name: `aaa empty ${index}`,
        nameSortKey: `aaa empty ${String(index).padStart(3, '0')}`,
        domainName: {
          primaryLinkUrl: '',
          primaryLinkLabel: '',
          secondaryLinks: [],
        },
        accountOwnerId: other.memberId,
        createdBy: other.memberId,
        updatedBy: other.memberId,
        createdAt: 0,
        updatedAt: 0,
        deletedAt: null,
      });
  });
  await other.session.mutation(api.workspaceContacts.create, {
    operationId: 'late',
    workspaceId,
    accountId: accountB,
    lastName: 'Late',
  });
  const first = await other.session.query(api.workspaceContacts.list, {
    workspaceId,
    paginationOpts,
  });
  expect(first.page).toEqual([]);
  expect(first.isDone).toBe(false);
  expect((await traverse(other.session, { workspaceId }, 25)).length).toBe(1);
  expect(await traverse(seller.session, { workspaceId })).toEqual([
    fixture.contactA,
  ]);
});
