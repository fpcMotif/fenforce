import { expect, test, type Page } from '@playwright/test';
import type { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';

import { chooseEmployee, employeeClient, localFixtureClient } from './helpers';
import {
  companyRecords,
  expectSameCompanies,
  loadAllCompanyRows,
  prepareBenchmarkWorkspace,
  traverseCompanies,
  type AccountIndustry,
  type AccountListQuery,
} from './query-helpers';

const SEEDED_OFFSETS = [
  ...Array.from({ length: 120 }, (_, offset) => offset),
  999,
];

const fixtureName = (offset: number) =>
  `Benchmark ${String(offset).padStart(4, '0')}${offset === 999 ? ' needle' : ''}`;

const fixtureIndustry = (offset: number): AccountIndustry | null => {
  if (offset % 3 === 0) return null;
  return offset % 3 === 1 ? 'services' : 'manufacturing';
};

const isSellerOwned = (offset: number) => offset % 2 === 1;

const expectedNames = (
  include: (offset: number) => boolean,
  sortDirection: 'asc' | 'desc' = 'asc',
) => {
  const names = SEEDED_OFFSETS.filter(include).map(fixtureName);
  return sortDirection === 'asc' ? names : names.reverse();
};

const openCompanies = async (page: Page, workspaceId: string) => {
  await page.goto(`/objects/companies?workspace=${workspaceId}`);
  await expect(
    page.getByRole('heading', { name: 'Companies', exact: true }),
  ).toBeVisible();
};

const searchCompanies = async (page: Page, search: string) => {
  const searchbox = companyRecords(page).getByRole('searchbox', {
    name: 'Search companies',
  });
  await searchbox.fill(search);
  await searchbox.press('Enter');
};

const filterIndustry = (page: Page, label: string) =>
  companyRecords(page)
    .getByRole('combobox', { name: 'Filter by industry' })
    .selectOption({ label });

const expectListMatches = async (
  page: Page,
  workspaceId: string,
  query: AccountListQuery,
  names: string[],
) => {
  const rows = await loadAllCompanyRows(page, names.length);
  expect(rows.map((row) => row.name)).toEqual(names);
  const traversal = await traverseCompanies(
    await employeeClient(page),
    workspaceId,
    query,
  );
  expectSameCompanies(rows, traversal);
  return rows;
};

test('search, filters, sort, pagination, and saved views agree with the backend', async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  const sellerContext = await browser.newContext();
  try {
    const sellerPage = await sellerContext.newPage();
    await sellerPage.goto('/objects/companies');
    await chooseEmployee(sellerPage, 'seller-a');
    await page.goto('/objects/companies');
    await chooseEmployee(page, 'manager-a');
    await expect(
      page.getByRole('heading', { name: 'Companies', exact: true }),
    ).toBeVisible();
    await expect(
      sellerPage.getByRole('heading', { name: 'Companies', exact: true }),
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
    const seedBatch = makeFunctionReference<
      'mutation',
      { workspaceId: string; start: number; count: number },
      { inserted: number }
    >('mockAccountBenchmark:seedBatch');
    for (const [start, count] of [
      [0, 100],
      [100, 20],
      [999, 1],
    ])
      await fixtureClient.mutation(seedBatch, { workspaceId, start, count });

    await openCompanies(page, workspaceId);
    await expectListMatches(
      page,
      workspaceId,
      {},
      expectedNames(() => true),
    );

    await searchCompanies(page, 'MARK 011');
    await expect(page).toHaveURL(/[?&]q=MARK(\+|%20)011/);
    await expectListMatches(
      page,
      workspaceId,
      { search: 'MARK 011' },
      expectedNames((offset) => offset >= 110 && offset <= 119),
    );
    await searchCompanies(page, 'NEEDLE');
    await expectListMatches(page, workspaceId, { search: 'NEEDLE' }, [
      'Benchmark 0999 needle',
    ]);
    await companyRecords(page)
      .getByRole('button', { name: 'Clear search', exact: true })
      .click();
    await expect(page).not.toHaveURL(/[?&]q=/);

    await filterIndustry(page, 'Services');
    await expect(page).toHaveURL(/[?&]industry=services/);
    await expectListMatches(
      page,
      workspaceId,
      { filters: { industry: 'services' } },
      expectedNames((offset) => fixtureIndustry(offset) === 'services'),
    );

    await filterIndustry(page, 'No industry');
    await expect(page).toHaveURL(/[?&]industry=none/);
    await expectListMatches(
      page,
      workspaceId,
      { filters: { industry: null } },
      expectedNames((offset) => fixtureIndustry(offset) === null),
    );

    await companyRecords(page)
      .getByRole('button', { name: 'Sort: Name A–Z', exact: true })
      .click();
    await expect(page).toHaveURL(/[?&]sort=desc/);
    await expectListMatches(
      page,
      workspaceId,
      { filters: { industry: null }, sortDirection: 'desc' },
      expectedNames((offset) => fixtureIndustry(offset) === null, 'desc'),
    );

    await searchCompanies(page, 'MARK 00');
    const viewQuery: AccountListQuery = {
      search: 'MARK 00',
      filters: { industry: null },
      sortDirection: 'desc',
    };
    const viewNames = expectedNames(
      (offset) => offset < 100 && fixtureIndustry(offset) === null,
      'desc',
    );
    const viewRows = await expectListMatches(
      page,
      workspaceId,
      viewQuery,
      viewNames,
    );

    const viewName = `No industry descending ${Date.now()}`;
    const records = companyRecords(page);
    await records
      .getByRole('button', { name: 'Save current view', exact: true })
      .click();
    const saveForm = records.getByRole('form', { name: 'Save view' });
    await saveForm
      .getByRole('textbox', { name: 'View name', exact: true })
      .fill(viewName);
    await saveForm
      .getByRole('button', { name: 'Save view', exact: true })
      .click();
    await expect(saveForm).toBeHidden();
    await expect(page).toHaveURL(/[?&]view=/);
    const savedViews = records.getByRole('navigation', { name: 'Saved views' });
    const viewButton = savedViews.getByRole('button', {
      name: viewName,
      exact: true,
    });
    await expect(viewButton).toHaveAttribute('aria-current', 'true');

    await page.reload();
    await expect(viewButton).toHaveAttribute('aria-current', 'true');
    await expect(
      records.getByRole('searchbox', { name: 'Search companies' }),
    ).toHaveValue('MARK 00');
    await expect(
      records.getByRole('combobox', { name: 'Filter by industry' }),
    ).toHaveValue('none');
    await expect(
      records.getByRole('button', { name: 'Sort: Name Z–A', exact: true }),
    ).toBeVisible();
    expectSameCompanies(
      await expectListMatches(page, workspaceId, viewQuery, viewNames),
      viewRows,
    );

    await records
      .getByRole('button', { name: 'All companies', exact: true })
      .click();
    await expect(page).not.toHaveURL(/[?&](q|industry|sort|view)=/);
    await expectListMatches(
      page,
      workspaceId,
      {},
      expectedNames(() => true),
    );
    await viewButton.click();
    await expect(viewButton).toHaveAttribute('aria-current', 'true');
    expectSameCompanies(
      await loadAllCompanyRows(page, viewNames.length),
      viewRows,
    );

    await records
      .getByRole('button', { name: `Delete view ${viewName}`, exact: true })
      .click();
    await records
      .getByRole('region', { name: 'Confirm delete view' })
      .getByRole('button', { name: 'Delete view', exact: true })
      .click();
    await expect(viewButton).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]view=/);
    await expect(page).toHaveURL(/[?&]industry=none/);
    await page.reload();
    await expect(
      records.getByRole('button', { name: 'All companies', exact: true }),
    ).toBeVisible();
    await expect(viewButton).toHaveCount(0);

    await openCompanies(sellerPage, workspaceId);
    await expect(
      companyRecords(sellerPage).getByRole('combobox', {
        name: 'Filter by account owner',
      }),
    ).toHaveCount(0);
    await expectListMatches(
      sellerPage,
      workspaceId,
      {},
      expectedNames(isSellerOwned),
    );
    await searchCompanies(sellerPage, 'mark 011');
    await expectListMatches(
      sellerPage,
      workspaceId,
      { search: 'mark 011' },
      expectedNames(
        (offset) => isSellerOwned(offset) && offset >= 110 && offset <= 119,
      ),
    );
    await companyRecords(sellerPage)
      .getByRole('button', { name: 'Clear search', exact: true })
      .click();
    await filterIndustry(sellerPage, 'Services');
    await expectListMatches(
      sellerPage,
      workspaceId,
      { filters: { industry: 'services' } },
      expectedNames(
        (offset) =>
          isSellerOwned(offset) && fixtureIndustry(offset) === 'services',
      ),
    );
    await companyRecords(sellerPage)
      .getByRole('button', { name: 'Sort: Name A–Z', exact: true })
      .click();
    await expectListMatches(
      sellerPage,
      workspaceId,
      { filters: { industry: 'services' }, sortDirection: 'desc' },
      expectedNames(
        (offset) =>
          isSellerOwned(offset) && fixtureIndustry(offset) === 'services',
        'desc',
      ),
    );
  } finally {
    await sellerContext.close();
  }
});

