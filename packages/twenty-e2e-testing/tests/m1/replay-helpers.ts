import {
  expect,
  type Browser,
  type Locator,
  type Page,
} from '@playwright/test';
import { makeFunctionReference } from 'convex/server';

import { chooseEmployee } from './helpers';

export type ReplayCompany = {
  _id: string;
  revision: number;
  name: string;
  industry: 'services' | 'manufacturing' | null;
  domainName: { primaryLinkLabel: string; primaryLinkUrl: string };
  accountOwnerId: string | null;
  accountOwnerName: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: number;
  deletedAt: number | null;
};

type CompanyLookup = { workspaceId: string; companyId: string };

export const getCompany = makeFunctionReference<
  'query',
  CompanyLookup,
  ReplayCompany | null
>('workspaceCompanies:get');

export const getTrashedCompany = makeFunctionReference<
  'query',
  CompanyLookup,
  ReplayCompany | null
>('accountLifecycle:getTrashed');

export const createCompany = makeFunctionReference<
  'mutation',
  {
    workspaceId: string;
    name: string;
    industry?: 'services' | 'manufacturing';
    domainName?: string;
  },
  string
>('workspaceCompanies:create');

export const updateCompany = makeFunctionReference<
  'mutation',
  CompanyLookup & { expectedRevision: number; name?: string },
  null
>('workspaceCompanies:update');

export const sortsFirstName = (label: string) =>
  `0${10 ** 13 - Date.now()} ${label}`;

export const openEmployeePage = async (
  browser: Browser,
  url: string,
  subject: string,
) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  await chooseEmployee(page, subject);
  return { context, page };
};

// Trash lists the oldest trashed companies first, so a record trashed by the
// current test sits on the last page once earlier runs have filled the trash.
export const revealTrashedCompany = async (page: Page, name: string) => {
  const record = page.getByRole('region', { name, exact: true });
  const loadMore = page.getByRole('button', {
    name: 'Load more',
    exact: true,
    disabled: false,
  });
  for (let loadedPages = 1; loadedPages <= 100; loadedPages += 1) {
    await expect(record.or(loadMore).first()).toBeVisible();
    if ((await record.count()) > 0) return record;
    await loadMore.click();
  }
  throw new Error(`${name} is not in the first 100 trash pages`);
};

export const tabUntilFocused = async (
  page: Page,
  target: Locator,
  maximumPresses = 20,
  key: 'Tab' | 'Shift+Tab' = 'Tab',
) => {
  const visited: string[] = [];
  for (let press = 0; press < maximumPresses; press += 1) {
    await page.keyboard.press(key);
    visited.push(
      await page.evaluate(() => {
        const element = document.activeElement;
        if (element === null) return '';
        const label =
          element.getAttribute('aria-label') ??
          (element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement
            ? (element.labels?.[0]?.firstElementChild?.textContent ?? '')
            : (element.textContent ?? ''));
        return `${element.tagName.toLowerCase()}:${label.trim()}`;
      }),
    );
    if (await target.evaluate((element) => element === document.activeElement))
      return visited;
  }
  throw new Error(
    `Focus did not reach the target after ${maximumPresses} presses: ${visited.join(' > ')}`,
  );
};

export const expectVisibleFocus = async (
  target: Locator,
  indicatorElement: Locator = target,
) => {
  await expect(target).toBeFocused();
  expect(
    await target.evaluate((element) => element.matches(':focus-visible')),
  ).toBe(true);
  const indicator = await indicatorElement.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      boxShadow: style.boxShadow,
    };
  });
  expect(
    (indicator.outlineStyle !== 'none' && indicator.outlineWidth > 0) ||
      indicator.boxShadow !== 'none',
    `focus indicator ${JSON.stringify(indicator)}`,
  ).toBe(true);
};

export const horizontalOverflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
