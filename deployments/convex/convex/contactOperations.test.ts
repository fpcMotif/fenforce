import { expect, it } from 'vitest';

import { m1Fixture } from '../testing/contactFixtures';
import { api } from './_generated/api';

const counts = (fixture: Awaited<ReturnType<typeof m1Fixture>>) =>
  fixture.test.run(async (context) => ({
    contacts: (await context.db.query('workspaceContacts').collect()).length,
    audits: (await context.db.query('contactAudit').collect()).length,
    receipts: (await context.db.query('contactOperationReceipts').collect())
      .length,
  }));

it('replays a lost create acknowledgement without a duplicate, even after the contact is trashed', async () => {
  const fixture = await m1Fixture();
  const { workspaceId, seller, accountA } = fixture;
  const create = {
    operationId: 'create-once',
    workspaceId,
    accountId: accountA,
    lastName: 'Once',
  };
  const contactId = await seller.session.mutation(
    api.workspaceContacts.create,
    create,
  );
  const afterCreate = await counts(fixture);
  expect(
    await seller.session.mutation(api.workspaceContacts.create, create),
  ).toBe(contactId);
  expect(await counts(fixture)).toEqual(afterCreate);
  expect(
    await seller.session.query(api.contactOperations.getReceipt, {
      workspaceId,
      operationId: 'create-once',
    }),
  ).toMatchObject({ operation: 'create', contactId, revision: 1 });

  const trash = {
    operationId: 'trash-once',
    workspaceId,
    contactId,
    expectedRevision: 1,
  };
  expect(
    await seller.session.mutation(api.contactLifecycle.trash, trash),
  ).toEqual({ revision: 2, changed: true });
  expect(
    await seller.session.mutation(api.contactLifecycle.trash, trash),
  ).toEqual({ revision: 2, changed: true });
  expect(
    await seller.session.mutation(api.workspaceContacts.create, create),
  ).toBe(contactId);
  await seller.session.mutation(api.accountLifecycle.trash, {
    operationId: 'trash-account',
    workspaceId,
    companyId: accountA,
    expectedRevision: 1,
  });
  expect(
    await seller.session.mutation(api.workspaceContacts.create, create),
  ).toBe(contactId);
  expect(await counts(fixture)).toEqual({
    contacts: afterCreate.contacts,
    audits: afterCreate.audits + 1,
    receipts: afterCreate.receipts + 1,
  });
});

it('replays a lost create acknowledgement after a manager relinks the contact out of the creator reach', async () => {
  const fixture = await m1Fixture();
  const { workspaceId, seller, manager, accountA, accountB } = fixture;
  const create = {
    operationId: 'create-then-relinked',
    workspaceId,
    accountId: accountA,
    lastName: 'Relinked',
  };
  const contactId = await seller.session.mutation(
    api.workspaceContacts.create,
    create,
  );
  await manager.session.mutation(api.workspaceContacts.update, {
    operationId: 'relink-away',
    workspaceId,
    contactId,
    expectedRevision: 1,
    accountId: accountB,
  });
  const afterRelink = await counts(fixture);

  expect(
    await seller.session.mutation(api.workspaceContacts.create, create),
  ).toBe(contactId);
  expect(
    await seller.session.query(api.contactOperations.getReceipt, {
      workspaceId,
      operationId: create.operationId,
    }),
  ).toMatchObject({ operation: 'create', contactId, revision: 1 });
  await expect(
    seller.session.mutation(api.workspaceContacts.create, {
      ...create,
      lastName: 'Different',
    }),
  ).rejects.toThrow('OPERATION_ID_REUSED');
  expect(await counts(fixture)).toEqual(afterRelink);
  expect(
    await seller.session.query(api.workspaceContacts.get, {
      workspaceId,
      contactId,
    }),
  ).toBeNull();
});

it('replays a lost update acknowledgement and rejects a reused operation ID with a different payload', async () => {
  const fixture = await m1Fixture();
  const { workspaceId, seller, contactA } = fixture;
  const update = {
    operationId: 'update-once',
    workspaceId,
    contactId: contactA,
    expectedRevision: 1,
    email: 'fixed@example.test',
  };
  expect(
    await seller.session.mutation(api.workspaceContacts.update, update),
  ).toEqual({ revision: 2 });
  expect(
    await seller.session.mutation(api.workspaceContacts.update, update),
  ).toEqual({ revision: 2 });
  await expect(
    seller.session.mutation(api.workspaceContacts.update, {
      ...update,
      email: 'other@example.test',
    }),
  ).rejects.toThrow('OPERATION_ID_REUSED');
  await expect(
    seller.session.mutation(api.contactLifecycle.trash, {
      operationId: 'update-once',
      workspaceId,
      contactId: contactA,
      expectedRevision: 1,
    }),
  ).rejects.toThrow('OPERATION_ID_REUSED');
  expect(
    await fixture.test.run((context) => context.db.get(contactA)),
  ).toMatchObject({ revision: 2, email: 'fixed@example.test' });
});

it('rejects malformed operation IDs and hides receipts once the account is no longer accessible', async () => {
  const { workspaceId, seller, other, manager, accountA, contactA } =
    await m1Fixture();
  for (const operationId of ['', ' padded', 'x'.repeat(201)])
    await expect(
      seller.session.mutation(api.workspaceContacts.create, {
        operationId,
        workspaceId,
        accountId: accountA,
        lastName: 'Bad',
      }),
    ).rejects.toThrow('INVALID_OPERATION_ID');
  await seller.session.mutation(api.workspaceContacts.update, {
    operationId: 'seller-edit',
    workspaceId,
    contactId: contactA,
    expectedRevision: 1,
    lastName: 'Edited',
  });
  await manager.session.mutation(api.workspaceCompanies.update, {
    workspaceId,
    companyId: accountA,
    expectedRevision: 1,
    accountOwnerId: other.memberId,
  });
  await expect(
    seller.session.query(api.contactOperations.getReceipt, {
      workspaceId,
      operationId: 'seller-edit',
    }),
  ).rejects.toThrow('CONTACT_NOT_FOUND');
  expect(
    await other.session.query(api.contactOperations.getReceipt, {
      workspaceId,
      operationId: 'seller-edit',
    }),
  ).toBeNull();
});

it('lets exactly one of two concurrent relinks from the same revision win', async () => {
  const fixture = await m1Fixture();
  const { workspaceId, seller, manager, accountB, contactA } = fixture;
  const sellerAccount = await seller.session.mutation(
    api.workspaceCompanies.create,
    { workspaceId, name: 'account-a2' },
  );
  const results = await Promise.allSettled([
    manager.session.mutation(api.workspaceContacts.update, {
      operationId: 'relink-b',
      workspaceId,
      contactId: contactA,
      expectedRevision: 1,
      accountId: accountB,
    }),
    manager.session.mutation(api.workspaceContacts.update, {
      operationId: 'relink-a2',
      workspaceId,
      contactId: contactA,
      expectedRevision: 1,
      accountId: sellerAccount,
    }),
  ]);
  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');
  expect(fulfilled).toHaveLength(1);
  expect(rejected).toHaveLength(1);
  expect(String(rejected[0]?.reason)).toContain('CONTACT_CHANGED');
  const contact = await fixture.test.run((context) => context.db.get(contactA));
  expect(contact?.revision).toBe(2);
  expect([accountB, sellerAccount]).toContain(contact?.accountId);
});
