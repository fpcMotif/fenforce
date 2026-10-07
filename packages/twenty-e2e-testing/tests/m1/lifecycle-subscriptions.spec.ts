import { expect, test, type Locator, type Page } from '@playwright/test';
import { makeFunctionReference } from 'convex/server';

import { chooseEmployee, employeeClient, prepareReplay } from './helpers';
import {
  createCompany,
  getCompany,
  getTrashedCompany,
  openEmployeePage,
  revealTrashedCompany,
  sortsFirstName,
  updateCompany,
} from './replay-helpers';

const trashCompany = makeFunctionReference<
  'mutation',
  { workspaceId: string; companyId: string; expectedRevision: number },
  { revision: number; changed: boolean }
>('accountLifecycle:trash');

type AuditValues = { revision: number; deletedAt: number | null };

const companyHistory = makeFunctionReference<
  'query',
  {
    workspaceId: string;
    companyId: string;
    paginationOpts: { numItems: number; cursor: string | null };
  },
  {
    page: Array<{
      actorName: string;
      before: AuditValues | null;
      after: AuditValues;
    }>;
    isDone: boolean;
  }
>('workspaceCompanies:history');

type RacingEmployee = { subject: string; page: Page };

// Sequential Playwright clicks let the first commit reach the other browser
// and unmount its button, so both clicks fire from in-page timers instead.
const clickTogether = async (buttons: Locator[]) => {
  const clickAt = Date.now() + 500;
  await Promise.all(
    buttons.map((button) =>
      button.evaluate((element, at) => {
        setTimeout(() => (element as HTMLElement).click(), at - Date.now());
      }, clickAt),
    ),
  );
};

const raceOutcome = async (
  employees: RacingEmployee[],
  accepted: (page: Page) => Locator,
  rejectionMessage: string,
) => {
  let outcomes: Array<'accepted' | 'rejected' | 'pending'> = [];
  await expect
    .poll(async () => {
      outcomes = await Promise.all(
        employees.map(async ({ page }) => {
          if ((await accepted(page).count()) > 0) return 'accepted';
          const rejection = page
            .getByRole('alert')
            .filter({ hasText: rejectionMessage });
          return (await rejection.count()) > 0 ? 'rejected' : 'pending';
        }),
      );
      return [...outcomes].sort();
    })
    .toEqual(['accepted', 'rejected']);
  return {
    winner: employees[outcomes.indexOf('accepted')],
    loser: employees[outcomes.indexOf('rejected')],
  };
};

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

    const record = await revealTrashedCompany(managerPage, name);
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