const OWNER_FIXTURE_OFFSETS = Array.from({ length: 40 }, (_, offset) => offset);

const ownerFixtureNames = (include: (offset: number) => boolean) =>
  OWNER_FIXTURE_OFFSETS.filter(include).map(fixtureName);

const prepareOwnerFixture = () =>
  prepareBenchmarkWorkspace(OWNER_FIXTURE_OFFSETS.length);

const listEligibleOwners = makeFunctionReference<
  'query',
  {
    workspaceId: string;
    paginationOpts: { numItems: number; cursor: string | null };
  },
  { page: Array<{ memberId: string; displayName: string }> }
>('workspaceCompanies:listEligibleOwners');

type MyWorkspacesPage = {
  page: Array<{ workspaceId: string; name: string }>;
  isDone: boolean;
  continueCursor: string;
};

const listMyWorkspaces = makeFunctionReference<
  'query',
  { paginationOpts: { numItems: number; cursor: string | null } },
  MyWorkspacesPage
>('workspaces:listMine');

const findWorkspaceId = async (client: ConvexHttpClient, name: string) => {
  let cursor: string | null = null;
  for (;;) {
    const workspaces: MyWorkspacesPage = await client.query(listMyWorkspaces, {
      paginationOpts: { numItems: 100, cursor },
    });
    const workspace = workspaces.page.find((entry) => entry.name === name);
    if (workspace !== undefined) return workspace.workspaceId;
    if (workspaces.isDone) throw new Error(`No ${name} workspace membership`);
    cursor = workspaces.continueCursor;
  }
};

