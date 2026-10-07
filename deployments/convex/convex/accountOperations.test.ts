import { expect, it } from 'vitest';

import { salesWorkspace } from '../testing/accountFixtures';
import { api } from './_generated/api';

const paginationOpts = { numItems: 20, cursor: null };

const fixture = salesWorkspace;

it('recovers a lost create acknowledgement without creating a second account or audit', async () => {
  const { workspaceId, seller } = await fixture();
  const args = {
    workspaceId,
    name: 'One account',
    operationId: 'create-retry',
  };
  const first = await seller.session.mutation(
    api.workspaceCompanies.create,
    args,
  );
  expect(
    await seller.session.mutation(api.workspaceCompanies.create, args),
  ).toBe(first);
  expect(
    (
      await seller.session.query(api.workspaceCompanies.list, {
        workspaceId,
        paginationOpts,
      })
    ).page.map((company) => company._id),
  ).toEqual([first]);
  expect(
    (
      await seller.session.query(api.workspaceCompanies.history, {
        workspaceId,
        companyId: first,
        paginationOpts,
      })
    ).page,
  ).toHaveLength(1);
  expect(
    await seller.session.query(api.accountOperations.getReceipt, {
      workspaceId,
      operationId: args.operationId,
    }),
  ).toMatchObject({
    operation: 'create',
    companyId: first,
    revision: 1,
    changed: true,
  });
});

it('deduplicates simultaneous submissions and rejects keys reused for another payload or operation', async () => {
  const { workspaceId, seller } = await fixture();
  const args = {
    workspaceId,
    name: 'Concurrent create',
    operationId: 'simultaneous-create',
  };
  const [first, second] = await Promise.all([
    seller.session.mutation(api.workspaceCompanies.create, args),
    seller.session.mutation(api.workspaceCompanies.create, {
      operationId: args.operationId,
      name: args.name,
      workspaceId,
    }),
  ]);
  expect(first).toBe(second);
  await expect(
    seller.session.mutation(api.workspaceCompanies.create, {
      ...args,
      name: 'Changed payload',
    }),
  ).rejects.toThrow('OPERATION_ID_REUSED');
  await expect(
    seller.session.mutation(api.workspaceCompanies.update, {
      workspaceId,
      companyId: first,
      expectedRevision: 1,
      name: args.name,
      operationId: args.operationId,
    }),
  ).rejects.toThrow('OPERATION_ID_REUSED');
  expect(
    (
      await seller.session.query(api.workspaceCompanies.list, {
        workspaceId,
        paginationOpts,
      })
    ).page,
  ).toHaveLength(1);
  expect(
    (
      await seller.session.query(api.workspaceCompanies.history, {
        workspaceId,
        companyId: first,
        paginationOpts,
      })
    ).page,
  ).toHaveLength(1);
});

it('does not turn receipts into an authorization bypass after ownership or membership changes', async () => {
  const { admin, workspaceId, seller, other, manager } = await fixture();
  const args = {
    workspaceId,
    name: 'Private receipt',
    operationId: 'private-key',
  };
  const companyId = await seller.session.mutation(
    api.workspaceCompanies.create,
    args,
  );
  expect(
    await other.session.query(api.accountOperations.getReceipt, {
      workspaceId,
      operationId: args.operationId,
    }),
  ).toBeNull();
  await manager.session.mutation(api.workspaceCompanies.update, {
    workspaceId,
    companyId,
    expectedRevision: 1,
    accountOwnerId: other.memberId,
  });
  await expect(
    seller.session.query(api.accountOperations.getReceipt, {
      workspaceId,
      operationId: args.operationId,
    }),
  ).rejects.toThrow('COMPANY_NOT_FOUND');
  await expect(
    seller.session.mutation(api.workspaceCompanies.create, args),
  ).rejects.toThrow('COMPANY_NOT_FOUND');
  await admin.mutation(api.employeeIdentity.disableMember, {
    workspaceId,
    memberId: seller.memberId,
  });
  await expect(
    seller.session.query(api.accountOperations.getReceipt, {
      workspaceId,
      operationId: args.operationId,
    }),
  ).rejects.toThrow('UNAUTHENTICATED');
  await expect(
    seller.session.mutation(api.workspaceCompanies.create, args),
  ).rejects.toThrow('UNAUTHENTICATED');
});

it('rechecks manager-only operation rights even when the downgraded employee still owns the account', async () => {
  const { test, workspaceId, seller, manager } = await fixture();
  const companyId = await seller.session.mutation(
    api.workspaceCompanies.create,
    { workspaceId, name: 'Manager receipt' },
  );
  await seller.session.mutation(api.accountLifecycle.trash, {
    workspaceId,
    companyId,
    expectedRevision: 1,
  });
  const args = {
    workspaceId,
    companyId,
    expectedRevision: 2,
    accountOwnerId: manager.memberId,
    operationId: 'manager-reassignment',
  };
  await manager.session.mutation(api.accountLifecycle.reassignTrashed, args);
  await test.run((context) =>
    context.db.patch(manager.memberId, { role: 'seller' }),
  );
  await expect(
    manager.session.query(api.accountOperations.getReceipt, {
      workspaceId,
      operationId: args.operationId,
    }),
  ).rejects.toThrow('FORBIDDEN');
  await expect(
    manager.session.mutation(api.accountLifecycle.reassignTrashed, args),
  ).rejects.toThrow('FORBIDDEN');
});

