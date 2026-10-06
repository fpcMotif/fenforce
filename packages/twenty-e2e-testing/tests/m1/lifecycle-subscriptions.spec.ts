import { expect, test } from '@playwright/test';
import { makeFunctionReference } from 'convex/server';

import { chooseEmployee, employeeClient, prepareReplay } from './helpers';
import {
  createCompany,
  getCompany,
  getTrashedCompany,
  openEmployeePage,
  updateCompany,
} from './replay-helpers';

const trashCompany = makeFunctionReference<
  'mutation',
  { workspaceId: string; companyId: string; expectedRevision: number },
  { revision: number; changed: boolean }
>('accountLifecycle:trash');

const sortsFirstName = (label: string) => `0${10 ** 13 - Date.now()} ${label}`;

test('an open detail view follows another employee trashing and restoring the record', async ({
  browser,
  page,
}) => {
  const fixture = await prepareReplay();
  await page.goto(`/objects/companies?workspace=${fixture.workspaceId}`);
  await chooseEmployee(page, 'seller-a');
  await expect(
    page.getByRole('heading', { name: 'Companies', exact: true }),
  ).toBeVisible();
  const sellerClient = await employeeClient(page);
  const name = `Subscription lifecycle ${Date.now()}`;
  const companyId = await sellerClient.mutation(createCompany, {
    workspaceId: fixture.workspaceId,
    name,
    industry: 'manufacturing',
    domainName: 'subscription.example.test',
  });
  const lookup = { workspaceId: fixture.workspaceId, companyId };
  const detailUrl = `/object/company/${companyId}?workspace=${fixture.workspaceId}`;
  await page.goto(detailUrl);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const before = await sellerClient.query(getCompany, lookup);
  expect(before).toMatchObject({ name, revision: 1, deletedAt: null });
  if (before === null) throw new Error('The created company is missing');

  await page.getByRole('button', { name: 'Edit company', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill(`${name} stale`);

  const manager = await openEmployeePage(browser, detailUrl, 'manager-a');
  try {
    const managerPage = manager.page;
    await expect(
      managerPage.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
    await managerPage
      .getByRole('button', { name: 'Move to trash', exact: true })
      .click();
    await managerPage
      .getByRole('button', { name: 'Confirm move to trash', exact: true })
      .click();
    await expect(
      managerPage.getByRole('heading', { name: 'Trash', exact: true }),
    ).toBeVisible();

    await expect(
      page.getByRole('heading', { name: 'Company not found', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Name', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Save changes', exact: true }),
    ).toHaveCount(0);
    await expect(
      sellerClient.mutation(updateCompany, {
        ...lookup,
        expectedRevision: before.revision,
        name: `${name} stale`,
      }),
    ).rejects.toMatchObject({ data: 'COMPANY_NOT_FOUND' });
    await expect(sellerClient.query(getCompany, lookup)).resolves.toBeNull();
    const trashed = await sellerClient.query(getTrashedCompany, lookup);
    expect(trashed).toMatchObject({
      name,
      revision: before.revision + 1,
      industry: before.industry,
      domainName: before.domainName,
      accountOwnerId: before.accountOwnerId,
    });
    expect(trashed?.deletedAt).toEqual(expect.any(Number));

    const record = managerPage.getByRole('region', { name, exact: true });
    await record.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(managerPage.getByRole('status')).toContainText(
      'Company restored',
    );

    await expect(
      page.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: `${name} stale`, exact: true }),
    ).toHaveCount(0);
    const restored = await sellerClient.query(getCompany, lookup);
    expect(restored).toMatchObject({
      _id: before._id,
      name,
      revision: before.revision + 2,
      industry: before.industry,
      domainName: before.domainName,
      accountOwnerId: before.accountOwnerId,
      accountOwnerName: before.accountOwnerName,
      createdBy: before.createdBy,
      createdAt: before.createdAt,
      deletedAt: null,
    });

    const editor = page.getByRole('region', {
      name: 'Edit company',
      exact: true,
    });
    await expect(
      editor.getByRole('textbox', { name: 'Name', exact: true }),
    ).toHaveValue(name);
    await expect(
      editor.getByRole('combobox', { name: 'Industry', exact: true }),
    ).toHaveValue('manufacturing');
    await expect(
      editor.getByRole('textbox', { name: 'Domain Name', exact: true }),
    ).toHaveValue('subscription.example.test');
    await editor
      .getByRole('textbox', { name: 'Name', exact: true })
      .fill(`${name} after restore`);
    await editor
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(editor.getByRole('alert')).toContainText(
      'changed while you were editing',
    );
    await expect(sellerClient.query(getCompany, lookup)).resolves.toMatchObject(
      { name, revision: before.revision + 2 },
    );
  } finally {
    await manager.context.close();
  }
});

test('an open companies list drops a trashed record and shows it again after restoration', async ({
  browser,
  page,
}) => {
  const fixture = await prepareReplay();
  const listUrl = `/objects/companies?workspace=${fixture.workspaceId}`;
  await page.goto(listUrl);
  await chooseEmployee(page, 'seller-a');
  await expect(
    page.getByRole('heading', { name: 'Companies', exact: true }),
  ).toBeVisible();
  const sellerClient = await employeeClient(page);
  const name = sortsFirstName('List lifecycle');
  const companyId = await sellerClient.mutation(createCompany, {
    workspaceId: fixture.workspaceId,
    name,
    industry: 'services',
  });
  const lookup = { workspaceId: fixture.workspaceId, companyId };
  const companies = page.getByRole('region', {
    name: 'Companies',
    exact: true,
  });
  await expect(
    companies.getByRole('link', { name, exact: true }),
  ).toBeVisible();

  const manager = await openEmployeePage(
    browser,
    `/object/company/${companyId}?workspace=${fixture.workspaceId}`,
    'manager-a',
  );
  try {
    const managerPage = manager.page;
    await managerPage
      .getByRole('button', { name: 'Move to trash', exact: true })
      .click();
    await managerPage
      .getByRole('button', { name: 'Confirm move to trash', exact: true })
      .click();
    await expect(
      companies.getByRole('link', { name, exact: true }),
    ).toHaveCount(0);
    await expect(sellerClient.query(getCompany, lookup)).resolves.toBeNull();

    await managerPage
      .getByRole('region', { name, exact: true })
      .getByRole('button', { name: 'Restore', exact: true })
      .click();
    await expect(managerPage.getByRole('status')).toContainText(
      'Company restored',
    );
    const restoredLink = companies.getByRole('link', { name, exact: true });
    await expect(restoredLink).toBeVisible();
    await expect(
      companies
        .getByRole('row')
        .filter({ has: page.getByRole('link', { name, exact: true }) }),
    ).toContainText('Services');
    await expect(sellerClient.query(getCompany, lookup)).resolves.toMatchObject(
      { name, industry: 'services', revision: 3, deletedAt: null },
    );
  } finally {
    await manager.context.close();
    const current = await sellerClient.query(getCompany, lookup);
    if (current !== null)
      await sellerClient.mutation(trashCompany, {
        ...lookup,
        expectedRevision: current.revision,
      });
  }
});
