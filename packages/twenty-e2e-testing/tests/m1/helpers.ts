import { expect, type Page } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const chooseEmployee = async (page: Page, subject: string) => {
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

export const localFixtureClient = async () => {
  const configuration: unknown = JSON.parse(
    await readFile(
      resolve(
        __dirname,
        '../../../../deployments/convex/.convex/local/default/config.json',
      ),
      'utf8',
    ),
  );
  if (
    typeof configuration !== 'object' ||
    configuration === null ||
    !('adminKey' in configuration) ||
    typeof configuration.adminKey !== 'string' ||
    !('deploymentName' in configuration) ||
    configuration.deploymentName !== 'anonymous-agent'
  ) {
    throw new Error('A local anonymous Convex deployment is required');
  }
  const adminKey = configuration.adminKey;
  return new ConvexHttpClient('http://127.0.0.1:3210', {
    logger: false,
    fetch: (input, options) => {
      const headers = new Headers(options?.headers);
      headers.set('Authorization', `Convex ${adminKey}`);
      return fetch(input, { ...options, headers });
    },
  });
};

export const prepareReplay = async () => {
  const client = await localFixtureClient();
  return client.mutation(
    makeFunctionReference<
      'mutation',
      Record<string, never>,
      { workspaceId: string; otherWorkspaceId: string }
    >('mockBrowserReplay:prepare'),
    {},
  );
};

export const employeeClient = async (page: Page) => {
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((entry) =>
      entry.startsWith('__convexAuthJWT'),
    );
    return key ? localStorage.getItem(key) : null;
  });
  if (!token) throw new Error('The employee session has no token');
  const client = new ConvexHttpClient('http://127.0.0.1:3210', {
    logger: false,
  });
  client.setAuth(token);
  return client;
};
