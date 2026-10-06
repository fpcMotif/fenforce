import { convexTest } from 'convex-test';
import type { FunctionReturnType } from 'convex/server';
import { afterEach, expect, it, vi } from 'vitest';
import { signedInAs } from '../testing/sessionFixtures';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
afterEach(() => vi.unstubAllEnvs());

it('bounds sparse searches over 1000 audited accounts and limits seller results before scanning', async () => {
  vi.stubEnv('FENFORCE_MOCK_IDENTITY_ENABLED', 'true');
  vi.stubEnv('FENFORCE_OIDC_ISSUER', 'http://localhost:4011');
  vi.stubEnv('FENFORCE_OIDC_TENANT', 'tenant-demo');
  const test = convexTest(schema, modules);
  const manager = await signedInAs(test, 'Manager');
  const seller = await signedInAs(test, 'Seller');
  await test.run(async (context) => {
    await context.db.insert('employeeIdentities', {
      issuer: 'http://localhost:4011',
      tenant: 'tenant-demo',
      subject: 'manager-a',
      userId: manager.userId,
    });
    await context.db.insert('employeeIdentities', {
      issuer: 'http://localhost:4011',
      tenant: 'tenant-demo',
      subject: 'seller-a',
      userId: seller.userId,
    });
  });
  const { workspaceId } = await test.mutation(
    internal.mockAccountBenchmark.prepare,
    {},
  );
  for (let start = 0; start < 1000; start += 100)
    expect(
      (
        await test.mutation(internal.mockAccountBenchmark.seedBatch, {
          workspaceId,
          start,
          count: 100,
        })
      ).inserted,
    ).toBe(100);
  expect(
    (
      await test.mutation(internal.mockAccountBenchmark.seedBatch, {
        workspaceId,
        start: 0,
        count: 100,
      })
    ).inserted,
  ).toBe(0);
  let cursor: string | null = null;
  let complete = false;
  let pages = 0;
  const names: string[] = [];
  while (!complete && pages < 100) {
    const page: FunctionReturnType<typeof api.workspaceCompanies.list> =
      await manager.session.query(api.workspaceCompanies.list, {
        workspaceId,
        paginationOpts: { numItems: 25, cursor },
        search: 'needle',
      });
    expect(page.scannedCount).toBeLessThanOrEqual(100);
    expect(
      new TextEncoder().encode(JSON.stringify(page)).byteLength,
    ).toBeLessThan(100_000);
    if (pages === 0) {
      expect(page.page).toHaveLength(0);
      expect(page.isDone).toBe(false);
    }
    names.push(...page.page.map((company) => company.name));
    cursor = page.continueCursor;
    complete = page.isDone;
    pages++;
  }
  expect(complete).toBe(true);
  expect(names).toEqual(['Benchmark 0999 needle']);
  const sellerPage = await seller.session.query(api.workspaceCompanies.list, {
    workspaceId,
    paginationOpts: { numItems: 100, cursor: null },
  });
  expect(sellerPage.page.length).toBeGreaterThan(0);
  expect(
    sellerPage.page.every(
      (company) => Number(company.name.slice(10, 14)) % 2 === 1,
    ),
  ).toBe(true);
  expect(sellerPage.scannedCount).toBeLessThanOrEqual(100);
  const audits = await test.run((context) =>
    context.db.query('accountAudit').collect(),
  );
  expect(audits).toHaveLength(1000);
});

it('keeps only the newest benchmark workspace in the synthetic employees memberships', async () => {
  vi.stubEnv('FENFORCE_MOCK_IDENTITY_ENABLED', 'true');
  vi.stubEnv('FENFORCE_OIDC_ISSUER', 'http://localhost:4011');
  vi.stubEnv('FENFORCE_OIDC_TENANT', 'tenant-demo');
  const test = convexTest(schema, modules);
  const manager = await signedInAs(test, 'Manager');
  const seller = await signedInAs(test, 'Seller');
  await test.run(async (context) => {
    for (const [subject, userId] of [
      ['manager-a', manager.userId],
      ['seller-a', seller.userId],
    ] as const)
      await context.db.insert('employeeIdentities', {
        issuer: 'http://localhost:4011',
        tenant: 'tenant-demo',
        subject,
        userId,
      });
    for (let index = 0; index < 3; index++) {
      const workspaceId = await context.db.insert('workspaces', {
        name: 'account-query-benchmark',
        createdByUserId: manager.userId,
        createdAt: Date.now(),
      });
      for (const [userId, role] of [
        [manager.userId, 'manager'],
        [seller.userId, 'seller'],
      ] as const)
        await context.db.insert('workspaceMembers', {
          workspaceId,
          userId,
          displayName: role,
          role,
          active: true,
          createdAt: Date.now(),
        });
    }
  });

  await test.mutation(internal.mockAccountBenchmark.prepare, {});
  const { workspaceId } = await test.mutation(
    internal.mockAccountBenchmark.prepare,
    {},
  );

  const paginationOpts = { numItems: 50, cursor: null };
  for (const employee of [manager, seller])
    expect(
      (
        await employee.session.query(api.workspaces.listMine, {
          paginationOpts,
        })
      ).page.map((workspace) => workspace.workspaceId),
    ).toEqual([workspaceId]);
});

