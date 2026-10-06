import { expect, test, type Page } from '@playwright/test';
import type { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';

import { chooseEmployee, employeeClient, prepareReplay } from './helpers';
import {
  companyRecords,
  gateConvexSocket,
  loadAllCompanyRows,
} from './query-helpers';

const EDIT_ACKNOWLEDGEMENT_P95_TARGET_IN_MILLISECONDS = 1_000;
const LONG_OUTAGE_IN_MILLISECONDS = 8_000;

const createCompany = makeFunctionReference<
  'mutation',
  { workspaceId: string; name: string; industry?: 'services' },
  string
>('workspaceCompanies:create');
const updateCompany = makeFunctionReference<
  'mutation',
  {
    workspaceId: string;
    companyId: string;
    expectedRevision: number;
    name: string;
  },
  null
>('workspaceCompanies:update');
const getCompany = makeFunctionReference<
  'query',
  { workspaceId: string; companyId: string },
  { name: string; revision: number } | null
>('workspaceCompanies:get');
const companyHistory = makeFunctionReference<
  'query',
  {
    workspaceId: string;
    companyId: string;
    paginationOpts: { numItems: number; cursor: string | null };
  },
  { page: Array<{ after: { name: string } }>; isDone: boolean }
>('workspaceCompanies:history');

type StoredCompany = { name: string; revision: number; auditEntries: string[] };

const readStoredCompany = async (
  client: ConvexHttpClient,
  workspaceId: string,
  companyId: string,
): Promise<StoredCompany> => {
  const company = await client.query(getCompany, { workspaceId, companyId });
  if (company === null) throw new Error('The company is not readable');
  const history = await client.query(companyHistory, {
    workspaceId,
    companyId,
    paginationOpts: { numItems: 100, cursor: null },
  });
  expect(history.isDone).toBe(true);
  return {
    name: company.name,
    revision: company.revision,
    auditEntries: history.page.map((entry) => entry.after.name),
  };
};

const signInToReplay = async (page: Page, subject: string) => {
  const fixture = await prepareReplay();
  await page.goto(`/objects/companies?workspace=${fixture.workspaceId}`);
  await chooseEmployee(page, subject);
  await expect(
    page.getByRole('heading', { name: 'Companies', exact: true }),
  ).toBeVisible();
  return fixture.workspaceId;
};

const createReplayCompany = async (page: Page, workspaceId: string) => {
  const client = await employeeClient(page);
  const name = `Realtime replay ${Date.now()}`;
  const companyId = await client.mutation(createCompany, {
    workspaceId,
    name,
    industry: 'services',
  });
  return {
    client,
    name,
    companyId,
    detailPath: `/object/company/${companyId}?workspace=${workspaceId}`,
  };
};

const companyHeading = (page: Page, name: string) =>
  page.getByRole('heading', { level: 1, name, exact: true });

const startEditing = async (page: Page, name: string) => {
  await page.getByRole('button', { name: 'Edit company', exact: true }).click();
  const nameField = page
    .getByRole('region', { name: 'Edit company', exact: true })
    .getByRole('textbox', { name: 'Name', exact: true });
  await nameField.fill(name);
};

const saveChanges = (page: Page) =>
  page.getByRole('button', { name: 'Save changes', exact: true }).click();

const connectionInterrupted = (page: Page) =>
  page.getByText('Connection interrupted.', { exact: false });

test('a lost save acknowledgement resolves to exactly one write after reconnecting', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const socket = await gateConvexSocket(page);
  const workspaceId = await signInToReplay(page, 'seller-a');
  const company = await createReplayCompany(page, workspaceId);
  await page.goto(company.detailPath);
  await expect(companyHeading(page, company.name)).toBeVisible();
  const before = await readStoredCompany(
    company.client,
    workspaceId,
    company.companyId,
  );

  const savedName = `${company.name} saved once`;
  await startEditing(page, savedName);
  socket.severAfterNextMutationCommits();
  await saveChanges(page);

  await expect.poll(() => socket.state.droppedMutationResponses).toBe(1);
  await expect(connectionInterrupted(page)).toBeVisible();
  const committed = await readStoredCompany(
    company.client,
    workspaceId,
    company.companyId,
  );
  expect(committed.revision).toBe(before.revision + 1);
  expect(committed.name).toBe(savedName);
  await expect(
    page.getByRole('region', { name: 'Edit company', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  const connectionsBeforeReconnect = socket.state.connections;
  socket.reconnect();
  await expect(companyHeading(page, savedName)).toBeVisible({
    timeout: 30_000,
  });
  expect(socket.state.connections).toBeGreaterThan(connectionsBeforeReconnect);
  await expect(connectionInterrupted(page)).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Edit company', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(
    page
      .getByRole('region', { name: 'Company details', exact: true })
      .getByText(savedName, { exact: true }),
  ).toBeVisible();

  const after = await readStoredCompany(
    company.client,
    workspaceId,
    company.companyId,
  );
  expect(after).toEqual({
    name: savedName,
    revision: before.revision + 1,
    auditEntries: [...before.auditEntries, savedName],
  });
});

test('a stale edit from a second client is rejected and keeps the acknowledged value', async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  const workspaceId = await signInToReplay(page, 'seller-a');
  const company = await createReplayCompany(page, workspaceId);
  const before = await readStoredCompany(
    company.client,
    workspaceId,
    company.companyId,
  );
  const managerContext = await browser.newContext();
  try {
    const managerPage = await managerContext.newPage();
    await managerPage.goto(company.detailPath);
    await chooseEmployee(managerPage, 'manager-a');
    await expect(companyHeading(managerPage, company.name)).toBeVisible();
    await page.goto(company.detailPath);
    await expect(companyHeading(page, company.name)).toBeVisible();

    const acceptedName = `${company.name} accepted`;
    const staleName = `${company.name} stale`;
    await startEditing(page, acceptedName);
    await startEditing(managerPage, staleName);
    await saveChanges(page);
    await expect(companyHeading(page, acceptedName)).toBeVisible();
    await expect(companyHeading(managerPage, acceptedName)).toBeVisible();

    await saveChanges(managerPage);
    await expect(managerPage.getByRole('alert')).toContainText(
      'This company changed while you were editing.',
    );
    await expect(companyHeading(managerPage, acceptedName)).toBeVisible();
    await managerPage
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    await expect(
      managerPage
        .getByRole('region', { name: 'Company details', exact: true })
        .getByText(acceptedName, { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(companyHeading(page, acceptedName)).toBeVisible();

    expect(
      await readStoredCompany(company.client, workspaceId, company.companyId),
    ).toEqual({
      name: acceptedName,
      revision: before.revision + 1,
      auditEntries: [...before.auditEntries, acceptedName],
    });
  } finally {
    await managerContext.close();
  }
});

test('changes made by another client during an outage appear after reconnecting', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const socket = await gateConvexSocket(page);
  const workspaceId = await signInToReplay(page, 'seller-a');
  const company = await createReplayCompany(page, workspaceId);
  await page.goto(company.detailPath);
  await expect(companyHeading(page, company.name)).toBeVisible();

  await socket.sever();
  await expect(connectionInterrupted(page)).toBeVisible();
  const outageName = `${company.name} changed offline`;
  const before = await readStoredCompany(
    company.client,
    workspaceId,
    company.companyId,
  );
  await company.client.mutation(updateCompany, {
    workspaceId,
    companyId: company.companyId,
    expectedRevision: before.revision,
    name: outageName,
  });
  await page.waitForTimeout(2_000);
  await expect(companyHeading(page, company.name)).toBeVisible();
  await expect(companyHeading(page, outageName)).toHaveCount(0);

  socket.reconnect();
  await expect(companyHeading(page, outageName)).toBeVisible({
    timeout: 30_000,
  });
  await expect(connectionInterrupted(page)).toHaveCount(0);
});

test('an outage longer than the session check keeps the app usable and completes a pending edit once', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const socket = await gateConvexSocket(page);
  const workspaceId = await signInToReplay(page, 'seller-a');
  const company = await createReplayCompany(page, workspaceId);
  const neighbourName = `${company.name} neighbour`;
  const neighbourId = await company.client.mutation(createCompany, {
    workspaceId,
    name: neighbourName,
    industry: 'services',
  });
  await page.goto(company.detailPath);
  await expect(companyHeading(page, company.name)).toBeVisible();
  const before = await readStoredCompany(
    company.client,
    workspaceId,
    company.companyId,
  );
  const neighbourBefore = await readStoredCompany(
    company.client,
    workspaceId,
    neighbourId,
  );

  const savedName = `${company.name} saved during outage`;
  await startEditing(page, savedName);
  const connectionsBeforeOutage = socket.state.connections;
  await socket.sever();
  await expect(connectionInterrupted(page)).toBeVisible();
  await saveChanges(page);
  await expect(
    page.getByText('Reconnecting… Your change will be confirmed', {
      exact: false,
    }),
  ).toBeVisible();

  const renamedNeighbour = `${neighbourName} renamed offline`;
  await company.client.mutation(updateCompany, {
    workspaceId,
    companyId: neighbourId,
    expectedRevision: neighbourBefore.revision,
    name: renamedNeighbour,
  });
  await page.waitForTimeout(LONG_OUTAGE_IN_MILLISECONDS);

  expect(socket.state.connections).toBe(connectionsBeforeOutage);
  expect(socket.state.refusedConnections).toBeGreaterThan(0);
  await expect(
    readStoredCompany(company.client, workspaceId, company.companyId),
  ).resolves.toEqual(before);
  await expect(page.getByText('Unable to load Fenforce')).toHaveCount(0);
  await expect(page.getByText('Your session has ended')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(companyHeading(page, company.name)).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Edit company', exact: true }),
  ).toBeVisible();

  socket.reconnect();
  await expect(companyHeading(page, savedName)).toBeVisible({
    timeout: 30_000,
  });
  expect(socket.state.connections).toBeGreaterThan(connectionsBeforeOutage);
  await expect(connectionInterrupted(page)).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Edit company', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(
    await readStoredCompany(company.client, workspaceId, company.companyId),
  ).toEqual({
    name: savedName,
    revision: before.revision + 1,
    auditEntries: [...before.auditEntries, savedName],
  });

  await page
    .getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('link', { name: 'Companies', exact: true })
    .click();
  const records = companyRecords(page);
  const searchbox = records.getByRole('searchbox', {
    name: 'Search companies',
  });
  await searchbox.fill(company.name);
  await searchbox.press('Enter');
  expect(
    (await loadAllCompanyRows(page, 2)).map((row) => row.name).sort(),
  ).toEqual([renamedNeighbour, savedName].sort());

  const neighbourAfterOutage = await readStoredCompany(
    company.client,
    workspaceId,
    neighbourId,
  );
  const renamedLive = `${neighbourName} renamed live`;
  await company.client.mutation(updateCompany, {
    workspaceId,
    companyId: neighbourId,
    expectedRevision: neighbourAfterOutage.revision,
    name: renamedLive,
  });
  await expect(
    records.getByRole('link', { name: renamedLive, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('edit round trips are measured against the acknowledgement target', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const workspaceId = await signInToReplay(page, 'seller-a');
  const company = await createReplayCompany(page, workspaceId);
  await page.goto(company.detailPath);
  await expect(companyHeading(page, company.name)).toBeVisible();
  const before = await readStoredCompany(
    company.client,
    workspaceId,
    company.companyId,
  );

  const roundTripsInMilliseconds: number[] = [];
  const saves = 20;
  for (let attempt = 1; attempt <= saves; attempt++) {
    const name = `${company.name} round trip ${attempt}`;
    await startEditing(page, name);
    const startedAt = performance.now();
    await saveChanges(page);
    await expect(companyHeading(page, name)).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Edit company', exact: true }),
    ).toHaveCount(0);
    roundTripsInMilliseconds.push(performance.now() - startedAt);
  }

  const after = await readStoredCompany(
    company.client,
    workspaceId,
    company.companyId,
  );
  expect(after.revision).toBe(before.revision + saves);
  expect(after.auditEntries).toHaveLength(before.auditEntries.length + saves);

  const sorted = [...roundTripsInMilliseconds].sort(
    (left, right) => left - right,
  );
  const percentile = (fraction: number) =>
    sorted[Math.ceil(sorted.length * fraction) - 1];
  const p95InMilliseconds = percentile(0.95);
  await testInfo.attach('edit-round-trip-latency', {
    body: JSON.stringify(
      {
        saves,
        p50InMilliseconds: percentile(0.5),
        p95InMilliseconds,
        maxInMilliseconds: sorted[sorted.length - 1],
        roundTripsInMilliseconds,
        targetP95InMilliseconds:
          EDIT_ACKNOWLEDGEMENT_P95_TARGET_IN_MILLISECONDS,
        meetsTarget:
          p95InMilliseconds <= EDIT_ACKNOWLEDGEMENT_P95_TARGET_IN_MILLISECONDS,
        measuredFrom: 'Save changes click',
        measuredTo: 'saved name rendered in the page heading and editor closed',
        scope:
          'Local anonymous Convex backend, simulated OIDC, one headless Chromium client. Mock engineering target from docs/migration/m1-mock-contract.md; not a production measurement.',
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  expect(p95InMilliseconds).toBeLessThanOrEqual(
    EDIT_ACKNOWLEDGEMENT_P95_TARGET_IN_MILLISECONDS,
  );
});
