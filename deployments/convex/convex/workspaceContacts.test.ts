import { expect, it } from 'vitest';

import { m1Fixture, paginationOpts } from '../testing/contactFixtures';
import { api } from './_generated/api';

const contactState = async (fixture: Awaited<ReturnType<typeof m1Fixture>>) =>
  fixture.test.run(async (context) => ({
    contact: await context.db.get(fixture.contactA),
    contacts: await context.db.query('workspaceContacts').collect(),
    audits: await context.db.query('contactAudit').collect(),
  }));

it('creates, reads, edits and lists a contact with the values that were saved', async () => {
  const { workspaceId, seller, accountA } = await m1Fixture();
  const contactId = await seller.session.mutation(
    api.workspaceContacts.create,
    {
      operationId: 'create-1',
      workspaceId,
      accountId: accountA,
      lastName: '  Lovelace ',
      email: ' ada@example.test ',
    },
  );
  expect(
    await seller.session.query(api.workspaceContacts.get, {
      workspaceId,
      contactId,
    }),
  ).toMatchObject({
    accountId: accountA,
    accountName: 'account-a',
    lastName: 'Lovelace',
    email: 'ada@example.test',
    revision: 1,
    createdBy: seller.memberId,
    createdByName: 'Seller A',
    deletedAt: null,
    permissions: { canUpdate: true, canTrash: true, canRestore: false },
  });
  expect(
    await seller.session.mutation(api.workspaceContacts.update, {
      operationId: 'update-1',
      workspaceId,
      contactId,
      expectedRevision: 1,
      email: '',
    }),
  ).toEqual({ revision: 2 });
  const listed = await seller.session.query(api.workspaceContacts.list, {
    workspaceId,
    paginationOpts,
  });
  expect(
    listed.page.map((contact) => [contact.lastName, contact.email]),
  ).toEqual([
    ['Lovelace', null],
    ['Synthetic', null],
  ]);
  expect(listed.page[0]).not.toHaveProperty('sourceId');
});

it('rejects invalid fields without writing and allows duplicate emails as separate people', async () => {
  const fixture = await m1Fixture();
  const { workspaceId, seller, accountA } = fixture;
  for (const [lastName, email, code] of [
    ['', null, 'INVALID_CONTACT_LAST_NAME'],
    ['x'.repeat(101), null, 'INVALID_CONTACT_LAST_NAME'],
    ['Valid', 'not-an-email', 'INVALID_CONTACT_EMAIL'],
  ] as const)
    await expect(
      seller.session.mutation(api.workspaceContacts.create, {
        operationId: `invalid-${code}-${lastName.length}`,
        workspaceId,
        accountId: accountA,
        lastName,
        email,
      }),
    ).rejects.toThrow(code);
  for (const operationId of ['twin-1', 'twin-2'])
    await seller.session.mutation(api.workspaceContacts.create, {
      operationId,
      workspaceId,
      accountId: accountA,
      lastName: 'Twin',
      email: 'same@example.test',
    });
  const { contacts } = await contactState(fixture);
  expect(
    contacts.filter((contact) => contact.lastName === 'Twin'),
  ).toHaveLength(2);
  expect(contacts).toHaveLength(3);
});

it('M1-F01-relation: Seller A cannot link contact-a to account-b and an empty last name changes nothing', async () => {
  const fixture = await m1Fixture();
  const { workspaceId, seller, accountB, contactA } = fixture;
  const before = await contactState(fixture);
  await expect(
    seller.session.mutation(api.workspaceContacts.update, {
      operationId: 'relink-denied',
      workspaceId,
      contactId: contactA,
      expectedRevision: 1,
      accountId: accountB,
    }),
  ).rejects.toThrow('COMPANY_NOT_FOUND');
  await expect(
    seller.session.mutation(api.workspaceContacts.update, {
      operationId: 'relink-denied-invalid',
      workspaceId,
      contactId: contactA,
      expectedRevision: 1,
      accountId: accountB,
      lastName: '',
    }),
  ).rejects.toThrow('COMPANY_NOT_FOUND');
  await expect(
    seller.session.mutation(api.workspaceContacts.update, {
      operationId: 'empty-name',
      workspaceId,
      contactId: contactA,
      expectedRevision: 1,
      lastName: '  ',
    }),
  ).rejects.toThrow('INVALID_CONTACT_LAST_NAME');
  expect(await contactState(fixture)).toEqual(before);
});

