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
    {
      workspaceId,
      name: 'Account A',
      industry: 'services',
      domainName: 'acme.example',
    },
  );
  return { test, admin, workspaceId, seller, other, manager, companyId };
};

it('trashes and restores the same account with fields, owner and compound links intact', async () => {
  const { test, workspaceId, seller, companyId } = await fixture();
  await test.run((context) =>
    context.db.patch(companyId, {
      domainName: {
        primaryLinkUrl: 'https://acme.example',
        primaryLinkLabel: 'Custom label',
        secondaryLinks: [{ url: 'https://other.example', label: 'Other' }],
      },
    }),
  );
  const before = await seller.session.query(api.workspaceCompanies.get, {
    workspaceId,
    companyId,
  });
  expect(
    await seller.session.mutation(api.accountLifecycle.trash, {
      workspaceId,
      companyId,
      expectedRevision: 1,
    }),
  ).toEqual({ revision: 2, changed: true });
  expect(
    await seller.session.query(api.workspaceCompanies.get, {
      workspaceId,
      companyId,
    }),
  ).toBeNull();
  expect(
    (
      await seller.session.query(api.workspaceCompanies.list, {
        workspaceId,
        paginationOpts,
      })
    ).page,
  ).toEqual([]);
  expect(
    (
      await seller.session.query(api.accountLifecycle.listTrash, {
        workspaceId,
        paginationOpts,
      })
    ).page,
  ).toMatchObject([
    {
      _id: companyId,
      revision: 2,
      name: before?.name,
      industry: before?.industry,
      domainName: before?.domainName,
      accountOwnerId: seller.memberId,
    },
  ]);
  expect(
    await seller.session.mutation(api.accountLifecycle.restore, {
      workspaceId,
      companyId,
      expectedRevision: 2,
    }),
  ).toEqual({ revision: 3, changed: true });
  expect(
    await seller.session.query(api.workspaceCompanies.get, {
      workspaceId,
      companyId,
    }),
  ).toMatchObject({
    _id: companyId,
    revision: 3,
    name: before?.name,
    industry: before?.industry,
    domainName: before?.domainName,
    accountOwnerId: seller.memberId,
    deletedAt: null,
  });
  expect(
    (
      await seller.session.query(api.workspaceCompanies.history, {
        workspaceId,
        companyId,
        paginationOpts,
      })
    ).page,
  ).toHaveLength(3);
});

it('accepts only one concurrent edit or trash against the same revision', async () => {
  const { workspaceId, seller, companyId } = await fixture();
  const outcomes = await Promise.allSettled([
    seller.session.mutation(api.workspaceCompanies.update, {
      workspaceId,
      companyId,
      expectedRevision: 1,
      name: 'Concurrent edit',
    }),
    seller.session.mutation(api.accountLifecycle.trash, {
      workspaceId,
      companyId,
      expectedRevision: 1,
    }),
  ]);
  expect(
    outcomes.filter((outcome) => outcome.status === 'fulfilled'),
  ).toHaveLength(1);
  expect(
    outcomes.filter((outcome) => outcome.status === 'rejected'),
  ).toHaveLength(1);
  const active = await seller.session.query(api.workspaceCompanies.get, {
    workspaceId,
    companyId,
  });
  const trashed = await seller.session.query(api.accountLifecycle.getTrashed, {
    workspaceId,
    companyId,
  });
  expect(active ?? trashed).toMatchObject({ _id: companyId, revision: 2 });
  if (outcomes[0].status === 'fulfilled')
    expect(active?.name).toBe('Concurrent edit');
  else expect(trashed?.name).toBe('Account A');
  expect(
    (
      await seller.session.query(api.workspaceCompanies.history, {
        workspaceId,
        companyId,
        paginationOpts,
      })
    ).page,
  ).toHaveLength(2);
});

