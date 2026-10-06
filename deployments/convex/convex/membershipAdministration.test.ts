import { convexTest } from 'convex-test';
import { afterEach, expect, it, vi } from 'vitest';

import { salesActor } from '../testing/accountFixtures';
import { signedInAs } from '../testing/sessionFixtures';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const paginationOpts = { numItems: 20, cursor: null };

afterEach(() => vi.unstubAllEnvs());

it('lets administrators invite sellers and managers without granting administrator sales rights', async () => {
  vi.stubEnv('FENFORCE_OIDC_ISSUER', 'http://localhost:4011');
  vi.stubEnv('FENFORCE_OIDC_TENANT', 'tenant-demo');
  const test = convexTest(schema, modules);
  const { session: admin } = await signedInAs(test, 'Administrator');
  const workspaceId = await admin.mutation(api.workspaces.create, {
    name: 'Demo',
  });
  for (const role of ['seller', 'manager'] as const) {
    expect(
      await admin.mutation(api.employeeIdentity.invite, {
        workspaceId,
        subject: role,
        displayName: role,
        role,
      }),
    ).toBeTruthy();
  }
  expect(
    (await admin.query(api.workspaces.listMine, { paginationOpts })).page[0]
      ?.role,
  ).toBe('admin');
});

it('lets only the workspace administrator inspect disabled membership history', async () => {
  const test = convexTest(schema, modules);
  const { session: admin } = await signedInAs(test, 'Administrator');
  const workspaceId = await admin.mutation(api.workspaces.create, {
    name: 'Demo',
  });
  const { session: seller, memberId } = await salesActor(
    test,
    workspaceId,
    'seller',
    'Seller',
  );
  await expect(
    seller.query(api.employeeIdentity.listMembers, {
      workspaceId,
      paginationOpts,
    }),
  ).rejects.toThrow('FORBIDDEN');
  await expect(
    seller.mutation(api.employeeIdentity.disableMember, {
      workspaceId,
      memberId,
    }),
  ).rejects.toThrow('FORBIDDEN');
  await admin.mutation(api.employeeIdentity.disableMember, {
    workspaceId,
    memberId,
  });
  const members = await admin.query(api.employeeIdentity.listMembers, {
    workspaceId,
    paginationOpts,
  });
  expect(members.page.find((row) => row.memberId === memberId)).toEqual({
    memberId,
    displayName: 'Seller',
    role: 'seller',
    active: false,
  });
});

it('prevents administrators from revoking their own access', async () => {
  const test = convexTest(schema, modules);
  const { session: admin } = await signedInAs(test, 'Administrator');
  const workspaceId = await admin.mutation(api.workspaces.create, {
    name: 'Demo',
  });
  const [ownMembership] = (
    await admin.query(api.employeeIdentity.listMembers, {
      workspaceId,
      paginationOpts,
    })
  ).page;
  if (!ownMembership) throw new Error('Missing administrator membership');
  await expect(
    admin.mutation(api.employeeIdentity.disableMember, {
      workspaceId,
      memberId: ownMembership.memberId,
    }),
  ).rejects.toThrow('FORBIDDEN');
  const members = await admin.query(api.employeeIdentity.listMembers, {
    workspaceId,
    paginationOpts,
  });
  expect(
    members.page.find((row) => row.memberId === ownMembership.memberId)?.active,
  ).toBe(true);
});

it('rejects new ownership by inactive employees and non-sales roles', async () => {
  const test = convexTest(schema, modules);
  const { session: admin } = await signedInAs(test, 'Administrator');
  const workspaceId = await admin.mutation(api.workspaces.create, {
    name: 'Demo',
  });
  const { session: manager } = await salesActor(
    test,
    workspaceId,
    'manager',
    'Manager',
  );
  for (const role of ['admin', 'member', 'seller', 'manager'] as const) {
    const { userId } = await signedInAs(test, `Owner ${role}`);
    const memberId = await test.run((context) =>
      context.db.insert('workspaceMembers', {
        workspaceId,
        userId,
        displayName: 'Ineligible owner',
        role,
        active: role === 'admin' || role === 'member',
        createdAt: Date.now(),
      }),
    );
    await expect(
      manager.mutation(api.workspaceCompanies.create, {
        workspaceId,
        name: 'Rejected',
        accountOwnerId: memberId,
      }),
    ).rejects.toThrow('INVALID_ACCOUNT_OWNER');
  }
});