it('bounds a sparse contact search over 3000 contacts on 1000 accounts and limits seller rows', async () => {
  vi.stubEnv('FENFORCE_MOCK_IDENTITY_ENABLED', 'true');
  vi.stubEnv('FENFORCE_OIDC_ISSUER', 'http://localhost:4011');
  vi.stubEnv('FENFORCE_OIDC_TENANT', 'tenant-demo');
  const test = convexTest(schema, modules);
  const manager = await signedInAs(test, 'Manager');
  const seller = await signedInAs(test, 'Seller');
  await test.run(async (context) => {
    for (const [subject, userId] of [
      ['manager-a', manager.userId],
      ['seller-a', seller.userId],
    ] as const)
      await context.db.insert('employeeIdentities', {
        issuer: 'http://localhost:4011',
        tenant: 'tenant-demo',
        subject,
        userId,
      });
  });
  const { workspaceId } = await test.mutation(
    internal.mockAccountBenchmark.prepare,
    {},
  );
  await expect(
    test.mutation(internal.mockAccountBenchmark.seedContactBatch, {
      workspaceId,
      start: 0,
      count: 3,
    }),
  ).rejects.toThrow('BENCHMARK_ACCOUNT_MISSING');
  for (let start = 0; start < 1000; start += 100)
    await test.mutation(internal.mockAccountBenchmark.seedBatch, {
      workspaceId,
      start,
      count: 100,
    });
  for (let start = 0; start < 3000; start += 100)
    expect(
      (
        await test.mutation(internal.mockAccountBenchmark.seedContactBatch, {
          workspaceId,
          start,
          count: 100,
        })
      ).inserted,
    ).toBe(100);
  expect(
    (
      await test.mutation(internal.mockAccountBenchmark.seedContactBatch, {
        workspaceId,
        start: 2900,
        count: 100,
      })
    ).inserted,
  ).toBe(0);
  await expect(
    test.mutation(internal.mockAccountBenchmark.seedContactBatch, {
      workspaceId,
      start: 2950,
      count: 100,
    }),
  ).rejects.toThrow('INVALID_BENCHMARK_BATCH');

  let cursor: string | null = null;
  let complete = false;
  let pages = 0;
  const lastNames: string[] = [];
  while (!complete && pages < 200) {
    const page: FunctionReturnType<typeof api.workspaceContacts.list> =
      await manager.session.query(api.workspaceContacts.list, {
        workspaceId,
        paginationOpts: { numItems: 25, cursor },
        search: 'needle',
      });
    expect(page.scannedCount).toBeLessThanOrEqual(100);
    expect(
      new TextEncoder().encode(JSON.stringify(page)).byteLength,
    ).toBeLessThan(100_000);
    lastNames.push(...page.page.map((contact) => contact.lastName));
    cursor = page.continueCursor;
    complete = page.isDone;
    pages++;
  }
  expect(complete).toBe(true);
  expect(lastNames).toEqual(['Contact 2999 needle']);

  const sellerPage = await seller.session.query(api.workspaceContacts.list, {
    workspaceId,
    paginationOpts: { numItems: 100, cursor: null },
  });
  expect(sellerPage.page.length).toBeGreaterThan(0);
  expect(
    sellerPage.page.every(
      (contact) => Number(contact.accountName.slice(10, 14)) % 2 === 1,
    ),
  ).toBe(true);
  expect(sellerPage.scannedCount).toBeLessThanOrEqual(100);
  expect(
    await test.run(
      async (context) =>
        (await context.db.query('contactAudit').collect()).length,
    ),
  ).toBe(3000);
}, 120_000);

it('keeps benchmark creation disabled without strict simulator configuration', async () => {
  vi.stubEnv('FENFORCE_MOCK_IDENTITY_ENABLED', 'false');
  const test = convexTest(schema, modules);
  await expect(
    test.mutation(internal.mockAccountBenchmark.prepare, {}),
  ).rejects.toThrow('MOCK_IDENTITY_DISABLED');
});
