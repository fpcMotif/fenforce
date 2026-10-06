import { convexTest } from 'convex-test';
import { expect, it } from 'vitest';

import { salesActor } from '../testing/accountFixtures';
import { signedInAs } from '../testing/sessionFixtures';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const paginationOpts = { numItems: 20, cursor: null };

const fixture = async () => {
  const test = convexTest(schema, modules);
  const { session: admin } = await signedInAs(test, 'Administrator');
  const workspaceId = await admin.mutation(api.workspaces.create, {
    name: 'Sales',
  });
  const seller = await salesActor(test, workspaceId, 'seller', 'Seller A');
  const other = await salesActor(test, workspaceId, 'seller', 'Seller B');
  const manager = await salesActor(test, workspaceId, 'manager', 'Manager');
  const companyId = await seller.session.mutation(
    api.workspaceCompanies.create,
    { workspaceId, name: 'Account A' },
  );
  const otherCompanyId = await other.session.mutation(
    api.workspaceCompanies.create,
    { workspaceId, name: 'Account B' },
  );
  return {
    test,
    admin,
    workspaceId,
    seller,
    other,
    manager,
    companyId,
    otherCompanyId,
  };
};

it('limits seller lists, detail and history to owned records and denies administrative sales access', async () => {
  const {
    admin,
    workspaceId,
    seller,
    other,
    manager,
    companyId,
    otherCompanyId,
  } = await fixture();
  expect(
    (
      await seller.session.query(api.workspaceCompanies.list, {
        workspaceId,
        paginationOpts,
      })
    ).page.map((record) => record._id),
  ).toEqual([companyId]);
  expect(
    (
      await manager.session.query(api.workspaceCompanies.list, {
        workspaceId,
        paginationOpts,
      })
    ).page.map((record) => record._id),
  ).toEqual([companyId, otherCompanyId]);
  expect(
    await other.session.query(api.workspaceCompanies.get, {
      workspaceId,
      companyId,
    }),
  ).toBeNull();
  await expect(
    other.session.query(api.workspaceCompanies.history, {
      workspaceId,
      companyId,
      paginationOpts,
    }),
  ).rejects.toThrow('COMPANY_NOT_FOUND');
  await expect(
    admin.query(api.workspaceCompanies.list, { workspaceId, paginationOpts }),
  ).rejects.toThrow('FORBIDDEN');
  await expect(
    admin.query(api.workspaceCompanies.get, { workspaceId, companyId }),
  ).rejects.toThrow('FORBIDDEN');
});

it('rejects forged writes and seller reassignment, while manager reassignment transfers access', async () => {
  const { workspaceId, seller, other, manager, admin, companyId } =
    await fixture();
  const original = await seller.session.query(api.workspaceCompanies.get, {
    workspaceId,
    companyId,
  });
  await expect(
    seller.session.mutation(api.workspaceCompanies.create, {
      workspaceId,
      name: 'Other owned',
      accountOwnerId: other.memberId,
    }),
  ).rejects.toThrow('FORBIDDEN');
  await expect(
    seller.session.mutation(api.workspaceCompanies.update, {
      workspaceId,
      companyId,
      expectedRevision: 1,
      accountOwnerId: other.memberId,
    }),
  ).rejects.toThrow('FORBIDDEN');
  await expect(
    other.session.mutation(api.workspaceCompanies.update, {
      workspaceId,
      companyId,
      expectedRevision: 99,
      name: 'Stolen',
    }),
  ).rejects.toThrow('COMPANY_NOT_FOUND');
  await expect(
    other.session.mutation(api.workspaceCompanies.softDelete, {
      workspaceId,
      companyId,
    }),
  ).rejects.toThrow('COMPANY_NOT_FOUND');
  await expect(
    admin.mutation(api.workspaceCompanies.create, {
      workspaceId,
      name: 'Admin',
    }),
  ).rejects.toThrow('FORBIDDEN');
  await expect(
    admin.mutation(api.workspaceCompanies.update, {
      workspaceId,
      companyId,
      expectedRevision: 1,
      name: 'Admin',
    }),
  ).rejects.toThrow('FORBIDDEN');
  await expect(
    admin.mutation(api.workspaceCompanies.softDelete, {
      workspaceId,
      companyId,
    }),
  ).rejects.toThrow('FORBIDDEN');
  const forged = {
    workspaceId,
    companyId,
    expectedRevision: 1,
    createdBy: other.memberId,
  };
  await expect(
    seller.session.mutation(api.workspaceCompanies.update, forged),
  ).rejects.toThrow();
  expect(
    await seller.session.query(api.workspaceCompanies.get, {
      workspaceId,
      companyId,
    }),
  ).toEqual(original);
  expect(
    (
      await seller.session.query(api.workspaceCompanies.history, {
        workspaceId,
        companyId,
        paginationOpts,
      })
    ).page,
  ).toHaveLength(1);
  await manager.session.mutation(api.workspaceCompanies.update, {
    workspaceId,
    companyId,
    expectedRevision: 1,
    accountOwnerId: other.memberId,
  });
  expect(
    await seller.session.query(api.workspaceCompanies.get, {
      workspaceId,
      companyId,
    }),
  ).toBeNull();
  expect(
    await other.session.query(api.workspaceCompanies.get, {
      workspaceId,
      companyId,
    }),
  ).toMatchObject({
    accountOwnerId: other.memberId,
    revision: 2,
    permissions: { canUpdate: true, canReassign: false },
  });
  await other.session.mutation(api.workspaceCompanies.update, {
    workspaceId,
    companyId,
    expectedRevision: 2,
    name: 'New owner edit',
  });
  await other.session.mutation(api.workspaceCompanies.softDelete, {
    workspaceId,
    companyId,
  });
  expect(
    await other.session.query(api.workspaceCompanies.get, {
      workspaceId,
      companyId,
    }),
  ).toBeNull();
});

it('rechecks role and membership on each request and excludes inactive owners without losing historical attribution', async () => {
  const { test, admin, workspaceId, seller, manager, companyId } =
    await fixture();
  await admin.mutation(api.employeeIdentity.disableMember, {
    workspaceId,
    memberId: seller.memberId,
  });
  await expect(
    seller.session.query(api.workspaceCompanies.list, {
      workspaceId,
      paginationOpts,
    }),
  ).rejects.toThrow('UNAUTHENTICATED');
  await expect(
    seller.session.mutation(api.workspaceCompanies.update, {
      workspaceId,
      companyId,
      expectedRevision: 1,
      name: 'Queued before disable',
    }),
  ).rejects.toThrow('UNAUTHENTICATED');
  const owners = await manager.session.query(
    api.workspaceCompanies.listEligibleOwners,
    { workspaceId, paginationOpts },
  );
  expect(owners.page.map((owner) => owner.memberId)).not.toContain(
    seller.memberId,
  );
  expect(
    await manager.session.query(api.workspaceCompanies.get, {
      workspaceId,
      companyId,
    }),
  ).toMatchObject({ accountOwnerName: 'Seller A', createdByName: 'Seller A' });
  await test.run((context) =>
    context.db.patch(manager.memberId, { role: 'member' }),
  );
  await expect(
    manager.session.query(api.workspaceCompanies.get, {
      workspaceId,
      companyId,
    }),
  ).rejects.toThrow('FORBIDDEN');
  await expect(
    manager.session.query(api.workspaceCompanies.listEligibleOwners, {
      workspaceId,
      paginationOpts,
    }),
  ).rejects.toThrow('FORBIDDEN');
});