const filterOwner = async (page: Page, label: string) => {
  await companyRecords(page)
    .getByRole('combobox', { name: 'Filter by account owner' })
    .selectOption({ label });
  await expect(page).toHaveURL(/[?&]owner=/);
  const ownerId = new URL(page.url()).searchParams.get('owner');
  if (ownerId === null) throw new Error('The owner filter is not in the URL');
  return ownerId;
};

const expectOwnerFilterUnavailable = async (
  page: Page,
  workspaceId: string,
  owner: string,
) => {
  await page.goto(
    `/objects/companies?workspace=${workspaceId}&owner=${encodeURIComponent(owner)}`,
  );
  await expect(
    companyRecords(page).getByRole('status').filter({
      hasText: 'That owner filter is unavailable, so all companies are shown.',
    }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/[?&]owner=/);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Unable to load Fenforce' }),
  ).toHaveCount(0);
  await expect(
    companyRecords(page).getByRole('combobox', {
      name: 'Filter by account owner',
    }),
  ).toHaveValue('');
  await expectListMatches(
    page,
    workspaceId,
    {},
    ownerFixtureNames(() => true),
  );
};

test('a manager filters by owner and a seller applies the shared view without the owner filter', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const sellerContext = await browser.newContext();
  try {
    const sellerPage = await sellerContext.newPage();
    await sellerPage.goto('/objects/companies');
    await chooseEmployee(sellerPage, 'seller-a');
    await page.goto('/objects/companies');
    await chooseEmployee(page, 'manager-a');
    await expect(
      page.getByRole('heading', { name: 'Companies', exact: true }),
    ).toBeVisible();
    await expect(
      sellerPage.getByRole('heading', { name: 'Companies', exact: true }),
    ).toBeVisible();
    const workspaceId = await prepareOwnerFixture();

    await openCompanies(page, workspaceId);
    const sellerOwnerId = await filterOwner(page, 'seller-a');
    await expectListMatches(
      page,
      workspaceId,
      { filters: { ownerId: sellerOwnerId } },
      ownerFixtureNames(isSellerOwned),
    );
    const managerOwnerId = await filterOwner(page, 'manager-a');
    expect(managerOwnerId).not.toBe(sellerOwnerId);
    await expectListMatches(
      page,
      workspaceId,
      { filters: { ownerId: managerOwnerId } },
      ownerFixtureNames((offset) => !isSellerOwned(offset)),
    );
    await filterIndustry(page, 'Services');
    await expect(page).toHaveURL(/[?&]industry=services/);
    await expect(page).toHaveURL(
      new RegExp(`[?&]owner=${managerOwnerId}(&|$)`),
    );
    const sharedQuery: AccountListQuery = {
      filters: { industry: 'services', ownerId: managerOwnerId },
    };
    await expectListMatches(
      page,
      workspaceId,
      sharedQuery,
      ownerFixtureNames(
        (offset) =>
          !isSellerOwned(offset) && fixtureIndustry(offset) === 'services',
      ),
    );

    const viewName = `Manager services ${Date.now()}`;
    const records = companyRecords(page);
    await records
      .getByRole('button', { name: 'Save current view', exact: true })
      .click();
    const saveForm = records.getByRole('form', { name: 'Save view' });
    await saveForm
      .getByRole('textbox', { name: 'View name', exact: true })
      .fill(viewName);
    await saveForm
      .getByRole('checkbox', { name: 'Share with workspace', exact: true })
      .check();
    await saveForm
      .getByRole('button', { name: 'Save view', exact: true })
      .click();
    await expect(saveForm).toBeHidden();
    await expect(page).toHaveURL(/[?&]view=/);

    await openCompanies(sellerPage, workspaceId);
    const sellerRecords = companyRecords(sellerPage);
    const sharedView = sellerRecords
      .getByRole('navigation', { name: 'Saved views' })
      .getByRole('button', { name: new RegExp(`^${viewName}`) });
    await expect(sharedView).toContainText('Shared');
    await expect(
      sellerRecords.getByRole('button', {
        name: `Delete view ${viewName}`,
        exact: true,
      }),
    ).toHaveCount(0);
    await sharedView.click();
    await expect(sharedView).toHaveAttribute('aria-current', 'true');
    await expect(sellerPage).toHaveURL(/[?&]industry=services/);
    await expect(sellerPage).not.toHaveURL(/[?&]owner=/);
    await expect(
      sellerRecords.getByRole('combobox', { name: 'Filter by account owner' }),
    ).toHaveCount(0);
    await expect(sellerPage.getByRole('alert')).toHaveCount(0);
    await expectListMatches(
      sellerPage,
      workspaceId,
      { filters: { industry: 'services' } },
      ownerFixtureNames(
        (offset) =>
          isSellerOwned(offset) && fixtureIndustry(offset) === 'services',
      ),
    );
    expect(await sellerPage.content()).not.toContain(managerOwnerId);

    await records
      .getByRole('button', { name: `Delete view ${viewName}`, exact: true })
      .click();
    await records
      .getByRole('region', { name: 'Confirm delete view' })
      .getByRole('button', { name: 'Delete view', exact: true })
      .click();
    await expect(sharedView).toHaveCount(0);
  } finally {
    await sellerContext.close();
  }
});

test('an unusable owner filter in the URL shows all companies instead of an error page', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/objects/companies');
  await chooseEmployee(page, 'manager-a');
  await expect(
    page.getByRole('heading', { name: 'Companies', exact: true }),
  ).toBeVisible();
  const workspaceId = await prepareOwnerFixture();
  await openCompanies(page, workspaceId);
  const managerClient = await employeeClient(page);
  const foreignWorkspaceId = await findWorkspaceId(
    managerClient,
    'workspace-demo',
  );
  const foreignOwners = await managerClient.query(listEligibleOwners, {
    workspaceId: foreignWorkspaceId,
    paginationOpts: { numItems: 10, cursor: null },
  });
  const foreignOwnerId = foreignOwners.page.find(
    (owner) => owner.displayName === 'manager-a',
  )?.memberId;
  if (foreignOwnerId === undefined)
    throw new Error('The foreign workspace has no manager member');

  await expectOwnerFilterUnavailable(page, workspaceId, 'not-a-member-id');
  await expectOwnerFilterUnavailable(page, workspaceId, foreignOwnerId);
});
