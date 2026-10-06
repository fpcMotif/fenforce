import { expect, test } from '@playwright/test';
import { makeFunctionReference } from 'convex/server';
import type { ConvexHttpClient } from 'convex/browser';

import { chooseEmployee, employeeClient, localFixtureClient } from './helpers';

type QueryArguments = {
  workspaceId: string;
  paginationOpts: { numItems: number; cursor: string | null };
  search?: string;
  sortDirection?: 'asc' | 'desc';
  filters?: { industry?: 'services' | 'manufacturing' | null };
};
type QueryResult = {
  page: Array<{ _id: string; name: string }>;
  scannedCount: number;
  continueCursor: string;
  isDone: boolean;
};
const list = makeFunctionReference<'query', QueryArguments, QueryResult>(
  'workspaceCompanies:list',
);

const MAXIMUM_CANDIDATE_ROWS_READ = 100;
const MAXIMUM_RETURNED_ROWS = MAXIMUM_CANDIDATE_ROWS_READ;
const MEMBER_NAME_READS_PER_RETURNED_ROW = 2;
const SESSION_AND_MEMBERSHIP_READS = 4;
const OWNER_FILTER_AND_INDEX_READY_READS = 2;
const RECORD_READ_UPPER_BOUND_PER_REQUEST =
  MAXIMUM_CANDIDATE_ROWS_READ +
  MAXIMUM_RETURNED_ROWS * MEMBER_NAME_READS_PER_RETURNED_ROW +
  SESSION_AND_MEMBERSHIP_READS +
  OWNER_FILTER_AND_INDEX_READY_READS;

test('one thousand accounts have complete bounded queries and measured local latency', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const sellerContext = await browser.newContext();
  try {
    const sellerPage = await sellerContext.newPage();
    await sellerPage.goto('/objects/companies');
    await chooseEmployee(sellerPage, 'seller-a');
    await expect(
      sellerPage.getByRole('heading', { name: 'Companies', exact: true }),
    ).toBeVisible();
    await page.goto('/objects/companies');
    await chooseEmployee(page, 'manager-a');
    await expect(
      page.getByRole('heading', { name: 'Companies', exact: true }),
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
    for (let start = 0; start < 1000; start += 100) {
      await fixtureClient.mutation(
        makeFunctionReference<'mutation'>('mockAccountBenchmark:seedBatch'),
        { workspaceId, start, count: 100 },
      );
    }
    await page.goto(`/objects/companies?workspace=${workspaceId}`);
    await expect(
      page.getByRole('heading', { name: 'Companies', exact: true }),
    ).toBeVisible();
    const client = await employeeClient(page);
    const timings: number[] = [];
    let maxScannedCount = 0;
    let maxReturnedBytes = 0;
    let emptyNonterminalPages = 0;
    const traverse = async (
      actor: ConvexHttpClient,
      query: Omit<QueryArguments, 'workspaceId' | 'paginationOpts'> = {},
    ) => {
      const records: QueryResult['page'] = [];
      let cursor: string | null = null;
      for (let pages = 0; pages < 100; pages++) {
        const start = performance.now();
        const result: QueryResult = await actor.query(list, {
          workspaceId,
          paginationOpts: { numItems: 25, cursor },
          ...query,
        });
        timings.push(performance.now() - start);
        const returnedBytes = Buffer.byteLength(JSON.stringify(result));
        maxScannedCount = Math.max(maxScannedCount, result.scannedCount);
        maxReturnedBytes = Math.max(maxReturnedBytes, returnedBytes);
        expect(result.scannedCount).toBeLessThanOrEqual(
          MAXIMUM_CANDIDATE_ROWS_READ,
        );
        expect(result.page.length).toBeLessThanOrEqual(MAXIMUM_RETURNED_ROWS);
        expect(returnedBytes).toBeLessThanOrEqual(100_000);
        records.push(...result.page);
        if (result.isDone) return records;
        if (result.page.length === 0) emptyNonterminalPages++;
        expect(result.continueCursor).not.toBe(cursor);
        cursor = result.continueCursor;
      }
      throw new Error('The benchmark did not exhaust its bounded fixture');
    };
    const expectedNames = Array.from(
      { length: 1000 },
      (_, offset) =>
        `Benchmark ${String(offset).padStart(4, '0')}${offset === 999 ? ' needle' : ''}`,
    );
    const records = await traverse(client);
    expect(records.map((record) => record.name)).toEqual(expectedNames);
    expect(new Set(records.map((record) => record._id)).size).toBe(1000);
    expect(
      (await traverse(client, { sortDirection: 'desc' })).map(
        (record) => record._id,
      ),
    ).toEqual(records.map((record) => record._id).reverse());
    expect(
      (await traverse(client, { search: 'NEEDLE' })).map(
        (record) => record.name,
      ),
    ).toEqual(['Benchmark 0999 needle']);
    expect(
      (await traverse(client, { filters: { industry: null } })).map(
        (record) => record.name,
      ),
    ).toEqual(expectedNames.filter((_, offset) => offset % 3 === 0));
    await sellerPage.goto(`/objects/companies?workspace=${workspaceId}`);
    await expect(
      sellerPage.getByRole('heading', { name: 'Companies', exact: true }),
    ).toBeVisible();
    const seller = await employeeClient(sellerPage);
    expect((await traverse(seller)).map((record) => record.name)).toEqual(
      expectedNames.filter((_, offset) => offset % 2 === 1),
    );
    const firstQueryMs = timings[0];
    const warm = timings.slice(1).sort((left, right) => left - right);
    const warmP95Ms = warm[Math.ceil(warm.length * 0.95) - 1];
    expect(warmP95Ms).toBeLessThanOrEqual(500);
    expect(emptyNonterminalPages).toBeGreaterThan(0);
    await testInfo.attach('account-query-workload', {
      body: JSON.stringify(
        {
          workspaceId,
          accounts: 1000,
          requests: timings.length,
          firstQueryMs,
          warmP95Ms,
          maxScannedCount,
          maxReturnedBytes,
          emptyNonterminalPages,
          recordReadUpperBoundPerRequest: RECORD_READ_UPPER_BOUND_PER_REQUEST,
          scope:
            'Local anonymous Convex HTTP queries with simulated OIDC. Candidate scans measured; total-read bound derived from query and authorization code. No production or daily billing claim.',
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
  } finally {
    await sellerContext.close();
  }
});
