import { expect, type Browser, type Page } from '@playwright/test';
import type { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';

import { chooseEmployee, localFixtureClient } from './helpers';

export type ContactFixture = {
  workspaceId: string;
  otherWorkspaceId: string;
  accountAId: string;
  accountBId: string;
  accountXId: string;
  contactAId: string;
};

export type StoredContact = {
  _id: string;
  accountId: string;
  accountName: string;
  lastName: string;
  email: string | null;
  revision: number;
  createdBy: string;
  createdByName: string;
  deletedAt: number | null;
};

type ContactLookup = { workspaceId: string; contactId: string };

type ContactListArguments = {
  search?: string;
  accountId?: string;
};

export type ContactPage = {
  page: StoredContact[];
  continueCursor: string;
  isDone: boolean;
  scannedCount: number;
};

type HistoryAccount =
  | { restricted: false; accountId: string; accountName: string }
  | { restricted: true };

export type ContactHistoryEntry = {
  actorName: string;
  before: {
    account: HistoryAccount;
    email: string | null;
    revision: number;
  } | null;
  after: {
    account: HistoryAccount;
    lastName: string;
    email: string | null;
    revision: number;
    deletedAt: number | null;
  };
};

export const getContact = makeFunctionReference<
  'query',
  ContactLookup,
  StoredContact | null
>('workspaceContacts:get');

export const listContacts = makeFunctionReference<
  'query',
  ContactListArguments & {
    workspaceId: string;
    paginationOpts: { numItems: number; cursor: string | null };
  },
  ContactPage
>('workspaceContacts:list');

export const createContact = makeFunctionReference<
  'mutation',
  {
    operationId: string;
    workspaceId: string;
    accountId: string;
    lastName: string;
    email?: string | null;
  },
  string
>('workspaceContacts:create');

export const updateContact = makeFunctionReference<
  'mutation',
  ContactLookup & {
    operationId: string;
    expectedRevision: number;
    lastName?: string;
    email?: string | null;
    accountId?: string;
  },
  { revision: number }
>('workspaceContacts:update');

const contactHistory = makeFunctionReference<
  'query',
  ContactLookup & {
    paginationOpts: { numItems: number; cursor: string | null };
  },
  { page: ContactHistoryEntry[]; isDone: boolean }
>('workspaceContacts:history');

export const createAccount = makeFunctionReference<
  'mutation',
  { workspaceId: string; name: string },
  string
>('workspaceCompanies:create');

export const trashAccount = makeFunctionReference<
  'mutation',
  { workspaceId: string; companyId: string; expectedRevision: number },
  { revision: number; changed: boolean }
>('accountLifecycle:trash');

const FIXTURE_SUBJECTS = ['seller-a', 'seller-b', 'manager-a', 'admin-a'];

export const signInFixtureEmployees = async (browser: Browser) => {
  for (const subject of FIXTURE_SUBJECTS) {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto('/objects/companies');
      await chooseEmployee(page, subject);
      await page.waitForFunction(() =>
        Object.keys(localStorage).some((key) =>
          key.startsWith('__convexAuthJWT'),
        ),
      );
    } finally {
      await context.close();
    }
  }
};

export const prepareContactFixture = async (): Promise<ContactFixture> => {
  const client = await localFixtureClient();
  return client.mutation(
    makeFunctionReference<'mutation', Record<string, never>, ContactFixture>(
      'mockBrowserReplay:prepareContactFixture',
    ),
    {},
  );
};

export const peopleUrl = (workspaceId: string) =>
  `/objects/people?workspace=${workspaceId}`;

export const personUrl = (workspaceId: string, contactId: string) =>
  `/object/person/${contactId}?workspace=${workspaceId}`;

export const companyUrl = (workspaceId: string, companyId: string) =>
  `/object/company/${companyId}?workspace=${workspaceId}`;

export const signInToPeople = async (
  page: Page,
  workspaceId: string,
  subject: string,
) => {
  await page.goto(peopleUrl(workspaceId));
  await chooseEmployee(page, subject);
  await expect(
    page.getByRole('heading', { name: 'People', exact: true, level: 1 }),
  ).toBeVisible();
};

export const operationId = () => crypto.randomUUID();

export const readContact = async (
  client: ConvexHttpClient,
  workspaceId: string,
  contactId: string,
) => {
  const contact = await client.query(getContact, { workspaceId, contactId });
  if (contact === null) throw new Error('The person is not readable');
  return contact;
};

export const readContactHistory = async (
  client: ConvexHttpClient,
  workspaceId: string,
  contactId: string,
) => {
  const history = await client.query(contactHistory, {
    workspaceId,
    contactId,
    paginationOpts: { numItems: 100, cursor: null },
  });
  expect(history.isDone).toBe(true);
  return history.page;
};

export const traverseContacts = async (
  client: ConvexHttpClient,
  workspaceId: string,
  query: ContactListArguments = {},
  numItems = 25,
  onPage: (page: ContactPage) => void = () => undefined,
) => {
  const contacts: StoredContact[] = [];
  let cursor: string | null = null;
  for (let pages = 0; pages < 1000; pages++) {
    const result: ContactPage = await client.query(listContacts, {
      workspaceId,
      paginationOpts: { numItems, cursor },
      ...query,
    });
    onPage(result);
    contacts.push(...result.page);
    if (result.isDone) return contacts;
    expect(result.continueCursor).not.toBe(cursor);
    cursor = result.continueCursor;
  }
  throw new Error('The contact traversal did not finish');
};

export const expectConvexError = async (
  operation: Promise<unknown>,
  code: string,
) => {
  await expect(operation).rejects.toMatchObject({ data: code });
};

export const peopleRecords = (page: Page) =>
  page.getByRole('region', { name: 'People', exact: true });

export const readPeopleRows = (page: Page) =>
  peopleRecords(page)
    .getByRole('table')
    .locator('tbody tr')
    .evaluateAll((rows) =>
      rows.map((row) => {
        const cells = [...row.querySelectorAll('td')].map(
          (cell) => cell.textContent?.trim() ?? '',
        );
        return { lastName: cells[0], email: cells[1], company: cells[2] };
      }),
    );
