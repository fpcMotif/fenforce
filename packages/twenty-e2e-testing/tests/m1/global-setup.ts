import { chromium, type FullConfig } from '@playwright/test';
import { makeFunctionReference } from 'convex/server';

import { chooseEmployee, localFixtureClient } from './helpers';

const globalSetup = async (config: FullConfig) => {
  const client = await localFixtureClient();
  await client.mutation(
    makeFunctionReference<'mutation', Record<string, never>, string>(
      'employeeIdentity:prepareMockWorkspace',
    ),
    {},
  );
  const browser = await chromium.launch({
    executablePath: process.env.FENFORCE_TEST_BROWSER,
  });
  try {
    const page = await browser.newPage({
      baseURL: config.projects[0].use.baseURL,
    });
    await page.goto('/objects/companies');
    await chooseEmployee(page, 'seller-a');
    await page
      .getByRole('heading', { name: 'Companies', exact: true })
      .waitFor();
  } finally {
    await browser.close();
  }
};

export default globalSetup;