it('returns stable no-op outcomes for immediate repeats and rejects stale opposite transitions', async () => {
  const { workspaceId, seller, manager, companyId } = await fixture();
  const trashArgs = { workspaceId, companyId, expectedRevision: 1 };
  await seller.session.mutation(api.accountLifecycle.trash, trashArgs);
  expect(
    await seller.session.mutation(api.accountLifecycle.trash, trashArgs),
  ).toEqual({ revision: 2, changed: false });
  await expect(
    manager.session.mutation(api.accountLifecycle.trash, trashArgs),
  ).rejects.toThrow('COMPANY_CHANGED');
  const restoreArgs = { workspaceId, companyId, expectedRevision: 2 };
  await seller.session.mutation(api.accountLifecycle.restore, restoreArgs);
  expect(
    await seller.session.mutation(api.accountLifecycle.restore, restoreArgs),
  ).toEqual({ revision: 3, changed: false });
  await expect(
    seller.session.mutation(api.accountLifecycle.trash, trashArgs),
  ).rejects.toThrow('COMPANY_CHANGED');
  await seller.session.mutation(api.workspaceCompanies.update, {
    workspaceId,
    companyId,
    expectedRevision: 3,
    name: 'Later edit',
  });
  await expect(
    seller.session.mutation(api.accountLifecycle.restore, restoreArgs),
  ).rejects.toThrow('COMPANY_CHANGED');
  expect(
    await seller.session.query(api.workspaceCompanies.get, {
      workspaceId,
      companyId,
    }),
  ).toMatchObject({ name: 'Later edit', revision: 4 });
  expect(
    (
      await seller.session.query(api.workspaceCompanies.history, {
        workspaceId,
        companyId,
        paginationOpts,
      })
    ).page,
  ).toHaveLength(4);
});

it('rejects unauthorized lifecycle operations without leaking trashed records or changing history', async () => {
  const { test, admin, workspaceId, seller, other, manager, companyId } =
    await fixture();
  await seller.session.mutation(api.accountLifecycle.trash, {
    workspaceId,
    companyId,
    expectedRevision: 1,
  });
  for (const operation of [
    api.accountLifecycle.trash,
    api.accountLifecycle.restore,
  ]) {
    await expect(
      other.session.mutation(operation, {
        workspaceId,
        companyId,
        expectedRevision: 2,
      }),
    ).rejects.toThrow('COMPANY_NOT_FOUND');
    await expect(
      admin.mutation(operation, {
        workspaceId,
        companyId,
        expectedRevision: 2,
      }),
    ).rejects.toThrow('FORBIDDEN');
    await expect(
      test.mutation(operation, { workspaceId, companyId, expectedRevision: 2 }),
    ).rejects.toThrow('UNAUTHENTICATED');
  }
  expect(
    await other.session.query(api.accountLifecycle.getTrashed, {
      workspaceId,
      companyId,
    }),
  ).toBeNull();
  expect(
    (
      await other.session.query(api.accountLifecycle.listTrash, {
        workspaceId,
        paginationOpts,
      })
    ).page,
  ).toEqual([]);
  expect(
    (
      await manager.session.query(api.accountLifecycle.listTrash, {
        workspaceId,
        paginationOpts,
      })
    ).page.map((record) => record._id),
  ).toEqual([companyId]);
  await expect(
    seller.session.mutation(api.accountLifecycle.reassignTrashed, {
      workspaceId,
      companyId,
      expectedRevision: 2,
      accountOwnerId: other.memberId,
    }),
  ).rejects.toThrow('FORBIDDEN');
  const foreignWorkspace = await admin.mutation(api.workspaces.create, {
    name: 'Other workspace',
  });
  const foreign = await salesActor(test, foreignWorkspace, 'manager');
  await expect(
    foreign.session.mutation(api.accountLifecycle.restore, {
      workspaceId: foreignWorkspace,
      companyId,
      expectedRevision: 2,
    }),
  ).rejects.toThrow('COMPANY_NOT_FOUND');
  expect(
    (
      await seller.session.query(api.workspaceCompanies.history, {
        workspaceId,
        companyId,
        paginationOpts,
      })
    ).page,
  ).toHaveLength(2);
});

