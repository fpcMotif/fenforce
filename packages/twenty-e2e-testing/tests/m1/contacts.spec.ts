import { expect, test, type Locator, type Page } from '@playwright/test';
import { makeFunctionReference } from 'convex/server';

import {
  companyUrl,
  createAccount,
  createContact,
  expectConvexError,
  getContact,
  listContacts,
  operationId,
  peopleRecords,
  peopleUrl,
  personUrl,
  prepareContactFixture,
  readContact,
  readContactHistory,
  readPeopleRows,
  signInFixtureEmployees,
  signInToPeople,
  trashAccount,
  traverseContacts,
  updateContact,
  type ContactPage,
  type StoredContact,
} from './contact-helpers';
import { chooseEmployee, employeeClient, localFixtureClient } from './helpers';
import { gateConvexSocket } from './query-helpers';
import {
  expectVisibleFocus,
  openEmployeePage,
  tabUntilFocused,
} from './replay-helpers';

const personHeading = (page: Page, name: string) =>
  page.getByRole('heading', { name, exact: true, level: 1 });

const personDetails = (page: Page) =>
  page.getByRole('region', { name: 'Person details', exact: true });

const chooseCompany = async (form: Locator, name: string) => {
  const company = form.getByRole('combobox', { name: 'Company', exact: true });
  await expect(
    company.getByRole('option', { name, exact: true }),
  ).toBeAttached();
  await company.selectOption({ label: name });
};

const contactSummary = (contact: StoredContact) => ({
  id: contact._id,
  accountId: contact.accountId,
  lastName: contact.lastName,
  email: contact.email,
  revision: contact.revision,
});

test.beforeAll(async ({ browser }) => {
  await signInFixtureEmployees(browser);
});

