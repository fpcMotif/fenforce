import { expect, test } from '@playwright/test';

import { chooseEmployee, employeeClient, prepareReplay } from './helpers';
import {
  companyRecords,
  expectSameCompanies,
  loadAllCompanyRows,
  prepareBenchmarkWorkspace,
  traverseCompanies,
  type AccountListQuery,
} from './query-helpers';
import {
  expectVisibleFocus,
  getCompany,
  horizontalOverflow,
  tabUntilFocused,
} from './replay-helpers';

test('a keyboard-only employee creates, edits, and dismisses trash on a company', async ({
  page,
}) => {
  const fixture = await prepareReplay();
  const listUrl = `/objects/companies?workspace=${fixture.workspaceId}`;
  await page.goto(listUrl);
  await chooseEmployee(page, 'seller-a');
  await expect(
    page.getByRole('heading', { name: 'Companies', exact: true }),
  ).toBeVisible();
  await page.goto(listUrl);
  await expect(
    page.getByRole('heading', { name: 'Companies', exact: true }),
  ).toBeVisible();

  const newCompany = page.getByRole('button', {
    name: 'New company',
    exact: true,
  });
  await expect(tabUntilFocused(page, newCompany)).resolves.toEqual([
    'select:Workspace',
    'a:Companies',
    'a:Trash',
    'button:Sign out',
    'button:New company',
  ]);
  await expectVisibleFocus(newCompany);
  await page.keyboard.press('Enter');

  const creator = page.getByRole('region', {
    name: 'New company',
    exact: true,
  });
  const nameField = creator.getByRole('textbox', { name: 'Name', exact: true });
  await expectVisibleFocus(nameField);
  const name = `Keyboard replay ${Date.now()}`;
  await page.keyboard.type(name);
  await page.keyboard.press('Tab');
  const industryField = creator.getByRole('combobox', {
    name: 'Industry',
    exact: true,
  });
  await expectVisibleFocus(industryField);
  await page.keyboard.press('m');
  await expect(industryField).toHaveValue('manufacturing');
  await page.keyboard.press('Tab');
  const domainField = creator.getByRole('textbox', {
    name: 'Domain Name',
    exact: true,
  });
  await expectVisibleFocus(domainField);
  await page.keyboard.type('keyboard.example.test');
  await page.keyboard.press('Tab');
  await expect(
    creator.getByRole('textbox', { name: 'Account Owner', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expectVisibleFocus(
    creator.getByRole('button', { name: 'Cancel', exact: true }),
  );
  await page.keyboard.press('Tab');
  await expectVisibleFocus(
    creator.getByRole('button', { name: 'Create company', exact: true }),
  );
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(domainField).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

  const companyId = new URL(page.url()).pathname.split('/').at(-1) ?? '';
  const lookup = { workspaceId: fixture.workspaceId, companyId };
  const client = await employeeClient(page);
  await expect(client.query(getCompany, lookup)).resolves.toMatchObject({
    name,
    industry: 'manufacturing',
    domainName: { primaryLinkLabel: 'keyboard.example.test' },
    revision: 1,
  });

  const editCompany = page.getByRole('button', {
    name: 'Edit company',
    exact: true,
  });
  await tabUntilFocused(page, editCompany);
  await expectVisibleFocus(editCompany);
  await page.keyboard.press('Enter');
  const editor = page.getByRole('region', {
    name: 'Edit company',
    exact: true,
  });
  const editName = editor.getByRole('textbox', { name: 'Name', exact: true });
  await expectVisibleFocus(editName);
  await expect(editName).toHaveValue(name);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(`${name} edited`);
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: `${name} edited`, exact: true }),
  ).toBeVisible();
  await expect(client.query(getCompany, lookup)).resolves.toMatchObject({
    name: `${name} edited`,
    revision: 2,
  });

  const moveToTrash = page.getByRole('button', {
    name: 'Move to trash',
    exact: true,
  });
  await tabUntilFocused(page, moveToTrash);
  await expectVisibleFocus(moveToTrash);
  await page.keyboard.press('Enter');
  const confirmation = page.getByRole('region', {
    name: 'Confirm move to trash',
    exact: true,
  });
  await expect(
    confirmation.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expectVisibleFocus(
    confirmation.getByRole('button', {
      name: 'Confirm move to trash',
      exact: true,
    }),
  );
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(confirmation).toHaveCount(0);
  await expect(moveToTrash).toBeFocused();
  await expect(client.query(getCompany, lookup)).resolves.toMatchObject({
    name: `${name} edited`,
    revision: 2,
    deletedAt: null,
  });
});

test('a keyboard-only manager searches, filters, sorts, and manages a saved view', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/objects/companies');
  await chooseEmployee(page, 'manager-a');
  await expect(
    page.getByRole('heading', { name: 'Companies', exact: true }),
  ).toBeVisible();
  const seededCompanies = 20;
  const workspaceId = await prepareBenchmarkWorkspace(seededCompanies);
  await page.goto(`/objects/companies?workspace=${workspaceId}`);
  await expect(
    page.getByRole('heading', { name: 'Companies', exact: true }),
  ).toBeVisible();
  const records = companyRecords(page);
  await loadAllCompanyRows(page, seededCompanies);

  const searchbox = records.getByRole('searchbox', {
    name: 'Search companies',
  });
  await tabUntilFocused(page, searchbox, 30);
  const searchField = records.locator('label').filter({
    has: page.getByRole('searchbox', { name: 'Search companies' }),
  });
  await expectVisibleFocus(searchbox, searchField);
  await page.keyboard.type('MARK 001');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/[?&]q=MARK(\+|%20)001/);
  await expect(searchbox).toHaveValue('MARK 001');
  await expectVisibleFocus(searchbox, searchField);
  await loadAllCompanyRows(page, 10);

  const industryFilter = records.getByRole('combobox', {
    name: 'Filter by industry',
  });
  await tabUntilFocused(page, industryFilter);
  await expectVisibleFocus(industryFilter);
  await page.keyboard.press('s');
  await expect(industryFilter).toHaveValue('services');
  await expect(page).toHaveURL(/[?&]industry=services/);
  await expectVisibleFocus(industryFilter);

  const ownerFilter = records.getByRole('combobox', {
    name: 'Filter by account owner',
  });
  await tabUntilFocused(page, ownerFilter);
  await expectVisibleFocus(ownerFilter);
  await page.keyboard.press('m');
  await expect(page).toHaveURL(/[?&]owner=/);
  await expect(ownerFilter.locator('option:checked')).toHaveText('manager-a');
  await expectVisibleFocus(ownerFilter);

  const sortAscending = records.getByRole('button', {
    name: 'Sort: Name A–Z',
    exact: true,
  });
  await tabUntilFocused(page, sortAscending);
  await expectVisibleFocus(sortAscending);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/[?&]sort=desc/);
  const sortDescending = records.getByRole('button', {
    name: 'Sort: Name Z–A',
    exact: true,
  });
  await expectVisibleFocus(sortDescending);

  const ownerId = new URL(page.url()).searchParams.get('owner') ?? '';
  const viewQuery: AccountListQuery = {
    search: 'MARK 001',
    sortDirection: 'desc',
    filters: { industry: 'services', ownerId },
  };
  const viewNames = ['Benchmark 0016', 'Benchmark 0010'];
  const viewRows = await loadAllCompanyRows(page, viewNames.length);
  expect(viewRows.map((row) => row.name)).toEqual(viewNames);
  expectSameCompanies(
    viewRows,
    await traverseCompanies(await employeeClient(page), workspaceId, viewQuery),
  );

  const saveView = records.getByRole('button', {
    name: 'Save current view',
    exact: true,
  });
  await tabUntilFocused(page, saveView, 20, 'Shift+Tab');
  await expectVisibleFocus(saveView);
  await page.keyboard.press('Enter');
  const saveForm = records.getByRole('form', { name: 'Save view' });
  const viewNameField = saveForm.getByRole('textbox', {
    name: 'View name',
    exact: true,
  });
  await expectVisibleFocus(viewNameField);
  const viewName = `Keyboard view ${Date.now()}`;
  await page.keyboard.type(viewName);
  await page.keyboard.press('Tab');
  await expectVisibleFocus(
    saveForm.getByRole('checkbox', {
      name: 'Share with workspace',
      exact: true,
    }),
  );
  await page.keyboard.press('Tab');
  await expectVisibleFocus(
    saveForm.getByRole('button', { name: 'Cancel', exact: true }),
  );
  await page.keyboard.press('Tab');
  const confirmSave = saveForm.getByRole('button', {
    name: 'Save view',
    exact: true,
  });
  await expectVisibleFocus(confirmSave);
  await page.keyboard.press('Enter');
  await expect(saveForm).toHaveCount(0);
  await expect(page).toHaveURL(/[?&]view=/);
  await expectVisibleFocus(saveView);
  const savedViews = records.getByRole('navigation', { name: 'Saved views' });
  const viewButton = savedViews.getByRole('button', {
    name: viewName,
    exact: true,
  });
  await expect(viewButton).toHaveAttribute('aria-current', 'true');

  const allCompanies = savedViews.getByRole('button', {
    name: 'All companies',
    exact: true,
  });
  await tabUntilFocused(page, allCompanies, 20, 'Shift+Tab');
  await expectVisibleFocus(allCompanies);
  await page.keyboard.press('Enter');
  await expect(page).not.toHaveURL(/[?&](q|industry|owner|sort|view)=/);
  await expect(allCompanies).toHaveAttribute('aria-current', 'true');
  await loadAllCompanyRows(page, seededCompanies);

  await tabUntilFocused(page, viewButton);
  await expectVisibleFocus(viewButton);
  await page.keyboard.press('Enter');
  await expect(viewButton).toHaveAttribute('aria-current', 'true');
  await expect(searchbox).toHaveValue('MARK 001');
  await expect(industryFilter).toHaveValue('services');
  await expect(ownerFilter).toHaveValue(ownerId);
  await expect(sortDescending).toBeVisible();
  expectSameCompanies(
    await loadAllCompanyRows(page, viewNames.length),
    viewRows,
  );

  const deleteView = savedViews.getByRole('button', {
    name: `Delete view ${viewName}`,
    exact: true,
  });
  await tabUntilFocused(page, deleteView);
  await expectVisibleFocus(deleteView);
  await page.keyboard.press('Enter');
  const confirmation = records.getByRole('region', {
    name: 'Confirm delete view',
  });
  await expectVisibleFocus(
    confirmation.getByRole('button', { name: 'Cancel', exact: true }),
  );
  await page.keyboard.press('Tab');
  await expectVisibleFocus(
    confirmation.getByRole('button', { name: 'Delete view', exact: true }),
  );
  await page.keyboard.press('Enter');
  await expect(confirmation).toHaveCount(0);
  await expect(viewButton).toHaveCount(0);
  await expect(page).not.toHaveURL(/[?&]view=/);
  await expectVisibleFocus(saveView);
});

test.describe('locale and direction', () => {
  test.use({ locale: 'zh-CN', viewport: { width: 390, height: 844 } });

  test('a Chinese browser locale renders the English catalog without page overflow in either direction', async ({
    page,
  }) => {
    const fixture = await prepareReplay();
    await page.goto(`/objects/companies?workspace=${fixture.workspaceId}`);
    await chooseEmployee(page, 'seller-a');
    await expect(
      page.getByRole('heading', { name: 'Companies', exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => navigator.language)).toBe('zh-CN');
    await expect(
      page.getByRole('button', { name: 'New company', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('columnheader', { name: 'Account Owner', exact: true }),
    ).toBeAttached();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);

    await page.evaluate(() => {
      document.documentElement.dir = 'rtl';
    });
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(
      page.getByRole('heading', { name: 'Companies', exact: true }),
    ).toBeInViewport();
    await expect(
      page.getByRole('button', { name: 'New company', exact: true }),
    ).toBeInViewport();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await page
      .getByRole('button', { name: 'New company', exact: true })
      .click();
    const creator = page.getByRole('region', {
      name: 'New company',
      exact: true,
    });
    await expect(
      creator.getByRole('button', { name: 'Create company', exact: true }),
    ).toBeInViewport();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  });
});
