import { expect, type Page, type WebSocketRoute } from '@playwright/test';
import type { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';

import { localFixtureClient } from './helpers';

export type AccountIndustry = 'services' | 'manufacturing';

export type AccountListQuery = {
  search?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: { industry?: AccountIndustry | null; ownerId?: string };
};

export type ListedCompany = { id: string; name: string };

type CompanyPage = {
  page: Array<{ _id: string; name: string }>;
  continueCursor: string;
  isDone: boolean;
};

const listCompanies = makeFunctionReference<
  'query',
  AccountListQuery & {
    workspaceId: string;
    paginationOpts: { numItems: number; cursor: string | null };
  },
  CompanyPage
>('workspaceCompanies:list');

export const prepareBenchmarkWorkspace = async (count: number) => {
  const fixtureClient = await localFixtureClient();
  const { workspaceId } = await fixtureClient.mutation(
    makeFunctionReference<
      'mutation',
      Record<string, never>,
      { workspaceId: string }
    >('mockAccountBenchmark:prepare'),
    {},
  );
  await fixtureClient.mutation(
    makeFunctionReference<
      'mutation',
      { workspaceId: string; start: number; count: number },
      { inserted: number }
    >('mockAccountBenchmark:seedBatch'),
    { workspaceId, start: 0, count },
  );
  return workspaceId;
};

export const traverseCompanies = async (
  client: ConvexHttpClient,
  workspaceId: string,
  query: AccountListQuery,
): Promise<ListedCompany[]> => {
  const companies: ListedCompany[] = [];
  let cursor: string | null = null;
  for (let pages = 0; pages < 200; pages++) {
    const result: CompanyPage = await client.query(listCompanies, {
      workspaceId,
      paginationOpts: { numItems: 25, cursor },
      ...query,
    });
    companies.push(
      ...result.page.map((company) => ({
        id: company._id,
        name: company.name,
      })),
    );
    if (result.isDone) return companies;
    cursor = result.continueCursor;
  }
  throw new Error('The backend traversal did not finish');
};

export const companyRecords = (page: Page) =>
  page.getByRole('region', { name: 'Companies', exact: true });

const readCompanyRows = async (page: Page): Promise<ListedCompany[]> =>
  companyRecords(page)
    .getByRole('table')
    .locator('tbody tr td:first-child a')
    .evaluateAll((links) =>
      links.map((link) => ({
        id:
          new URL((link as HTMLAnchorElement).href).pathname.split('/').pop() ??
          '',
        name: link.textContent?.trim() ?? '',
      })),
    );

export const loadAllCompanyRows = async (
  page: Page,
  expectedCount: number,
): Promise<ListedCompany[]> => {
  const records = companyRecords(page);
  const loadMore = records.getByRole('button', {
    name: 'Load more',
    exact: true,
  });
  await expect(records.getByText('Loading companies…')).toHaveCount(0);
  await expect(async () => {
    if ((await loadMore.isVisible()) && (await loadMore.isEnabled()))
      await loadMore.click();
    expect(await readCompanyRows(page)).toHaveLength(expectedCount);
    await expect(loadMore).toBeHidden({ timeout: 1_000 });
    await expect(
      records.getByRole('button', { name: 'Loading…', exact: true }),
    ).toHaveCount(0);
  }).toPass({ timeout: 60_000 });
  await expect(
    records.getByText(`${expectedCount} loaded`, { exact: true }),
  ).toBeVisible();
  return readCompanyRows(page);
};

export const expectSameCompanies = (
  actual: ListedCompany[],
  expected: ListedCompany[],
) => {
  expect(new Set(actual.map((company) => company.id)).size).toBe(actual.length);
  expect(actual).toEqual(expected);
};

const isMutationResponse = (message: string | Buffer) =>
  typeof message === 'string' &&
  (JSON.parse(message) as { type?: unknown }).type === 'MutationResponse';

export const gateConvexSocket = async (page: Page) => {
  const openSockets = new Set<WebSocketRoute>();
  const state = {
    isSevered: false,
    dropsNextMutationResponse: false,
    droppedMutationResponses: 0,
    connections: 0,
    refusedConnections: 0,
  };
  const sever = async () => {
    state.isSevered = true;
    const sockets = [...openSockets];
    openSockets.clear();
    await Promise.all(
      sockets.map((socket) => socket.close().catch(() => undefined)),
    );
  };
  await page.routeWebSocket(/\/api\/[^/]+\/sync$/, (socket) => {
    if (state.isSevered) {
      state.refusedConnections++;
      void socket.close().catch(() => undefined);
      return;
    }
    state.connections++;
    openSockets.add(socket);
    const server = socket.connectToServer();
    server.onMessage((message) => {
      if (state.dropsNextMutationResponse && isMutationResponse(message)) {
        state.dropsNextMutationResponse = false;
        state.droppedMutationResponses++;
        void sever();
        return;
      }
      if (!state.isSevered) socket.send(message);
    });
  });
  return {
    state,
    sever,
    severAfterNextMutationCommits: () => {
      state.dropsNextMutationResponse = true;
    },
    reconnect: () => {
      state.isSevered = false;
    },
  };
};