test('a seller creates a person, links a company, corrects the email, and both relation surfaces agree after refresh', async ({
  page,
}) => {
  const fixture = await prepareContactFixture();
  await signInToPeople(page, fixture.workspaceId, 'seller-a');
  await page.getByRole('button', { name: 'New person', exact: true }).click();
  const creator = page.getByRole('region', { name: 'New person', exact: true });
  const lastName = `Relation replay ${Date.now()}`;
  await creator
    .getByRole('textbox', { name: 'Last name', exact: true })
    .fill(`  ${lastName}  `);
  await chooseCompany(creator, 'account-a');
  await creator
    .getByRole('button', { name: 'Create person', exact: true })
    .click();
  await expect(personHeading(page, lastName)).toBeVisible();
  const contactId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
  const client = await employeeClient(page);
  await expect(
    readContact(client, fixture.workspaceId, contactId),
  ).resolves.toMatchObject({
    lastName,
    email: null,
    accountId: fixture.accountAId,
    accountName: 'account-a',
    createdByName: 'seller-a',
    revision: 1,
  });

  await page.getByRole('button', { name: 'Edit person', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Edit person', exact: true });
  const email = editor.getByRole('textbox', { name: 'Email', exact: true });
  await email.fill('not-an-email');
  await editor
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(editor.getByRole('alert')).toHaveText(
    'Enter a valid email address, or leave it blank.',
  );
  await expect(email).toHaveValue('not-an-email');
  await expect(
    readContact(client, fixture.workspaceId, contactId),
  ).resolves.toMatchObject({ email: null, revision: 1 });
  await email.fill(' Corrected.Person@Example.test ');
  await editor
    .getByRole('button', { name: 'Save changes', exact: true })
    .click();
  await expect(editor).toHaveCount(0);

  await page.reload();
  await expect(personHeading(page, lastName)).toBeVisible();
  const details = personDetails(page);
  await expect(
    details.getByText('Corrected.Person@Example.test', { exact: true }),
  ).toBeVisible();
  await expect(
    details.getByRole('link', { name: 'account-a', exact: true }),
  ).toBeVisible();
  await expect(details.getByText('seller-a', { exact: true })).toBeVisible();
  await expect(
    readContact(client, fixture.workspaceId, contactId),
  ).resolves.toMatchObject({
    lastName,
    email: 'Corrected.Person@Example.test',
    accountId: fixture.accountAId,
    revision: 2,
  });

  const duplicateId = await client.mutation(createContact, {
    operationId: operationId(),
    workspaceId: fixture.workspaceId,
    accountId: fixture.accountAId,
    lastName: `${lastName} duplicate email`,
    email: 'Corrected.Person@Example.test',
  });
  expect(duplicateId).not.toBe(contactId);

  await details.getByRole('link', { name: 'account-a', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'account-a', exact: true, level: 1 }),
  ).toBeVisible();
  const panel = page.getByRole('region', { name: 'People', exact: true });
  await expect(
    panel.getByRole('link', { name: lastName, exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole('link', {
      name: `${lastName} duplicate email`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    panel.getByText('Corrected.Person@Example.test', { exact: true }),
  ).toHaveCount(2);

  await panel.getByRole('button', { name: 'Add person', exact: true }).click();
  const panelCreator = panel.getByRole('region', {
    name: 'New person',
    exact: true,
  });
  await expect(panelCreator.getByRole('combobox')).toHaveCount(0);
  const fixedCompany = panelCreator.getByRole('textbox', {
    name: 'Company',
    exact: true,
  });
  await expect(fixedCompany).toHaveValue('account-a');
  await expect(fixedCompany).not.toBeEditable();
  const panelName = `${lastName} from company`;
  await panelCreator
    .getByRole('textbox', { name: 'Last name', exact: true })
    .fill(panelName);
  await panelCreator
    .getByRole('button', { name: 'Create person', exact: true })
    .click();
  await expect(panel.getByRole('status')).toHaveText(`${panelName} was added.`);
  await panel.getByRole('link', { name: panelName, exact: true }).click();
  await expect(personHeading(page, panelName)).toBeVisible();
  await expect(
    personDetails(page).getByRole('link', { name: 'account-a', exact: true }),
  ).toBeVisible();

  const linked = await traverseContacts(client, fixture.workspaceId, {
    accountId: fixture.accountAId,
  });
  expect(linked.map((contact) => contact.lastName).sort()).toEqual(
    ['Synthetic', lastName, `${lastName} duplicate email`, panelName].sort(),
  );
});

test('direct backend calls with foreign, forbidden, or trashed relations fail without partial writes', async ({
  browser,
  page,
}) => {
  const fixture = await prepareContactFixture();
  const { workspaceId } = fixture;
  await signInToPeople(page, workspaceId, 'seller-a');
  const seller = await employeeClient(page);
  const manager = await openEmployeePage(
    browser,
    peopleUrl(workspaceId),
    'manager-a',
  );
  try {
    await expect(personHeading(manager.page, 'People')).toBeVisible();
    const managerClient = await employeeClient(manager.page);

    const trashedAccountId = await seller.mutation(createAccount, {
      workspaceId,
      name: `Trashed relation ${Date.now()}`,
    });
    const orphanId = await seller.mutation(createContact, {
      operationId: operationId(),
      workspaceId,
      accountId: trashedAccountId,
      lastName: 'Orphan',
    });
    await seller.mutation(trashAccount, {
      workspaceId,
      companyId: trashedAccountId,
      expectedRevision: 1,
    });

    const everyone = async () =>
      (await traverseContacts(managerClient, workspaceId)).map(contactSummary);
    const before = {
      everyone: await everyone(),
      contactA: await readContact(seller, workspaceId, fixture.contactAId),
      historyA: await readContactHistory(
        seller,
        workspaceId,
        fixture.contactAId,
      ),
    };
    expect(before.contactA).toMatchObject({
      accountId: fixture.accountAId,
      lastName: 'Synthetic',
      email: null,
      revision: 1,
    });
    expect(before.historyA).toHaveLength(1);

    const relink = (accountId: string) =>
      seller.mutation(updateContact, {
        operationId: operationId(),
        workspaceId,
        contactId: fixture.contactAId,
        expectedRevision: 1,
        accountId,
      });
    const create = (targetWorkspaceId: string, accountId: string) =>
      seller.mutation(createContact, {
        operationId: operationId(),
        workspaceId: targetWorkspaceId,
        accountId,
        lastName: 'Rejected relation',
      });

    await expectConvexError(relink(fixture.accountBId), 'COMPANY_NOT_FOUND');
    await expectConvexError(relink(fixture.accountXId), 'COMPANY_NOT_FOUND');
    await expectConvexError(relink(trashedAccountId), 'COMPANY_NOT_FOUND');
    await expectConvexError(
      seller.mutation(updateContact, {
        operationId: operationId(),
        workspaceId,
        contactId: fixture.contactAId,
        expectedRevision: 1,
        lastName: '   ',
      }),
      'INVALID_CONTACT_LAST_NAME',
    );
    await expectConvexError(
      seller.mutation(updateContact, {
        operationId: operationId(),
        workspaceId,
        contactId: fixture.contactAId,
        expectedRevision: 1,
        accountId: fixture.accountBId,
        lastName: '',
      }),
      'COMPANY_NOT_FOUND',
    );
    await expectConvexError(
      create(workspaceId, fixture.accountBId),
      'COMPANY_NOT_FOUND',
    );
    await expectConvexError(
      create(workspaceId, fixture.accountXId),
      'COMPANY_NOT_FOUND',
    );
    await expectConvexError(
      create(fixture.otherWorkspaceId, fixture.accountAId),
      'COMPANY_NOT_FOUND',
    );
    await expectConvexError(
      create(workspaceId, trashedAccountId),
      'COMPANY_NOT_FOUND',
    );
    await expectConvexError(
      seller.mutation(updateContact, {
        operationId: operationId(),
        workspaceId: fixture.otherWorkspaceId,
        contactId: fixture.contactAId,
        expectedRevision: 1,
        lastName: 'Foreign workspace',
      }),
      'CONTACT_NOT_FOUND',
    );
    await expectConvexError(
      seller.mutation(updateContact, {
        operationId: operationId(),
        workspaceId,
        contactId: orphanId,
        expectedRevision: 1,
        lastName: 'Edited under trashed company',
      }),
      'CONTACT_NOT_FOUND',
    );
    await expectConvexError(
      seller.query(listContacts, {
        workspaceId,
        accountId: fixture.accountBId,
        paginationOpts: { numItems: 25, cursor: null },
      }),
      'COMPANY_NOT_FOUND',
    );
    await expectConvexError(
      seller.query(listContacts, {
        workspaceId,
        accountId: trashedAccountId,
        paginationOpts: { numItems: 25, cursor: null },
      }),
      'COMPANY_NOT_FOUND',
    );
    await expect(
      seller.query(getContact, {
        workspaceId: fixture.otherWorkspaceId,
        contactId: fixture.contactAId,
      }),
    ).resolves.toBeNull();
    await expect(
      seller.query(getContact, { workspaceId, contactId: orphanId }),
    ).resolves.toBeNull();

    expect(await everyone()).toEqual(before.everyone);
    expect(await readContact(seller, workspaceId, fixture.contactAId)).toEqual(
      before.contactA,
    );
    expect(
      await readContactHistory(seller, workspaceId, fixture.contactAId),
    ).toEqual(before.historyA);
    await expect(
      traverseContacts(seller, fixture.otherWorkspaceId),
    ).resolves.toEqual([]);
  } finally {
    await manager.context.close();
  }
});

test('a lost create acknowledgement and repeated create requests yield exactly one person', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const socket = await gateConvexSocket(page);
  const fixture = await prepareContactFixture();
  const { workspaceId } = fixture;
  await signInToPeople(page, workspaceId, 'seller-a');
  const client = await employeeClient(page);
  const lastName = `Lost ack replay ${Date.now()}`;
  const matching = () =>
    traverseContacts(client, workspaceId, { search: lastName });

  await page.getByRole('button', { name: 'New person', exact: true }).click();
  const creator = page.getByRole('region', { name: 'New person', exact: true });
  await creator
    .getByRole('textbox', { name: 'Last name', exact: true })
    .fill(lastName);
  await chooseCompany(creator, 'account-a');
  socket.severAfterNextMutationCommits();
  await creator
    .getByRole('button', { name: 'Create person', exact: true })
    .click();
  await expect.poll(() => socket.state.droppedMutationResponses).toBe(1);
  await expect(
    creator.getByText('Reconnecting… Your change will be confirmed', {
      exact: false,
    }),
  ).toBeVisible();
  await expect.poll(async () => (await matching()).length).toBe(1);

  socket.reconnect();
  await expect(personHeading(page, lastName)).toBeVisible({ timeout: 30_000 });
  const contactId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
  const created = await matching();
  expect(created.map((contact) => contact._id)).toEqual([contactId]);
  expect(created[0]).toMatchObject({
    revision: 1,
    accountId: fixture.accountAId,
  });
  await expect(
    readContactHistory(client, workspaceId, contactId),
  ).resolves.toHaveLength(1);

  const repeatedName = `${lastName} repeated`;
  const request = {
    operationId: operationId(),
    workspaceId,
    accountId: fixture.accountAId,
    lastName: repeatedName,
    email: 'repeat@example.test',
  };
  const first = await client.mutation(createContact, request);
  const second = await client.mutation(createContact, request);
  expect(second).toBe(first);
  await expectConvexError(
    client.mutation(createContact, {
      ...request,
      lastName: `${repeatedName} 2`,
    }),
    'OPERATION_ID_REUSED',
  );
  const repeated = await traverseContacts(client, workspaceId, {
    search: repeatedName,
  });
  expect(repeated.map((contact) => contact._id)).toEqual([first]);
  expect(await matching()).toHaveLength(2);
});

test('stale revisions and concurrent relinking keep the newer acknowledged state', async ({
  browser,
  page,
}) => {
  const fixture = await prepareContactFixture();
  const { workspaceId, contactAId } = fixture;
  await signInToPeople(page, workspaceId, 'seller-a');
  const seller = await employeeClient(page);
  const manager = await openEmployeePage(
    browser,
    peopleUrl(workspaceId),
    'manager-a',
  );
  try {
    await expect(personHeading(manager.page, 'People')).toBeVisible();
    const managerClient = await employeeClient(manager.page);

    await page.goto(personUrl(workspaceId, contactAId));
    await expect(personHeading(page, 'Synthetic')).toBeVisible();
    await page
      .getByRole('button', { name: 'Edit person', exact: true })
      .click();
    const editor = page.getByRole('region', {
      name: 'Edit person',
      exact: true,
    });
    await editor
      .getByRole('textbox', { name: 'Last name', exact: true })
      .fill('Synthetic obsolete');
    await expect(
      managerClient.mutation(updateContact, {
        operationId: operationId(),
        workspaceId,
        contactId: contactAId,
        expectedRevision: 1,
        email: 'manager@example.test',
      }),
    ).resolves.toEqual({ revision: 2 });
    await editor
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(editor.getByRole('alert')).toContainText(
      'changed while you were editing',
    );
    await expect(
      editor.getByRole('textbox', { name: 'Last name', exact: true }),
    ).toHaveValue('Synthetic obsolete');
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(
      personDetails(page).getByText('manager@example.test', { exact: true }),
    ).toBeVisible();
    await expect(
      readContact(seller, workspaceId, contactAId),
    ).resolves.toMatchObject({
      lastName: 'Synthetic',
      email: 'manager@example.test',
      revision: 2,
    });

    const outcomes = await Promise.allSettled([
      managerClient.mutation(updateContact, {
        operationId: operationId(),
        workspaceId,
        contactId: contactAId,
        expectedRevision: 2,
        accountId: fixture.accountBId,
      }),
      seller.mutation(updateContact, {
        operationId: operationId(),
        workspaceId,
        contactId: contactAId,
        expectedRevision: 2,
        email: 'seller@example.test',
      }),
    ]);
    const accepted = outcomes.filter(
      (outcome) => outcome.status === 'fulfilled',
    );
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === 'rejected',
    );
    expect(accepted).toEqual([{ status: 'fulfilled', value: { revision: 3 } }]);
    expect(rejected).toHaveLength(1);
    expect(['CONTACT_CHANGED', 'CONTACT_NOT_FOUND']).toContain(
      (rejected[0].reason as { data?: unknown }).data,
    );
    const managerWon = outcomes[0].status === 'fulfilled';
    const winner = managerWon
      ? { accountId: fixture.accountBId, email: 'manager@example.test' }
      : { accountId: fixture.accountAId, email: 'seller@example.test' };
    await expect(
      readContact(managerClient, workspaceId, contactAId),
    ).resolves.toMatchObject({ ...winner, revision: 3 });
    const history = await readContactHistory(
      managerClient,
      workspaceId,
      contactAId,
    );
    expect(history.map((entry) => entry.after.revision)).toEqual([1, 2, 3]);
    expect(history[2].after).toMatchObject({
      email: winner.email,
      account: { restricted: false, accountId: winner.accountId },
    });

    await expectConvexError(
      managerClient.mutation(updateContact, {
        operationId: operationId(),
        workspaceId,
        contactId: contactAId,
        expectedRevision: 2,
        accountId: managerWon ? fixture.accountAId : fixture.accountBId,
      }),
      'CONTACT_CHANGED',
    );
    await expect(
      readContact(managerClient, workspaceId, contactAId),
    ).resolves.toMatchObject({ ...winner, revision: 3 });

    if (managerWon) {
      await expect(personHeading(page, 'Person not found')).toBeVisible();
      await expect(page.getByText('account-b')).toHaveCount(0);
      await expect(
        seller.query(getContact, { workspaceId, contactId: contactAId }),
      ).resolves.toBeNull();
    } else {
      await expect(
        personDetails(page).getByText('seller@example.test', { exact: true }),
      ).toBeVisible();
    }
  } finally {
    await manager.context.close();
  }
});

test('seller search and pagination return only permitted people without protected labels', async ({
  browser,
  page,
}) => {
  const fixture = await prepareContactFixture();
  const { workspaceId } = fixture;
  await signInToPeople(page, workspaceId, 'seller-a');
  const seller = await employeeClient(page);
  const manager = await openEmployeePage(
    browser,
    peopleUrl(workspaceId),
    'manager-a',
  );
  try {
    await expect(personHeading(manager.page, 'People')).toBeVisible();
    const managerClient = await employeeClient(manager.page);
    const permittedNames = [
      'Needle Alpha 1',
      'Needle Alpha 2',
      'Needle Alpha 3',
    ];
    const protectedNames = ['Needle Bravo 1', 'Needle Bravo 2', 'Hidden Bravo'];
    for (const lastName of permittedNames)
      await seller.mutation(createContact, {
        operationId: operationId(),
        workspaceId,
        accountId: fixture.accountAId,
        lastName,
        email: 'shared@example.test',
      });
    for (const lastName of protectedNames)
      await managerClient.mutation(createContact, {
        operationId: operationId(),
        workspaceId,
        accountId: fixture.accountBId,
        lastName,
        email: 'shared@example.test',
      });

    let sellerPages = 0;
    const sellerAll = await traverseContacts(
      seller,
      workspaceId,
      {},
      1,
      (result) => {
        sellerPages++;
        expect(result.scannedCount).toBeLessThanOrEqual(100);
      },
    );
    expect(sellerPages).toBeGreaterThanOrEqual(4);
    expect(sellerAll.map((contact) => contact.lastName)).toEqual([
      ...permittedNames,
      'Synthetic',
    ]);
    expect(new Set(sellerAll.map((contact) => contact._id)).size).toBe(4);
    const sellerPayload = JSON.stringify(sellerAll);
    for (const protectedText of ['account-b', fixture.accountBId, 'Bravo'])
      expect(sellerPayload).not.toContain(protectedText);
    expect(
      (
        await traverseContacts(seller, workspaceId, { search: 'NEEDLE' }, 1)
      ).map((contact) => contact.lastName),
    ).toEqual(permittedNames);
    await expect(
      traverseContacts(seller, workspaceId, { search: 'bravo' }, 1),
    ).resolves.toEqual([]);

    const managerAll = await traverseContacts(
      managerClient,
      workspaceId,
      {},
      2,
    );
    expect(
      managerAll.map((contact) => [contact.accountName, contact.lastName]),
    ).toEqual([
      ...[...permittedNames, 'Synthetic'].map((name) => ['account-a', name]),
      ...['Hidden Bravo', 'Needle Bravo 1', 'Needle Bravo 2'].map((name) => [
        'account-b',
        name,
      ]),
    ]);
    expect(
      (
        await traverseContacts(managerClient, workspaceId, { search: 'needle' })
      ).map((contact) => contact.lastName),
    ).toEqual([...permittedNames, 'Needle Bravo 1', 'Needle Bravo 2']);

    await page.goto(`${peopleUrl(workspaceId)}&q=needle`);
    await expect(
      peopleRecords(page).getByText('3 loaded', { exact: true }),
    ).toBeVisible();
    expect(await readPeopleRows(page)).toEqual(
      permittedNames.map((lastName) => ({
        lastName,
        email: 'shared@example.test',
        company: 'account-a',
      })),
    );
    await expect(page.getByText('Bravo')).toHaveCount(0);

    await page.goto(`${peopleUrl(workspaceId)}&company=${fixture.accountBId}`);
    await expect(peopleRecords(page).getByRole('alert')).toContainText(
      'That company is unavailable',
    );
    await expect(page.getByText('account-b')).toHaveCount(0);
    await expect(page.getByText('Bravo')).toHaveCount(0);
    await peopleRecords(page)
      .getByRole('button', { name: 'Show all people', exact: true })
      .click();
    await expect(
      peopleRecords(page).getByText('4 loaded', { exact: true }),
    ).toBeVisible();
    expect((await readPeopleRows(page)).map((row) => row.lastName)).toEqual([
      ...permittedNames,
      'Synthetic',
    ]);

    await page.goto(`${peopleUrl(workspaceId)}&company=garbage`);
    await expect(peopleRecords(page).getByRole('alert')).toContainText(
      'That company is unavailable',
    );
    await page.goto(personUrl(workspaceId, 'garbage'));
    await expect(personHeading(page, 'Person not found')).toBeVisible();
  } finally {
    await manager.context.close();
  }
});

test('trashing a company hides its people and restoring it brings them back unchanged', async ({
  page,
}) => {
  const fixture = await prepareContactFixture();
  const { workspaceId, contactAId } = fixture;
  await signInToPeople(page, workspaceId, 'seller-a');
  const client = await employeeClient(page);
  const before = await readContact(client, workspaceId, contactAId);

  await page.goto(companyUrl(workspaceId, fixture.accountAId));
  const panel = page.getByRole('region', { name: 'People', exact: true });
  await expect(
    panel.getByRole('link', { name: 'Synthetic', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Move to trash', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm move to trash', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Trash', exact: true }),
  ).toBeVisible();

  await page.goto(peopleUrl(workspaceId));
  await expect(
    peopleRecords(page).getByText('No people yet', { exact: true }),
  ).toBeVisible();
  await page.goto(personUrl(workspaceId, contactAId));
  await expect(personHeading(page, 'Person not found')).toBeVisible();
  await page.goto(`/objects/people/trash?workspace=${workspaceId}`);
  await expect(page.getByText('Trash is empty', { exact: true })).toBeVisible();
  await expect(
    client.query(getContact, { workspaceId, contactId: contactAId }),
  ).resolves.toBeNull();
  await expect(traverseContacts(client, workspaceId)).resolves.toEqual([]);

  await page.goto(`/objects/companies/trash?workspace=${workspaceId}`);
  const trashedCompany = page.getByRole('region', {
    name: 'account-a',
    exact: true,
  });
  await trashedCompany
    .getByRole('button', { name: 'Restore', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Company restored');
  await expect(readContact(client, workspaceId, contactAId)).resolves.toEqual(
    before,
  );
  await page.goto(peopleUrl(workspaceId));
  await expect(
    peopleRecords(page).getByText('1 loaded', { exact: true }),
  ).toBeVisible();
  expect(await readPeopleRows(page)).toEqual([
    { lastName: 'Synthetic', email: '—', company: 'account-a' },
  ]);

  await page.goto(personUrl(workspaceId, contactAId));
  await page
    .getByRole('button', { name: 'Move to trash', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm move to trash', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'People trash', exact: true }),
  ).toBeVisible();
  const trashedPerson = page.getByRole('region', {
    name: 'Synthetic',
    exact: true,
  });
  await expect(trashedPerson).toContainText('account-a');
  await trashedPerson
    .getByRole('button', { name: 'Restore', exact: true })
    .click();
  await expect(page.getByRole('status')).toContainText('Person restored');
  await expect(readContact(client, workspaceId, contactAId)).resolves.toEqual({
    ...before,
    revision: 3,
    updatedAt: expect.any(Number),
    updatedBy: expect.any(String),
  });
});

test('an offboarded employee keeps readable attribution but loses access', async ({
  browser,
  page,
}) => {
  const fixture = await prepareContactFixture();
  const { workspaceId } = fixture;
  await signInToPeople(page, workspaceId, 'seller-b');
  const sellerB = await employeeClient(page);
  const lastName = `Offboarding replay ${Date.now()}`;
  const contactId = await sellerB.mutation(createContact, {
    operationId: operationId(),
    workspaceId,
    accountId: fixture.accountBId,
    lastName,
  });
  await page.goto(personUrl(workspaceId, contactId));
  await expect(personHeading(page, lastName)).toBeVisible();

  const administrator = await openEmployeePage(
    browser,
    `/settings/members?workspace=${workspaceId}`,
    'admin-a',
  );
  const manager = await openEmployeePage(
    browser,
    personUrl(workspaceId, contactId),
    'manager-a',
  );
  try {
    await administrator.page
      .getByRole('button', { name: 'Revoke access for seller-b', exact: true })
      .click();
    await expect(administrator.page.getByRole('status')).toContainText(
      'Access revoked',
    );
    await expect(personHeading(page, lastName)).toHaveCount(0, {
      timeout: 5000,
    });
    await expect(
      sellerB.query(getContact, { workspaceId, contactId }),
    ).rejects.toThrow();

    const managerPage = manager.page;
    await expect(personHeading(managerPage, lastName)).toBeVisible();
    await expect(
      personDetails(managerPage).getByText('seller-b', { exact: true }),
    ).toBeVisible();
    await managerPage
      .getByRole('button', { name: 'Edit person', exact: true })
      .click();
    const editor = managerPage.getByRole('region', {
      name: 'Edit person',
      exact: true,
    });
    await chooseCompany(editor, 'account-a');
    await editor
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(editor).toHaveCount(0);
    const details = personDetails(managerPage);
    await expect(
      details.getByRole('link', { name: 'account-a', exact: true }),
    ).toBeVisible();
    await expect(details.getByText('seller-b', { exact: true })).toBeVisible();
    await managerPage
      .getByRole('button', { name: 'Show history', exact: true })
      .click();
    const history = managerPage.getByRole('region', {
      name: 'Person history',
      exact: true,
    });
    await expect(history).toContainText('Changed by: seller-b');
    await expect(history).toContainText('Changed by: manager-a');

    const managerClient = await employeeClient(managerPage);
    await expect(
      readContact(managerClient, workspaceId, contactId),
    ).resolves.toMatchObject({
      accountId: fixture.accountAId,
      createdByName: 'seller-b',
      revision: 2,
    });
    expect(
      (await readContactHistory(managerClient, workspaceId, contactId)).map(
        (entry) => entry.actorName,
      ),
    ).toEqual(['seller-b', 'manager-a']);

    const sellerA = await openEmployeePage(
      browser,
      personUrl(workspaceId, contactId),
      'seller-a',
    );
    try {
      await expect(personHeading(sellerA.page, lastName)).toBeVisible();
      await expect(
        personDetails(sellerA.page).getByText('seller-b', { exact: true }),
      ).toBeVisible();
    } finally {
      await sellerA.context.close();
    }
  } finally {
    await administrator.context.close();
    await manager.context.close();
  }
});

test('a keyboard-only seller creates a person linked to a company', async ({
  page,
}) => {
  const fixture = await prepareContactFixture();
  const { workspaceId } = fixture;
  await signInToPeople(page, workspaceId, 'seller-a');
  await page.goto(peopleUrl(workspaceId));
  await expect(personHeading(page, 'People')).toBeVisible();

  const newPerson = page.getByRole('button', {
    name: 'New person',
    exact: true,
  });
  await tabUntilFocused(page, newPerson, 30);
  await expectVisibleFocus(newPerson);
  await page.keyboard.press('Enter');
  const creator = page.getByRole('region', { name: 'New person', exact: true });
  const lastNameField = creator.getByRole('textbox', {
    name: 'Last name',
    exact: true,
  });
  await expectVisibleFocus(lastNameField);
  const lastName = `Keyboard person ${Date.now()}`;
  await page.keyboard.type(lastName);
  await page.keyboard.press('Tab');
  await expectVisibleFocus(
    creator.getByRole('textbox', { name: 'Email', exact: true }),
  );
  await page.keyboard.type('keyboard@example.test');
  await page.keyboard.press('Tab');
  await expectVisibleFocus(
    creator.getByRole('searchbox', { name: 'Search companies', exact: true }),
  );
  await page.keyboard.type('account-a');
  await page.keyboard.press('Tab');
  const company = creator.getByRole('combobox', {
    name: 'Company',
    exact: true,
  });
  await expectVisibleFocus(company);
  await expect(
    company.getByRole('option', { name: 'account-a', exact: true }),
  ).toBeAttached();
  await page.keyboard.press('a');
  await expect(company).toHaveValue(fixture.accountAId);
  await page.keyboard.press('Tab');
  await expectVisibleFocus(
    creator.getByRole('button', { name: 'Cancel', exact: true }),
  );
  await page.keyboard.press('Tab');
  await expectVisibleFocus(
    creator.getByRole('button', { name: 'Create person', exact: true }),
  );
  await page.keyboard.press('Enter');
  await expect(personHeading(page, lastName)).toBeVisible();

  const contactId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
  const client = await employeeClient(page);
  await expect(
    readContact(client, workspaceId, contactId),
  ).resolves.toMatchObject({
    lastName,
    email: 'keyboard@example.test',
    accountId: fixture.accountAId,
    revision: 1,
  });
});

test('three thousand people have complete bounded queries and measured local latency', async ({
  browser,
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const seller = await openEmployeePage(
    browser,
    '/objects/companies',
    'seller-a',
  );
  try {
    await page.goto('/objects/companies');
    await chooseEmployee(page, 'manager-a');
    await expect(
      page.getByRole('heading', { name: 'Companies', exact: true }),
    ).toBeVisible();
    const fixtureClient = await localFixtureClient();
    const { workspaceId } = await fixtureClient.mutation(
      makeFunctionReference<
        'mutation',
        Record<string, never>,
        { workspaceId: string }
      >('mockAccountBenchmark:prepare'),
      {},
    );
    for (let start = 0; start < 1000; start += 100)
      await fixtureClient.mutation(
        makeFunctionReference<'mutation'>('mockAccountBenchmark:seedBatch'),
        { workspaceId, start, count: 100 },
      );
    for (let start = 0; start < 3000; start += 100)
      await fixtureClient.mutation(
        makeFunctionReference<'mutation'>(
          'mockAccountBenchmark:seedContactBatch',
        ),
        { workspaceId, start, count: 100 },
      );
    await page.goto(peopleUrl(workspaceId));
    await expect(personHeading(page, 'People')).toBeVisible();
    const managerClient = await employeeClient(page);
    await seller.page.goto(peopleUrl(workspaceId));
    await expect(personHeading(seller.page, 'People')).toBeVisible();
    const sellerClient = await employeeClient(seller.page);

    const timings: number[] = [];
    let maxScannedCount = 0;
    let maxReturnedBytes = 0;
    let emptyNonterminalPages = 0;
    const measured = async (
      actor: typeof managerClient,
      query: { search?: string } = {},
    ) => {
      const contacts: StoredContact[] = [];
      let cursor: string | null = null;
      for (let pages = 0; pages < 1000; pages++) {
        const startedAt = performance.now();
        const result: ContactPage = await actor.query(listContacts, {
          workspaceId,
          paginationOpts: { numItems: 25, cursor },
          ...query,
        });
        timings.push(performance.now() - startedAt);
        const returnedBytes = Buffer.byteLength(JSON.stringify(result));
        maxScannedCount = Math.max(maxScannedCount, result.scannedCount);
        maxReturnedBytes = Math.max(maxReturnedBytes, returnedBytes);
        expect(result.scannedCount).toBeLessThanOrEqual(100);
        expect(returnedBytes).toBeLessThanOrEqual(100_000);
        contacts.push(...result.page);
        if (result.isDone) return contacts;
        if (result.page.length === 0) emptyNonterminalPages++;
        expect(result.continueCursor).not.toBe(cursor);
        cursor = result.continueCursor;
      }
      throw new Error('The contact workload did not exhaust its fixture');
    };

    const expectedNames = Array.from(
      { length: 3000 },
      (_, offset) =>
        `Contact ${String(offset).padStart(4, '0')}${offset === 2999 ? ' needle' : ''}`,
    );
    const managerAll = await measured(managerClient);
    expect(managerAll.map((contact) => contact.lastName)).toEqual(
      expectedNames,
    );
    expect(new Set(managerAll.map((contact) => contact._id)).size).toBe(3000);
    expect(
      (await measured(managerClient, { search: 'NEEDLE' })).map(
        (contact) => contact.lastName,
      ),
    ).toEqual(['Contact 2999 needle']);
    const sellerNames = expectedNames.filter(
      (_, offset) => Math.floor(offset / 3) % 2 === 1,
    );
    expect(
      (await measured(sellerClient)).map((contact) => contact.lastName),
    ).toEqual(sellerNames);
    expect(
      (await measured(sellerClient, { search: 'contact 000' })).map(
        (contact) => contact.lastName,
      ),
    ).toEqual(sellerNames.filter((name) => name.startsWith('Contact 000')));

    const firstQueryMs = timings[0];
    const warm = timings.slice(1).sort((left, right) => left - right);
    const warmP95Ms = warm[Math.ceil(warm.length * 0.95) - 1];
    expect(warmP95Ms).toBeLessThanOrEqual(500);
    await testInfo.attach('contact-query-workload', {
      body: JSON.stringify(
        {
          workspaceId,
          accounts: 1000,
          contacts: 3000,
          requests: timings.length,
          firstQueryMs,
          warmP95Ms,
          maxScannedCount,
          maxReturnedBytes,
          emptyNonterminalPages,
          scope:
            'Local anonymous Convex HTTP queries with simulated OIDC. scannedCount counts contact rows examined per page; account index reads for the seller scope are bounded by maximumRowsRead. No production or daily billing claim.',
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
  } finally {
    await seller.context.close();
  }
});
