import { expect, it } from 'vitest';

import { m1Fixture, paginationOpts } from '../testing/contactFixtures';
import { api } from './_generated/api';

it('trashes and restores a contact, moving it between the active and trash views', async () => {
  const { workspaceId, seller, contactA } = await m1Fixture();
  expect(
    await seller.session.mutation(api.contactLifecycle.trash, {
      operationId: 'trash',
      workspaceId,
      contactId: contactA,
      expectedRevision: 1,
    }),
  ).toEqual({ revision: 2, changed: true });
  expect(
    await seller.session.query(api.workspaceContacts.get, {
      workspaceId,
      contactId: contactA,
    }),
  ).toBeNull();
  expect(
    (
      await seller.session.query(api.workspaceContacts.list, {
        workspaceId,
        paginationOpts,
      })
    ).page,
  ).toEqual([]);
  expect(
    (
      await seller.session.query(api.contactLifecycle.listTrash, {
        workspaceId,
        paginationOpts,
      })
    ).page,
  ).toMatchObject([
    {
      _id: contactA,
      revision: 2,
      permissions: { canUpdate: false, canTrash: false, canRestore: true },
    },
  ]);
  expect(
    await seller.session.query(api.contactLifecycle.getTrashed, {
      workspaceId,
      contactId: contactA,
    }),
  ).toMatchObject({ lastName: 'Synthetic' });
  await expect(
    seller.session.mutation(api.workspaceContacts.update, {
      operationId: 'edit-trashed',
      workspaceId,
      contactId: contactA,
      expectedRevision: 2,
      lastName: 'Edited',
    }),
  ).rejects.toThrow('CONTACT_NOT_FOUND');
  await expect(
    seller.session.mutation(api.contactLifecycle.trash, {
      operationId: 'trash-again',
      workspaceId,
      contactId: contactA,
      expectedRevision: 2,
    }),
  ).rejects.toThrow('CONTACT_NOT_FOUND');
  await expect(
    seller.session.mutation(api.contactLifecycle.restore, {
      operationId: 'restore-stale',
      workspaceId,
      contactId: contactA,
      expectedRevision: 1,
    }),
  ).rejects.toThrow('CONTACT_CHANGED');
  expect(
    await seller.session.mutation(api.contactLifecycle.restore, {
      operationId: 'restore',
      workspaceId,
      contactId: contactA,
      expectedRevision: 2,
    }),
  ).toEqual({ revision: 3, changed: true });
  expect(
    await seller.session.query(api.workspaceContacts.get, {
      workspaceId,
      contactId: contactA,
    }),
  ).toMatchObject({ revision: 3, accountName: 'account-a', deletedAt: null });
});

it('hides contacts of a trashed account without patching them and brings them back on account restore', async () => {
  const fixture = await m1Fixture();
  const { test, workspaceId, seller, accountA, contactA } = fixture;
  const before = await test.run((context) => context.db.get(contactA));
  await seller.session.mutation(api.accountLifecycle.trash, {
    operationId: 'trash-account',
    workspaceId,
    companyId: accountA,
    expectedRevision: 1,
  });
  for (const query of [
    api.workspaceContacts.get,
    api.contactLifecycle.getTrashed,
  ] as const)
    expect(
      await seller.session.query(query, { workspaceId, contactId: contactA }),
    ).toBeNull();
  for (const query of [
    api.workspaceContacts.list,
    api.contactLifecycle.listTrash,
  ] as const)
    expect(
      (await seller.session.query(query, { workspaceId, paginationOpts })).page,
    ).toEqual([]);
  await expect(
    seller.session.query(api.workspaceContacts.list, {
      workspaceId,
      paginationOpts,
      accountId: accountA,
    }),
  ).rejects.toThrow('COMPANY_NOT_FOUND');
  for (const [operationId, call] of [
    ['edit', api.workspaceContacts.update],
    ['trash', api.contactLifecycle.trash],
    ['restore', api.contactLifecycle.restore],
  ] as const)
    await expect(
      seller.session.mutation(call, {
        operationId,
        workspaceId,
        contactId: contactA,
        expectedRevision: 1,
      }),
    ).rejects.toThrow('CONTACT_NOT_FOUND');
  expect(
    (
      await seller.session.query(api.workspaceContacts.history, {
        workspaceId,
        contactId: contactA,
        paginationOpts,
      })
    ).page,
  ).toHaveLength(1);
  expect(await test.run((context) => context.db.get(contactA))).toEqual(before);
  await seller.session.mutation(api.accountLifecycle.restore, {
    operationId: 'restore-account',
    workspaceId,
    companyId: accountA,
    expectedRevision: 2,
  });
  expect(
    await seller.session.query(api.workspaceContacts.get, {
      workspaceId,
      contactId: contactA,
    }),
  ).toMatchObject({ revision: 1, accountId: accountA, deletedAt: null });
});

it('keeps another seller and other workspaces out of trashed contacts', async () => {
  const { workspaceId, seller, other, outsider, otherWorkspaceId, contactA } =
    await m1Fixture();
  await seller.session.mutation(api.contactLifecycle.trash, {
    operationId: 'trash',
    workspaceId,
    contactId: contactA,
    expectedRevision: 1,
  });
  expect(
    await other.session.query(api.contactLifecycle.getTrashed, {
      workspaceId,
      contactId: contactA,
    }),
  ).toBeNull();
  expect(
    (
      await other.session.query(api.contactLifecycle.listTrash, {
        workspaceId,
        paginationOpts,
      })
    ).page,
  ).toEqual([]);
  await expect(
    other.session.mutation(api.contactLifecycle.restore, {
      operationId: 'restore-other',
      workspaceId,
      contactId: contactA,
      expectedRevision: 2,
    }),
  ).rejects.toThrow('CONTACT_NOT_FOUND');
  await expect(
    outsider.session.mutation(api.contactLifecycle.restore, {
      operationId: 'restore-outsider',
      workspaceId: otherWorkspaceId,
      contactId: contactA,
      expectedRevision: 2,
    }),
  ).rejects.toThrow('CONTACT_NOT_FOUND');
});
