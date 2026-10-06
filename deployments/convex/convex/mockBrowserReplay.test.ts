import { convexTest } from 'convex-test';
import { afterEach, expect, it, vi } from 'vitest';

import { signedInAs } from '../testing/sessionFixtures';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
afterEach(() => vi.unstubAllEnvs());

const paginationOpts = { numItems: 25, cursor: null };

const synthesizeEmployees = async () => {
  vi.stubEnv('FENFORCE_MOCK_IDENTITY_ENABLED', 'true');
  vi.stubEnv('FENFORCE_OIDC_ISSUER', 'http://localhost:4011');
  vi.stubEnv('FENFORCE_OIDC_TENANT', 'tenant-demo');
  const test = convexTest(schema, modules);
  const employees = {
    sellerA: await signedInAs(test, 'seller-a'),
    sellerB: await signedInAs(test, 'seller-b'),
    manager: await signedInAs(test, 'manager-a'),
    admin: await signedInAs(test, 'admin-a'),
  };
  await test.run(async (context) => {
    for (const [subject, employee] of [
      ['seller-a', employees.sellerA],
      ['seller-b', employees.sellerB],
      ['manager-a', employees.manager],
      ['admin-a', employees.admin],
    ] as const)
      await context.db.insert('employeeIdentities', {
        issuer: 'http://localhost:4011',
        tenant: 'tenant-demo',
        subject,
        userId: employee.userId,
      });
  });
  return { test, ...employees };
};

it('seeds a fresh M1-F01 contact fixture and keeps only the newest one in memberships', async () => {
  const { test, sellerA, sellerB, manager, admin } =
    await synthesizeEmployees();
  await test.mutation(internal.mockBrowserReplay.prepareContactFixture, {});
  const fixture = await test.mutation(
    internal.mockBrowserReplay.prepareContactFixture,
    {},
  );
  const { workspaceId, otherWorkspaceId } = fixture;

  for (const [employee, expected] of [
    [sellerA, [workspaceId, otherWorkspaceId]],
    [sellerB, [workspaceId]],
    [manager, [workspaceId]],
    [admin, [workspaceId]],
  ] as const)
    expect(
      (
        await employee.session.query(api.workspaces.listMine, {
          paginationOpts,
        })
      ).page
        .map((workspace) => workspace.workspaceId)
        .sort(),
    ).toEqual([...expected].sort());

  expect(
    await sellerA.session.query(api.workspaceContacts.get, {
      workspaceId,
      contactId: fixture.contactAId,
    }),
  ).toMatchObject({
    accountId: fixture.accountAId,
    accountName: 'account-a',
    lastName: 'Synthetic',
    email: null,
    revision: 1,
    createdByName: 'seller-a',
  });
  expect(
    await sellerB.session.query(api.workspaceContacts.get, {
      workspaceId,
      contactId: fixture.contactAId,
    }),
  ).toBeNull();
  await expect(
    admin.session.query(api.workspaceContacts.list, {
      workspaceId,
      paginationOpts,
    }),
  ).rejects.toThrow('FORBIDDEN');
  await expect(
    sellerA.session.mutation(api.workspaceContacts.update, {
      operationId: 'relation',
      workspaceId,
      contactId: fixture.contactAId,
      expectedRevision: 1,
      accountId: fixture.accountBId,
    }),
  ).rejects.toThrow('COMPANY_NOT_FOUND');
  expect(
    (
      await manager.session.query(api.workspaceCompanies.list, {
        workspaceId,
        paginationOpts,
      })
    ).page.map((company) => [company.name, company.revision]),
  ).toEqual([
    ['account-a', 1],
    ['account-b', 1],
  ]);
  expect(
    (
      await sellerA.session.query(api.workspaceCompanies.list, {
        workspaceId: otherWorkspaceId,
        paginationOpts,
      })
    ).page.map((company) => company._id),
  ).toEqual([fixture.accountXId]);
});

it('requires the synthetic sales employees and strict simulator configuration', async () => {
  vi.stubEnv('FENFORCE_MOCK_IDENTITY_ENABLED', 'false');
  await expect(
    convexTest(schema, modules).mutation(
      internal.mockBrowserReplay.prepareContactFixture,
      {},
    ),
  ).rejects.toThrow('MOCK_IDENTITY_DISABLED');
  vi.stubEnv('FENFORCE_MOCK_IDENTITY_ENABLED', 'true');
  vi.stubEnv('FENFORCE_OIDC_ISSUER', 'http://localhost:4011');
  vi.stubEnv('FENFORCE_OIDC_TENANT', 'tenant-demo');
  await expect(
    convexTest(schema, modules).mutation(
      internal.mockBrowserReplay.prepareContactFixture,
      {},
    ),
  ).rejects.toThrow('SIGN_IN_AS_SYNTHETIC_EMPLOYEES_FIRST');
});
