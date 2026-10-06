import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';

import { insertUser, signedInAs } from '../testing/sessionFixtures';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const paginationOpts = { numItems: 20, cursor: null };

describe('workspace companies authorization', () => {
  it('requires authentication before creating or reading a workspace', async () => {
    const test = convexTest(schema, modules);

    await expect(
      test.mutation(api.workspaces.create, { name: 'Acme' }),
    ).rejects.toThrow('UNAUTHENTICATED');
    await expect(
      test.query(api.workspaces.listMine, { paginationOpts }),
    ).rejects.toThrow('UNAUTHENTICATED');
  });

  it('keeps workspaces and their companies isolated by membership', async () => {
    const test = convexTest(schema, modules);
    const { session: alice } = await signedInAs(test, 'Alice');
    const { session: bob } = await signedInAs(test, 'Bob');
    const aliceWorkspaceId = await alice.mutation(api.workspaces.create, {
      name: 'Alice workspace',
    });
    const bobWorkspaceId = await bob.mutation(api.workspaces.create, {
      name: 'Bob workspace',
    });
    const companyId = await alice.mutation(api.workspaceCompanies.create, {
      workspaceId: aliceWorkspaceId,
      name: 'Northstar Labs',
      domainName: 'northstar.example',
    });

    expect(
      (await bob.query(api.workspaces.listMine, { paginationOpts })).page,
    ).toMatchObject([{ workspaceId: bobWorkspaceId, name: 'Bob workspace' }]);
    await expect(
      bob.query(api.workspaceCompanies.list, {
        workspaceId: aliceWorkspaceId,
        paginationOpts,
      }),
    ).rejects.toThrow('FORBIDDEN');
    await expect(
      bob.query(api.workspaceCompanies.get, {
        workspaceId: aliceWorkspaceId,
        companyId,
      }),
    ).rejects.toThrow('FORBIDDEN');
    await expect(
      bob.mutation(api.workspaceCompanies.create, {
        workspaceId: aliceWorkspaceId,
        name: 'Intrusion',
      }),
    ).rejects.toThrow('FORBIDDEN');
    await expect(
      bob.mutation(api.workspaceCompanies.update, {
        workspaceId: aliceWorkspaceId,
        companyId,
        expectedRevision: 1,
        name: 'Intrusion',
      }),
    ).rejects.toThrow('FORBIDDEN');
    await expect(
      bob.mutation(api.workspaceCompanies.softDelete, {
        workspaceId: aliceWorkspaceId,
        companyId,
      }),
    ).rejects.toThrow('FORBIDDEN');
    await expect(
      alice.query(api.workspaceCompanies.get, {
        workspaceId: bobWorkspaceId,
        companyId,
      }),
    ).rejects.toThrow('FORBIDDEN');
  });

  it('projects owner and creator names without changing company pagination', async () => {
    const test = convexTest(schema, modules);
    const { session: alice } = await signedInAs(test, 'Alice Creator');
    const { session: outsider } = await signedInAs(test, 'Outsider');
    const bobUserId = await insertUser(test, 'Bob Owner');
    const workspaceId = await alice.mutation(api.workspaces.create, {
      name: 'Acme',
    });
    const ownerId = await test.run((context) =>
      context.db.insert('workspaceMembers', {
        workspaceId,
        userId: bobUserId,
        displayName: 'Bob Owner',
        role: 'seller',
        createdAt: Date.now(),
      }),
    );
    const companyIds = [];

    for (const name of ['Acme', 'Beacon', 'Cedar']) {
      companyIds.push(
        await alice.mutation(api.workspaceCompanies.create, {
          workspaceId,
          name,
          accountOwnerId: name === 'Acme' ? ownerId : null,
        }),
      );
    }

    const firstPage = await alice.query(api.workspaceCompanies.list, {
      workspaceId,
      paginationOpts: { numItems: 2, cursor: null },
    });
    const lastPage = await alice.query(api.workspaceCompanies.list, {
      workspaceId,
      paginationOpts: { numItems: 2, cursor: firstPage.continueCursor },
    });

    expect(firstPage.page.map((company) => company.name)).toEqual([
      'Acme',
      'Beacon',
    ]);
    expect(firstPage.isDone).toBe(false);
    expect(lastPage.page.map((company) => company.name)).toEqual(['Cedar']);
    expect(lastPage.isDone).toBe(true);
    expect(firstPage.page[0]).toMatchObject({
      accountOwnerId: ownerId,
      accountOwnerName: 'Bob Owner',
      createdByName: 'Alice Creator',
    });
    expect(firstPage.page[1]).toMatchObject({
      accountOwnerId: null,
      accountOwnerName: null,
      createdByName: 'Alice Creator',
    });
    expect(
      await alice.query(api.workspaceCompanies.get, {
        workspaceId,
        companyId: companyIds[0],
      }),
    ).toMatchObject({
      accountOwnerName: 'Bob Owner',
      createdByName: 'Alice Creator',
    });
    await expect(
      outsider.query(api.workspaceCompanies.list, {
        workspaceId,
        paginationOpts,
      }),
    ).rejects.toThrow('FORBIDDEN');
    await expect(
      outsider.query(api.workspaceCompanies.get, {
        workspaceId,
        companyId: companyIds[0],
      }),
    ).rejects.toThrow('FORBIDDEN');
  });

  it('rejects owners from another workspace and reserves deletion for admins', async () => {
    const test = convexTest(schema, modules);
    const { session: alice } = await signedInAs(test, 'Alice');
    const { session: bob, userId: bobUserId } = await signedInAs(test, 'Bob');
    const workspaceId = await alice.mutation(api.workspaces.create, {
      name: 'Acme',
    });
    const bobWorkspaceId = await bob.mutation(api.workspaces.create, {
      name: 'Other',
    });
    const bobMemberId = await test.run(async (context) => {
      const member = await context.db
        .query('workspaceMembers')
        .withIndex('by_workspaceId_and_userId', (index) =>
          index.eq('workspaceId', bobWorkspaceId).eq('userId', bobUserId),
        )
        .unique();

      if (member === null) {
        throw new Error('Missing test member');
      }

      return member._id;
    });

    await expect(
      alice.mutation(api.workspaceCompanies.create, {
        workspaceId,
        name: 'Acme',
        accountOwnerId: bobMemberId,
      }),
    ).rejects.toThrow('INVALID_ACCOUNT_OWNER');

    const companyId = await alice.mutation(api.workspaceCompanies.create, {
      workspaceId,
      name: 'Acme',
    });

    await test.run(async (context) => {
      await context.db.insert('workspaceMembers', {
        workspaceId,
        userId: bobUserId,
        displayName: 'Bob',
        role: 'member',
        createdAt: Date.now(),
      });
    });

    await expect(
      bob.mutation(api.workspaceCompanies.softDelete, {
        workspaceId,
        companyId,
      }),
    ).rejects.toThrow('FORBIDDEN');
    await bob.mutation(api.workspaceCompanies.update, {
      workspaceId,
      companyId,
      expectedRevision: 1,
      name: 'Updated by member',
    });

    expect(
      await alice.query(api.workspaceCompanies.get, { workspaceId, companyId }),
    ).toMatchObject({ name: 'Updated by member' });

    await alice.mutation(api.workspaceCompanies.softDelete, {
      workspaceId,
      companyId,
    });

    expect(
      await alice.query(api.workspaceCompanies.get, { workspaceId, companyId }),
    ).toBeNull();
    expect(
      (
        await alice.query(api.workspaceCompanies.list, {
          workspaceId,
          paginationOpts,
        })
      ).page,
    ).toEqual([]);
    expect(
      await test.run((context) => context.db.get(companyId)),
    ).toMatchObject({
      revision: 3,
    });
  });

  it('rejects a stale second writer without losing the first edit or domain', async () => {
    const test = convexTest(schema, modules);
    const { session: alice } = await signedInAs(test, 'Alice');
    const { session: bob, userId: bobUserId } = await signedInAs(test, 'Bob');
    const workspaceId = await alice.mutation(api.workspaces.create, {
      name: 'Acme',
    });
    await test.run((context) =>
      context.db.insert('workspaceMembers', {
        workspaceId,
        userId: bobUserId,
        displayName: 'Bob',
        role: 'member',
        createdAt: Date.now(),
      }),
    );
    const companyId = await alice.mutation(api.workspaceCompanies.create, {
      workspaceId,
      name: 'Original name',
      domainName: 'http://example.com:8080',
    });
    const aliceSnapshot = await alice.query(api.workspaceCompanies.get, {
      workspaceId,
      companyId,
    });
    const bobSnapshot = await bob.query(api.workspaceCompanies.get, {
      workspaceId,
      companyId,
    });

    if (aliceSnapshot === null || bobSnapshot === null) {
      throw new Error('Company missing from writer snapshot');
    }

    expect(aliceSnapshot.revision).toBe(1);
    expect(bobSnapshot.revision).toBe(1);

    await alice.mutation(api.workspaceCompanies.update, {
      workspaceId,
      companyId,
      expectedRevision: aliceSnapshot.revision,
      name: 'Alice edit',
    });

    await expect(
      bob.mutation(api.workspaceCompanies.update, {
        workspaceId,
        companyId,
        expectedRevision: bobSnapshot.revision,
        name: 'Bob stale edit',
        domainName: 'other.example',
      }),
    ).rejects.toThrow('COMPANY_CHANGED');

    expect(
      await alice.query(api.workspaceCompanies.get, { workspaceId, companyId }),
    ).toMatchObject({
      revision: 2,
      name: 'Alice edit',
      domainName: {
        primaryLinkUrl: 'https://example.com',
        primaryLinkLabel: 'example.com',
      },
    });
  });

  it('paginates past 100 workspaces and workspace members', async () => {
    const test = convexTest(schema, modules);
    const { session: alice } = await signedInAs(test, 'Alice');
    const { session: bob } = await signedInAs(test, 'Bob');
    const workspaceIds = [];

    for (let index = 0; index < 101; index += 1) {
      workspaceIds.push(
        await alice.mutation(api.workspaces.create, {
          name: `Workspace ${index}`,
        }),
      );
    }

    const firstWorkspaces = await alice.query(api.workspaces.listMine, {
      paginationOpts: { numItems: 100, cursor: null },
    });
    const lastWorkspaces = await alice.query(api.workspaces.listMine, {
      paginationOpts: {
        numItems: 100,
        cursor: firstWorkspaces.continueCursor,
      },
    });

    expect(firstWorkspaces.page).toHaveLength(100);
    expect(firstWorkspaces.isDone).toBe(false);
    expect(lastWorkspaces.page).toHaveLength(1);
    expect(lastWorkspaces.isDone).toBe(true);
    expect(
      new Set(
        [...firstWorkspaces.page, ...lastWorkspaces.page].map(
          (workspace) => workspace.workspaceId,
        ),
      ),
    ).toEqual(new Set(workspaceIds));

    const workspaceId = workspaceIds[0];
    await test.run(async (context) => {
      for (let index = 0; index < 100; index += 1) {
        const memberUserId = await context.db.insert('users', {
          name: `Member ${index}`,
        });

        await context.db.insert('workspaceMembers', {
          workspaceId,
          userId: memberUserId,
          displayName: `Member ${index}`,
          role: 'member',
          createdAt: Date.now(),
        });
      }
    });

    const firstMembers = await alice.query(api.workspaces.listMembers, {
      workspaceId,
      paginationOpts: { numItems: 100, cursor: null },
    });
    const lastMembers = await alice.query(api.workspaces.listMembers, {
      workspaceId,
      paginationOpts: { numItems: 100, cursor: firstMembers.continueCursor },
    });

    expect(firstMembers.page).toHaveLength(100);
    expect(firstMembers.isDone).toBe(false);
    expect(lastMembers.page).toHaveLength(1);
    expect(lastMembers.isDone).toBe(true);
    expect(
      new Set(
        [...firstMembers.page, ...lastMembers.page].map(
          (member) => member.memberId,
        ),
      ).size,
    ).toBe(101);
    await expect(
      bob.query(api.workspaces.listMembers, {
        workspaceId,
        paginationOpts,
      }),
    ).rejects.toThrow('FORBIDDEN');
  });
});
