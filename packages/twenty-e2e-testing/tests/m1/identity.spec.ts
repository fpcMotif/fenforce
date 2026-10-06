import { expect, test, type Page } from '@playwright/test';

const chooseEmployee = async (page: Page, subject: string) => {
  await page
    .getByRole('button', {
      name: 'Continue with employee identity',
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Simulated employee identity' }),
  ).toBeVisible();
  await page.getByRole('combobox').selectOption(subject);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
};

test('invited employee signs in, refreshes a protected route, and signs out', async ({
  page,
}) => {
  await page.goto('/objects/companies');
  await chooseEmployee(page, 'seller-a');
  await expect(
    page.getByRole('heading', { name: 'Companies', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/objects\/companies\?workspace=/);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Companies', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  await page.goto('/objects/companies');
  await expect(
    page.getByRole('heading', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Companies', exact: true }),
  ).toHaveCount(0);
});

test('an uninvited subject receives a recoverable sign-in failure', async ({
  page,
}) => {
  await page.goto('/objects/companies');
  await chooseEmployee(page, 'unknown');
  await expect(
    page.getByRole('heading', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Unable to sign in');
  await expect(
    page.getByRole('button', {
      name: 'Continue with employee identity',
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole('heading', { name: 'Companies', exact: true }),
  ).toHaveCount(0);
});