it('lets a manager inspect and repair a missing owner before restoring the same record', async () => {
  const { test, workspaceId, seller, manager } = await fixture();
  const companyId = await manager.session.mutation(
    api.workspaceCompanies.create,
    { workspaceId, name: 'Orphaned owner', accountOwnerId: seller.memberId },
  );
  await manager.session.mutation(api.accountLifecycle.trash, {
    workspaceId,
    companyId,
    expectedRevision: 1,
  });
  await test.run((context) => context.db.delete(seller.memberId));
  expect(
    await manager.session.query(api.accountLifecycle.getTrashed, {
      workspaceId,
      companyId,
    }),
  ).toMatchObject({
    accountOwnerId: seller.memberId,
    accountOwnerName: seller.memberId,
  });
  await expect(
    manager.session.mutation(api.accountLifecycle.restore, {
      workspaceId,
      companyId,
      expectedRevision: 2,
    }),
  ).rejects.toThrow('INVALID_ACCOUNT_OWNER');
  await manager.session.mutation(api.accountLifecycle.reassignTrashed, {
    workspaceId,
    companyId,
    expectedRevision: 2,
    accountOwnerId: manager.memberId,
  });
  await manager.session.mutation(api.accountLifecycle.restore, {
    workspaceId,
    companyId,
    expectedRevision: 3,
  });
  expect(
    await manager.session.query(api.workspaceCompanies.get, {
      workspaceId,
      companyId,
    }),
  ).toMatchObject({
    _id: companyId,
    name: 'Orphaned owner',
    accountOwnerId: manager.memberId,
    revision: 4,
  });
});

it('rejects stale legacy deletion without hiding an acknowledged edit', async () => {
  const { workspaceId, seller, companyId } = await fixture();
  await seller.session.mutation(api.workspaceCompanies.update, {
    workspaceId,
    companyId,
    expectedRevision: 1,
    name: 'Acknowledged edit',
  });
  await expect(
    seller.session.mutation(api.workspaceCompanies.softDelete, {
      workspaceId,
      companyId,
      expectedRevision: 1,
    }),
  ).rejects.toThrow('COMPANY_CHANGED');
  expect(
    await seller.session.query(api.workspaceCompanies.get, {
      workspaceId,
      companyId,
    }),
  ).toMatchObject({ name: 'Acknowledged edit', revision: 2 });
});

it('blocks restore for inactive ownership until a manager reassigns the trashed record', async () => {
  const { admin, workspaceId, seller, other, manager, companyId } =
    await fixture();
  await seller.session.mutation(api.accountLifecycle.trash, {
    workspaceId,
    companyId,
    expectedRevision: 1,
  });
  await admin.mutation(api.employeeIdentity.disableMember, {
    workspaceId,
    memberId: seller.memberId,
  });
  await expect(
    manager.session.mutation(api.accountLifecycle.restore, {
      workspaceId,
      companyId,
      expectedRevision: 2,
    }),
  ).rejects.toThrow('INVALID_ACCOUNT_OWNER');
  expect(
    await manager.session.query(api.accountLifecycle.getTrashed, {
      workspaceId,
      companyId,
    }),
  ).toMatchObject({ revision: 2, accountOwnerId: seller.memberId });
  await expect(
    other.session.mutation(api.accountLifecycle.reassignTrashed, {
      workspaceId,
      companyId,
      expectedRevision: 2,
      accountOwnerId: other.memberId,
    }),
  ).rejects.toThrow('COMPANY_NOT_FOUND');
  expect(
    await manager.session.mutation(api.accountLifecycle.reassignTrashed, {
      workspaceId,
      companyId,
      expectedRevision: 2,
      accountOwnerId: other.memberId,
    }),
  ).toEqual({ revision: 3, changed: true });
  expect(
    await other.session.mutation(api.accountLifecycle.restore, {
      workspaceId,
      companyId,
      expectedRevision: 3,
    }),
  ).toEqual({ revision: 4, changed: true });
  expect(
    await other.session.query(api.workspaceCompanies.get, {
      workspaceId,
      companyId,
    }),
  ).toMatchObject({
    accountOwnerId: other.memberId,
    createdBy: seller.memberId,
    createdByName: 'Seller A',
    revision: 4,
  });
});