test('concurrent trash and restore from two browsers accept exactly one transition each', async ({
  browser,
  page,
}, testInfo) => {
  const fixture = await prepareReplay();
  await page.goto(`/objects/companies?workspace=${fixture.workspaceId}`);
  await chooseEmployee(page, 'seller-a');
  await expect(
    page.getByRole('heading', { name: 'Companies', exact: true }),
  ).toBeVisible();
  const sellerClient = await employeeClient(page);
  const name = `Concurrent lifecycle ${Date.now()}`;
  const companyId = await sellerClient.mutation(createCompany, {
    workspaceId: fixture.workspaceId,
    name,
    industry: 'services',
  });
  const lookup = { workspaceId: fixture.workspaceId, companyId };
  const detailUrl = `/object/company/${companyId}?workspace=${fixture.workspaceId}`;
  const trashUrl = `/objects/companies/trash?workspace=${fixture.workspaceId}`;
  await page.goto(detailUrl);
  const before = await sellerClient.query(getCompany, lookup);
  expect(before).toMatchObject({ name, revision: 1, deletedAt: null });
  if (before === null) throw new Error('The created company is missing');

  const manager = await openEmployeePage(browser, detailUrl, 'manager-a');
  try {
    const employees = [
      { subject: 'seller-a', page },
      { subject: 'manager-a', page: manager.page },
    ];
    for (const employee of employees) {
      await expect(
        employee.page.getByRole('heading', { name, exact: true }),
      ).toBeVisible();
      await employee.page
        .getByRole('button', { name: 'Move to trash', exact: true })
        .click();
    }
    await clickTogether(
      employees.map((employee) =>
        employee.page.getByRole('button', {
          name: 'Confirm move to trash',
          exact: true,
        }),
      ),
    );
    const trashOutcome = await raceOutcome(
      employees,
      (employeePage) =>
        employeePage.getByRole('heading', { name: 'Trash', exact: true }),
      'This company changed before your move to trash was saved. Your request was not applied.',
    );
    await expect(
      trashOutcome.loser.page.getByRole('heading', {
        name: 'Company not found',
        exact: true,
      }),
    ).toBeVisible();
    await revealTrashedCompany(trashOutcome.winner.page, name);
    const trashed = await sellerClient.query(getTrashedCompany, lookup);
    expect(trashed).toMatchObject({
      name,
      revision: before.revision + 1,
      industry: before.industry,
      accountOwnerId: before.accountOwnerId,
    });
    expect(trashed?.deletedAt).toEqual(expect.any(Number));

    const restoreButtons: Locator[] = [];
    for (const employee of employees) {
      await employee.page.goto(trashUrl);
      const record = await revealTrashedCompany(employee.page, name);
      const restoreButton = record.getByRole('button', {
        name: 'Restore',
        exact: true,
      });
      await expect(restoreButton).toBeEnabled();
      restoreButtons.push(restoreButton);
    }
    await clickTogether(restoreButtons);
    const restoreOutcome = await raceOutcome(
      employees,
      (employeePage) =>
        employeePage
          .getByRole('status')
          .filter({ hasText: 'Company restored' }),
      `${name} changed before your restore was saved. Your request was not applied.`,
    );
    for (const employee of employees)
      await expect(
        employee.page.getByRole('region', { name, exact: true }),
      ).toHaveCount(0);

    const restored = await sellerClient.query(getCompany, lookup);
    expect(restored).toMatchObject({
      _id: before._id,
      name,
      revision: before.revision + 2,
      industry: before.industry,
      domainName: before.domainName,
      accountOwnerId: before.accountOwnerId,
      createdBy: before.createdBy,
      createdAt: before.createdAt,
      deletedAt: null,
    });
    const audit = await sellerClient.query(companyHistory, {
      ...lookup,
      paginationOpts: { numItems: 25, cursor: null },
    });
    const transitions = audit.page.map((entry) => ({
      actorName: entry.actorName,
      before: entry.before && {
        revision: entry.before.revision,
        trashed: entry.before.deletedAt !== null,
      },
      after: {
        revision: entry.after.revision,
        trashed: entry.after.deletedAt !== null,
      },
    }));
    expect(audit.isDone).toBe(true);
    expect(transitions).toEqual([
      {
        actorName: 'seller-a',
        before: null,
        after: { revision: 1, trashed: false },
      },
      {
        actorName: trashOutcome.winner.subject,
        before: { revision: 1, trashed: false },
        after: { revision: 2, trashed: true },
      },
      {
        actorName: restoreOutcome.winner.subject,
        before: { revision: 2, trashed: true },
        after: { revision: 3, trashed: false },
      },
    ]);
    await testInfo.attach('concurrent-lifecycle', {
      body: JSON.stringify({
        trashWinner: trashOutcome.winner.subject,
        trashRejected: trashOutcome.loser.subject,
        restoreWinner: restoreOutcome.winner.subject,
        restoreRejected: restoreOutcome.loser.subject,
        transitions,
      }),
      contentType: 'application/json',
    });

    for (const employee of employees) {
      await employee.page.goto(detailUrl);
      await expect(
        employee.page.getByRole('heading', { name, exact: true }),
      ).toBeVisible();
      await expect(
        employee.page.getByRole('button', {
          name: 'Move to trash',
          exact: true,
        }),
      ).toBeEnabled();
    }
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

    await expect(
      managerPage.getByRole('heading', { name: 'Trash', exact: true }),
    ).toBeVisible();
    const record = await revealTrashedCompany(managerPage, name);
    await record.getByRole('button', { name: 'Restore', exact: true }).click();
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