it('rejects create on missing, foreign, inaccessible and trashed accounts with one code before field checks', async () => {
  const fixture = await m1Fixture();
  const { test, workspaceId, seller, accountA, accountB, accountX } = fixture;
  const missing = await test.run(async (context) => {
    const id = await context.db.insert('workspaceCompanies', {
      workspaceId,
      revision: 1,
      name: 'gone',
      nameSortKey: 'gone',
      domainName: {
        primaryLinkUrl: '',
        primaryLinkLabel: '',
        secondaryLinks: [],
      },
      accountOwnerId: seller.memberId,
      createdBy: seller.memberId,
      updatedBy: seller.memberId,
      createdAt: 0,
      updatedAt: 0,
      deletedAt: null,
    });
    await context.db.delete(id);
    return id;
  });
  await seller.session.mutation(api.accountLifecycle.trash, {
    operationId: 'trash-a',
    workspaceId,
    companyId: accountA,
    expectedRevision: 1,
  });
  for (const accountId of [missing, accountX, accountB, accountA])
    await expect(
      seller.session.mutation(api.workspaceContacts.create, {
        operationId: `create-${accountId}`,
        workspaceId,
        accountId,
        lastName: '',
        email: 'invalid',
      }),
    ).rejects.toThrow('COMPANY_NOT_FOUND');
});

it('lets a manager relink across sellers, moving visibility and keeping restricted history labels private', async () => {
  const { workspaceId, seller, other, manager, accountA, accountB, contactA } =
    await m1Fixture();
  expect(
    await manager.session.mutation(api.workspaceContacts.update, {
      operationId: 'relink',
      workspaceId,
      contactId: contactA,
      expectedRevision: 1,
      accountId: accountB,
    }),
  ).toEqual({ revision: 2 });
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
  await expect(
    seller.session.query(api.workspaceContacts.history, {
      workspaceId,
      contactId: contactA,
      paginationOpts,
    }),
  ).rejects.toThrow('CONTACT_NOT_FOUND');
  const accountContacts = await other.session.query(
    api.workspaceContacts.list,
    { workspaceId, paginationOpts, accountId: accountB },
  );
  expect(accountContacts.page.map((contact) => contact._id)).toEqual([
    contactA,
  ]);
  const history = await other.session.query(api.workspaceContacts.history, {
    workspaceId,
    contactId: contactA,
    paginationOpts,
  });
  expect(history.page).toMatchObject([
    {
      actorName: 'Seller A',
      before: null,
      after: { account: { restricted: true } },
    },
    {
      actorId: manager.memberId,
      actorName: 'Manager',
      before: { account: { restricted: true }, revision: 1 },
      after: {
        account: {
          restricted: false,
          accountId: accountB,
          accountName: 'account-b',
        },
        revision: 2,
      },
    },
  ]);
  expect(JSON.stringify(history)).not.toContain(accountA);
  expect(JSON.stringify(history)).not.toContain('account-a');
});

it('rejects a stale revision and a racing relink without overwriting the acknowledged value', async () => {
  const fixture = await m1Fixture();
  const { workspaceId, seller, manager, accountB, contactA } = fixture;
  const otherSellerAccount = await seller.session.mutation(
    api.workspaceCompanies.create,
    { workspaceId, name: 'account-a2' },
  );
  await seller.session.mutation(api.workspaceContacts.update, {
    operationId: 'first',
    workspaceId,
    contactId: contactA,
    expectedRevision: 1,
    accountId: otherSellerAccount,
  });
  await expect(
    manager.session.mutation(api.workspaceContacts.update, {
      operationId: 'racing',
      workspaceId,
      contactId: contactA,
      expectedRevision: 1,
      accountId: accountB,
    }),
  ).rejects.toThrow('CONTACT_CHANGED');
  await expect(
    seller.session.mutation(api.workspaceContacts.update, {
      operationId: 'stale',
      workspaceId,
      contactId: contactA,
      expectedRevision: 1,
      lastName: 'Older',
    }),
  ).rejects.toThrow('CONTACT_CHANGED');
  const { contact, audits } = await contactState(fixture);
  expect(contact).toMatchObject({
    accountId: otherSellerAccount,
    lastName: 'Synthetic',
    revision: 2,
  });
  expect(audits).toHaveLength(2);
});