it('records only accepted operations and rejects malformed operation identifiers before any write', async () => {
  const { workspaceId, seller } = await fixture();
  for (const operationId of ['', ' ', 'x'.repeat(201)]) {
    await expect(
      seller.session.mutation(api.workspaceCompanies.create, {
        workspaceId,
        name: 'Rejected',
        operationId,
      }),
    ).rejects.toThrow('INVALID_OPERATION_ID');
  }
  expect(
    (
      await seller.session.query(api.workspaceCompanies.list, {
        workspaceId,
        paginationOpts,
      })
    ).page,
  ).toEqual([]);
  const companyId = await seller.session.mutation(
    api.workspaceCompanies.create,
    { workspaceId, name: 'Existing' },
  );
  await expect(
    seller.session.mutation(api.workspaceCompanies.update, {
      workspaceId,
      companyId,
      expectedRevision: 99,
      name: 'Stale',
      operationId: 'failed-write',
    }),
  ).rejects.toThrow('COMPANY_CHANGED');
  expect(
    await seller.session.query(api.accountOperations.getReceipt, {
      workspaceId,
      operationId: 'failed-write',
    }),
  ).toBeNull();
  await seller.session.mutation(api.workspaceCompanies.update, {
    workspaceId,
    companyId,
    expectedRevision: 1,
    name: 'Valid',
    operationId: 'failed-write',
  });
  expect(
    await seller.session.query(api.accountOperations.getReceipt, {
      workspaceId,
      operationId: 'failed-write',
    }),
  ).toMatchObject({ revision: 2, changed: true });
});

it('recovers trashed-owner changes after restoration and rejects changed-payload key reuse', async () => {
  const { workspaceId, seller, other, manager } = await fixture();
  const companyId = await seller.session.mutation(
    api.workspaceCompanies.create,
    { workspaceId, name: 'Ownership' },
  );
  await seller.session.mutation(api.accountLifecycle.trash, {
    workspaceId,
    companyId,
    expectedRevision: 1,
  });
  const args = {
    workspaceId,
    companyId,
    expectedRevision: 2,
    accountOwnerId: other.memberId,
    operationId: 'reassign-retry',
  };
  await manager.session.mutation(api.accountLifecycle.reassignTrashed, args);
  await manager.session.mutation(api.accountLifecycle.restore, {
    workspaceId,
    companyId,
    expectedRevision: 3,
  });
  expect(
    await manager.session.mutation(api.accountLifecycle.reassignTrashed, args),
  ).toEqual({ revision: 3, changed: true });
  await expect(
    manager.session.mutation(api.accountLifecycle.reassignTrashed, {
      ...args,
      accountOwnerId: seller.memberId,
    }),
  ).rejects.toThrow('OPERATION_ID_REUSED');
  expect(
    await manager.session.query(api.workspaceCompanies.get, {
      workspaceId,
      companyId,
    }),
  ).toMatchObject({ accountOwnerId: other.memberId, revision: 4 });
});

it('replays lifecycle acknowledgements across later opposite transitions without repeating effects', async () => {
  const { workspaceId, seller } = await fixture();
  const companyId = await seller.session.mutation(
    api.workspaceCompanies.create,
    { workspaceId, name: 'Lifecycle' },
  );
  const trash = {
    workspaceId,
    companyId,
    expectedRevision: 1,
    operationId: 'trash-retry',
  };
  const restore = {
    workspaceId,
    companyId,
    expectedRevision: 2,
    operationId: 'restore-retry',
  };
  await seller.session.mutation(api.accountLifecycle.trash, trash);
  await seller.session.mutation(api.accountLifecycle.restore, restore);
  expect(
    await seller.session.mutation(api.accountLifecycle.trash, trash),
  ).toEqual({ revision: 2, changed: true });
  expect(
    await seller.session.mutation(api.accountLifecycle.restore, restore),
  ).toEqual({ revision: 3, changed: true });
  expect(
    await seller.session.query(api.workspaceCompanies.get, {
      workspaceId,
      companyId,
    }),
  ).toMatchObject({ revision: 3, deletedAt: null });
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

it('recovers an accepted edit after a later write without overwriting the newer revision', async () => {
  const { workspaceId, seller } = await fixture();
  const companyId = await seller.session.mutation(
    api.workspaceCompanies.create,
    { workspaceId, name: 'Original' },
  );
  const args = {
    workspaceId,
    companyId,
    expectedRevision: 1,
    name: 'First accepted edit',
    operationId: 'edit-retry',
  };
  await seller.session.mutation(api.workspaceCompanies.update, args);
  await seller.session.mutation(api.workspaceCompanies.update, {
    workspaceId,
    companyId,
    expectedRevision: 2,
    name: 'Newer accepted edit',
  });
  expect(
    await seller.session.mutation(api.workspaceCompanies.update, args),
  ).toBeNull();
  expect(
    await seller.session.query(api.accountOperations.getReceipt, {
      workspaceId,
      operationId: args.operationId,
    }),
  ).toMatchObject({ operation: 'update', revision: 2 });
  expect(
    await seller.session.query(api.workspaceCompanies.get, {
      workspaceId,
      companyId,
    }),
  ).toMatchObject({ revision: 3, name: 'Newer accepted edit' });
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
