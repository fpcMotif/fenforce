import { expect, test } from '@playwright/test';
import { makeFunctionReference } from 'convex/server';

import { chooseEmployee, employeeClient, prepareReplay } from './helpers';

test('workspace navigation preserves tenant selection and rejects foreign detail links', async ({
  page,
}) => {
  const fixture = await prepareReplay();
  await page.goto(`/objects/companies?workspace=${fixture.workspaceId}`);
  await chooseEmployee(page, 'seller-a');
  await expect(
    page.getByRole('heading', { name: 'Companies', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'New company', exact: true }).click();
  const name = `Workspace replay ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await page
    .getByRole('button', { name: 'Create company', exact: true })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const detailUrl = new URL(page.url());
  await page
    .getByRole('combobox', { name: 'Workspace', exact: true })
    .selectOption(fixture.otherWorkspaceId);
  await expect(
    page.getByRole('heading', { name: 'Companies', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole('combobox', { name: 'Workspace', exact: true }),
  ).toHaveValue(fixture.otherWorkspaceId);
  await page.goBack();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  detailUrl.searchParams.set('workspace', fixture.otherWorkspaceId);
  await page.goto(detailUrl.toString());
  await expect(
    page.getByRole('heading', { name: 'Company not found', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(0);
});

test('administrator revocation clears an open employee record and rejects its retained token', async ({
  browser,
  page,
}, testInfo) => {
  const fixture = await prepareReplay();
  await page.goto(`/objects/companies?workspace=${fixture.workspaceId}`);
  await chooseEmployee(page, 'seller-b');
  await page.getByRole('button', { name: 'New company', exact: true }).click();
  const name = `Revocation replay ${Date.now()}`;
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await page
    .getByRole('button', { name: 'Create company', exact: true })
    .click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  const companyId = new URL(page.url()).pathname.split('/').at(-1);
  const client = await employeeClient(page);
  const getCompany = makeFunctionReference<'query'>('workspaceCompanies:get');
  await expect(
    client.query(getCompany, { workspaceId: fixture.workspaceId, companyId }),
  ).resolves.toMatchObject({ name });
  const administrator = await browser.newContext({
    baseURL: 'http://127.0.0.1:3017',
  });
  try {
    const adminPage = await administrator.newPage();
    await adminPage.goto(`/settings/members?workspace=${fixture.workspaceId}`);
    await chooseEmployee(adminPage, 'admin-a');
    await expect(
      adminPage.getByRole('heading', { name: 'Members', exact: true }),
    ).toBeVisible();
    const revokedAt = Date.now();
    await adminPage
      .getByRole('button', { name: 'Revoke access for seller-b', exact: true })
      .click();
    await expect(adminPage.getByRole('status')).toContainText('Access revoked');
    await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(
      0,
      { timeout: 5000 },
    );
    const clearedAfterMs = Date.now() - revokedAt;
    expect(clearedAfterMs).toBeLessThanOrEqual(5000);
    await expect(
      client.query(getCompany, { workspaceId: fixture.workspaceId, companyId }),
    ).rejects.toThrow();
    await testInfo.attach('revocation-timing', {
      body: JSON.stringify({ clearedAfterMs, retainedTokenRejected: true }),
      contentType: 'application/json',
    });
    await page.reload();
    await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(
      0,
    );
  } finally {
    await administrator.close();
    await prepareReplay();
  }
});