it('rejects a relink to a trashed or foreign account without changes', async () => {
  const fixture = await m1Fixture();
  const { workspaceId, manager, other, accountB, accountX, contactA } = fixture;
  await other.session.mutation(api.accountLifecycle.trash, {
    operationId: 'trash-b',
    workspaceId,
    companyId: accountB,
    expectedRevision: 1,
  });
  const before = await contactState(fixture);
  for (const accountId of [accountB, accountX])
    await expect(
      manager.session.mutation(api.workspaceContacts.update, {
        operationId: `relink-${accountId}`,
        workspaceId,
        contactId: contactA,
        expectedRevision: 1,
        accountId,
      }),
    ).rejects.toThrow('COMPANY_NOT_FOUND');
  expect(await contactState(fixture)).toEqual(before);
});

it('denies administrators, other workspaces and disabled sellers while keeping attribution', async () => {
  const fixture = await m1Fixture();
  const {
    test,
    admin,
    workspaceId,
    seller,
    manager,
    outsider,
    otherWorkspaceId,
    accountA,
    contactA,
  } = fixture;
  await expect(
    admin.query(api.workspaceContacts.list, { workspaceId, paginationOpts }),
  ).rejects.toThrow('FORBIDDEN');
  await expect(
    outsider.session.query(api.workspaceContacts.get, {
      workspaceId,
      contactId: contactA,
    }),
  ).rejects.toThrow('FORBIDDEN');
  expect(
    await outsider.session.query(api.workspaceContacts.get, {
      workspaceId: otherWorkspaceId,
      contactId: contactA,
    }),
  ).toBeNull();
  for (const call of [
    outsider.session.mutation(api.workspaceContacts.update, {
      operationId: 'outsider-update',
      workspaceId: otherWorkspaceId,
      contactId: contactA,
      expectedRevision: 1,
      lastName: '',
    }),
    outsider.session.query(api.workspaceContacts.history, {
      workspaceId: otherWorkspaceId,
      contactId: contactA,
      paginationOpts,
    }),
  ])
    await expect(call).rejects.toThrow('CONTACT_NOT_FOUND');
  await expect(
    outsider.session.mutation(api.workspaceContacts.create, {
      operationId: 'outsider-create',
      workspaceId: otherWorkspaceId,
      accountId: accountA,
      lastName: 'Leak',
    }),
  ).rejects.toThrow('COMPANY_NOT_FOUND');
  expect(
    (
      await outsider.session.query(api.workspaceContacts.list, {
        workspaceId: otherWorkspaceId,
        paginationOpts,
      })
    ).page,
  ).toEqual([]);

  await test.run((context) =>
    context.db.patch(seller.memberId, { active: false }),
  );
  await expect(
    seller.session.query(api.workspaceContacts.list, {
      workspaceId,
      paginationOpts,
    }),
  ).rejects.toThrow('FORBIDDEN');
  await expect(
    seller.session.mutation(api.workspaceContacts.update, {
      operationId: 'disabled-update',
      workspaceId,
      contactId: contactA,
      expectedRevision: 1,
      lastName: 'Late',
    }),
  ).rejects.toThrow('FORBIDDEN');
  expect(
    await manager.session.query(api.workspaceContacts.get, {
      workspaceId,
      contactId: contactA,
    }),
  ).toMatchObject({ createdBy: seller.memberId, createdByName: 'Seller A' });
  expect(
    (
      await manager.session.query(api.workspaceContacts.history, {
        workspaceId,
        contactId: contactA,
        paginationOpts,
      })
    ).page,
  ).toMatchObject([{ actorId: seller.memberId, actorName: 'Seller A' }]);
});

it('moves contact access with an account reassignment without writing the contact', async () => {
  const fixture = await m1Fixture();
  const { workspaceId, seller, other, manager, accountA, contactA } = fixture;
  const before = await contactState(fixture);
  await manager.session.mutation(api.workspaceCompanies.update, {
    workspaceId,
    companyId: accountA,
    expectedRevision: 1,
    accountOwnerId: other.memberId,
  });
  expect(
    await seller.session.query(api.workspaceContacts.get, {
      workspaceId,
      contactId: contactA,
    }),
  ).toBeNull();
  expect(
    await other.session.query(api.workspaceContacts.get, {
      workspaceId,
      contactId: contactA,
    }),
  ).toMatchObject({ revision: 1, accountName: 'account-a' });
  expect(await contactState(fixture)).toEqual(before);
});