it('keeps historical actors readable after revocation while rejecting queued writes and owner selections', async () => {
  const test = convexTest(schema, modules);
  const { session: admin } = await signedInAs(test, 'Administrator');
  const workspaceId = await admin.mutation(api.workspaces.create, {
    name: 'Demo',
  });
  const { session: seller, memberId: sellerId } = await salesActor(
    test,
    workspaceId,
    'seller',
    'Departing seller',
  );
  const { session: manager } = await salesActor(
    test,
    workspaceId,
    'manager',
    'Manager',
  );
  const companyId = await seller.mutation(api.workspaceCompanies.create, {
    workspaceId,
    name: 'History retained',
    accountOwnerId: sellerId,
  });
  const queuedWrite = {
    workspaceId,
    companyId,
    expectedRevision: 1,
    name: 'Queued before departure',
  };
  const { session: foreignAdmin } = await signedInAs(
    test,
    'Foreign administrator',
  );
  const foreignWorkspaceId = await foreignAdmin.mutation(
    api.workspaces.create,
    { name: 'Foreign' },
  );
  await expect(
    foreignAdmin.mutation(api.employeeIdentity.disableMember, {
      workspaceId: foreignWorkspaceId,
      memberId: sellerId,
    }),
  ).rejects.toThrow('FORBIDDEN');
  await admin.mutation(api.employeeIdentity.disableMember, {
    workspaceId,
    memberId: sellerId,
  });
  await expect(
    seller.mutation(api.workspaceCompanies.update, queuedWrite),
  ).rejects.toThrow('UNAUTHENTICATED');
  await expect(
    manager.mutation(api.workspaceCompanies.update, {
      workspaceId,
      companyId,
      expectedRevision: 1,
      accountOwnerId: sellerId,
    }),
  ).rejects.toThrow('INVALID_ACCOUNT_OWNER');
  expect(
    await manager.query(api.workspaceCompanies.get, { workspaceId, companyId }),
  ).toMatchObject({
    name: 'History retained',
    revision: 1,
    createdBy: sellerId,
    createdByName: 'Departing seller',
    accountOwnerId: sellerId,
    accountOwnerName: 'Departing seller',
  });
});

it('reconciles only explicit mock roles without reactivating historical employees', async () => {
  vi.stubEnv('FENFORCE_OIDC_ISSUER', 'http://localhost:4011');
  vi.stubEnv('FENFORCE_OIDC_TENANT', 'tenant-demo');
  vi.stubEnv('FENFORCE_MOCK_IDENTITY_ENABLED', 'true');
  const test = convexTest(schema, modules);
  const workspaceId = await test.mutation(
    internal.employeeIdentity.prepareMockWorkspace,
    {},
  );
  const { session: admin, userId: adminUserId } = await signedInAs(
    test,
    'Administrator',
  );
  const { userId } = await signedInAs(test, 'Historical seller');
  const memberId = await test.run(async (context) => {
    await context.db.insert('workspaceMembers', {
      workspaceId,
      userId: adminUserId,
      displayName: 'Administrator',
      role: 'admin',
      active: true,
      createdAt: Date.now(),
    });
    const invitation = await context.db
      .query('employeeInvitations')
      .withIndex('by_issuer_and_tenant_and_subject', (index) =>
        index
          .eq('issuer', 'http://localhost:4011')
          .eq('tenant', 'tenant-demo')
          .eq('subject', 'seller-a'),
      )
      .unique();
    if (!invitation) throw new Error('Missing invitation');
    await context.db.patch(invitation._id, {
      role: 'member',
      acceptedUserId: userId,
    });
    return context.db.insert('workspaceMembers', {
      workspaceId,
      userId,
      displayName: 'Historical seller',
      role: 'member',
      active: false,
      createdAt: Date.now(),
    });
  });
  expect(
    await test.mutation(internal.employeeIdentity.prepareMockWorkspace, {}),
  ).toBe(workspaceId);
  expect(
    (
      await admin.query(api.employeeIdentity.listMembers, {
        workspaceId,
        paginationOpts,
      })
    ).page.find((member) => member.memberId === memberId),
  ).toEqual({
    memberId,
    displayName: 'Historical seller',
    role: 'seller',
    active: false,
  });
});
