import { expect, test } from '@playwright/test';

import { chooseEmployee, prepareReplay } from './helpers';

test('two employees preserve acknowledged values and reject an obsolete form', async ({
  browser,
  page,
}, testInfo) => {
  const fixture = await prepareReplay();
  await page.goto(`/objects/companies?workspace=${fixture.workspaceId}`);
  await chooseEmployee(page, 'seller-a');
  await page.getByRole('button', { name: 'New company', exact: true }).click();
  const name = `Concurrent replay ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await page
    .getByRole('combobox', { name: 'Industry', exact: true })
    .selectOption('services');
  await page
    .getByRole('textbox', { name: 'Domain Name', exact: true })
    .fill('synthetic.example.test');
  await expect(
    page.getByRole('textbox', { name: 'Account Owner', exact: true }),
  ).toHaveAttribute('readonly', '');
  await page
    .getByRole('button', { name: 'Create company', exact: true })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const manager = await browser.newContext();
  try {
    const managerPage = await manager.newPage();
    await managerPage.goto(page.url());
    await chooseEmployee(managerPage, 'manager-a');
    await expect(
      managerPage.getByRole('heading', { name, exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Edit company', exact: true })
      .click();
    await managerPage
      .getByRole('button', { name: 'Edit company', exact: true })
      .click();
    await page
      .getByRole('textbox', { name: 'Name', exact: true })
      .fill(`${name} accepted`);
    await managerPage
      .getByRole('textbox', { name: 'Name', exact: true })
      .fill(`${name} obsolete`);
    const startedAt = Date.now();
    await page
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: `${name} accepted`, exact: true }),
    ).toBeVisible();
    await expect(
      managerPage.getByRole('heading', {
        name: `${name} accepted`,
        exact: true,
      }),
    ).toBeVisible();
    await testInfo.attach('two-client-update', {
      body: JSON.stringify({ visibleAfterMs: Date.now() - startedAt }),
      contentType: 'application/json',
    });
    await expect(
      managerPage.getByRole('textbox', { name: 'Name', exact: true }),
    ).toHaveValue(`${name} obsolete`);
    await managerPage
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await expect(managerPage.getByRole('alert')).toContainText(
      'changed while you were editing',
    );
    await managerPage
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: `${name} accepted`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('synthetic.example.test', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Services', { exact: true })).toBeVisible();
  } finally {
    await manager.close();
  }
});

test('trash and restoration preserve the record identity, fields, and visible audit', async ({
  page,
}) => {
  const fixture = await prepareReplay();
  await page.goto(`/objects/companies?workspace=${fixture.workspaceId}`);
  await chooseEmployee(page, 'seller-a');
  await page.getByRole('button', { name: 'New company', exact: true }).click();
  const name = `Lifecycle replay ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await page
    .getByRole('combobox', { name: 'Industry', exact: true })
    .selectOption('manufacturing');
  await page
    .getByRole('textbox', { name: 'Domain Name', exact: true })
    .fill('lifecycle.example.test');
  await page
    .getByRole('button', { name: 'Create company', exact: true })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const detailUrl = page.url();
  await page
    .getByRole('button', { name: 'Move to trash', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('button', { name: 'Confirm move to trash', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Trash', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Companies', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Companies', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
  await page.goto(detailUrl);
  await expect(
    page.getByRole('heading', { name: 'Company not found', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Trash', exact: true }).click();
  const record = page.getByRole('region', { name, exact: true });
  await expect(record).toBeVisible();
  await record
    .getByRole('button', { name: 'Show history', exact: true })
    .click();
  await expect(
    record.getByRole('region', { name: 'Company history', exact: true }),
  ).toContainText('seller-a');
  await record.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Company restored');
  await page.goto(detailUrl);
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByText('Manufacturing', { exact: true })).toBeVisible();
  await expect(
    page.getByText('lifecycle.example.test', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Show history', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Company history', exact: true }),
  ).toContainText('Revision 3');
});
