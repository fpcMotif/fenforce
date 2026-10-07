import { expect, it } from 'vitest';

import {
  salesFixture,
  SALES_PRODUCT,
  SALES_QUOTE,
} from '../testing/salesFixtures';
import { api } from './_generated/api';
import { insertImportedSalesProject } from './salesSource';
import type { Id } from './_generated/dataModel';
import type { SalesCommand } from './salesContract';

const pipelineFixture = async () => {
  const fixture = await salesFixture();
  const { workspaceId, seller, other, manager, accountA, accountB } = fixture;
  const createProject = async (
    actor: typeof seller,
    accountId: Id<'workspaceCompanies'>,
    title: string,
    currency: 'USD' | 'CNY',
    quantityMilli: number,
    commands: SalesCommand[],
  ) => {
    const projectId = await actor.session.mutation(api.salesProjects.create, {
      ...fixture.createArgs,
      operationId: `create-${title}`,
      accountId,
      title,
      currency,
      quantityMilli,
    });
    for (const [index, command] of commands.entries())
      await actor.session.mutation(api.salesProjects.execute, {
        workspaceId,
        projectId,
        expectedRevision: index + 1,
        operationId: `${title}-${index}`,
        command,
      });
    return projectId;
  };
  const sent = {
    type: 'markQuoteSent' as const,
    evidenceReference: 'DEMO-email',
  };
  const quoted = await createProject(seller, accountA, 'quoted', 'USD', 2000, [
    { ...SALES_QUOTE, unitPriceMinor: 1050 },
    sent,
  ]);
  const yuan = await createProject(seller, accountA, 'yuan', 'CNY', 1000, [
    { ...SALES_QUOTE, unitPriceMinor: 333 },
  ]);
  const foreign = await createProject(other, accountB, 'foreign', 'USD', 999, [
    { ...SALES_QUOTE, unitPriceMinor: 1000 },
  ]);
  await createProject(seller, accountA, 'lost', 'USD', 1000, [
    { type: 'closeLost', reason: 'No budget' },
  ]);
  const pipeline = (
    actor: typeof seller,
    numItems = 25,
    cursor: string | null = null,
    stage?: 'qualified' | 'quoted',
  ) =>
    actor.session.query(api.salesPipeline.list, {
      workspaceId,
      stage,
      paginationOpts: { numItems, cursor },
    });
  const totals = (actor: typeof seller) =>
    actor.session.query(api.salesPipeline.totals, { workspaceId });
  const createQuoted = (title: string) =>
    createProject(seller, accountA, title, 'USD', 1000, [SALES_QUOTE, sent]);
  return {
    ...fixture,
    quoted,
    yuan,
    foreign,
    pipeline,
    totals,
    manager,
    createQuoted,
  };
};

it('returns only open opportunities on accessible Accounts with a permission-safe projection', async () => {
  const fixture = await pipelineFixture();
  const { seller, manager, projectId, quoted, yuan, foreign } = fixture;
  const sellerPage = await fixture.pipeline(seller);
  expect(sellerPage.page.map((project) => project._id)).toEqual([
    projectId,
    quoted,
    yuan,
  ]);
  const managerPage = await fixture.pipeline(manager);
  expect(managerPage.page.map((project) => project._id)).toEqual([
    projectId,
    quoted,
    yuan,
    foreign,
  ]);
  expect(managerPage.page[1]).toEqual({
    _id: quoted,
    accountId: fixture.accountA,
    accountName: 'account-a',
    title: 'quoted',
    stage: 'quoted',
    currency: 'USD',
    amountMinor: 2100,
    closeDate: '2099-11-01',
    nextAction: 'Arrange sample',
    nextActionDate: '2099-10-10',
    revision: 3,
    updatedAt: expect.any(Number),
  });
  expect(managerPage.page[0]?.amountMinor).toBeNull();
  const quotedOnly = await fixture.pipeline(manager, 25, null, 'quoted');
  expect(quotedOnly.page.map((project) => project._id)).toEqual([quoted]);
});

it('pages of one concatenate to the full permitted set without duplicates', async () => {
  const fixture = await pipelineFixture();
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const result = await fixture.pipeline(fixture.manager, 1, cursor);
    ids.push(...result.page.map((project) => project._id));
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  expect(ids).toEqual([
    fixture.projectId,
    fixture.quoted,
    fixture.yuan,
    fixture.foreign,
  ]);
});

it('totals open amounts per stage and currency without mixing currencies', async () => {
  const fixture = await pipelineFixture();
  expect(await fixture.totals(fixture.manager)).toEqual({
    complete: true,
    groups: [
      {
        stage: 'qualified',
        currency: 'CNY',
        count: 1,
        quotedCount: 1,
        totalMinor: 333,
      },
      {
        stage: 'qualified',
        currency: 'USD',
        count: 2,
        quotedCount: 1,
        totalMinor: 999,
      },
      {
        stage: 'quoted',
        currency: 'USD',
        count: 1,
        quotedCount: 1,
        totalMinor: 2100,
      },
    ],
  });
  expect((await fixture.totals(fixture.other)).groups).toEqual([
    {
      stage: 'qualified',
      currency: 'USD',
      count: 1,
      quotedCount: 1,
      totalMinor: 999,
    },
  ]);
});

it('fills a stage-filtered page from the stage index instead of scanning other stages', async () => {
  const fixture = await pipelineFixture();
  await fixture.test.run(async (context) => {
    for (let index = 0; index < 150; index++)
      await insertImportedSalesProject(context, {
        ...SALES_PRODUCT,
        workspaceId: fixture.workspaceId,
        accountId: fixture.accountA,
        actorId: fixture.seller.memberId,
        sourceId: `bulk-${index}`,
      });
  });
  const later = await fixture.createQuoted('later');
  const first = await fixture.pipeline(fixture.seller, 1, null, 'quoted');
  const second = await fixture.pipeline(
    fixture.seller,
    1,
    first.continueCursor,
    'quoted',
  );
  expect([...first.page, ...second.page].map((project) => project._id)).toEqual(
    [fixture.quoted, later],
  );
});

it('denies the pipeline to administrators, inactive members and other workspaces', async () => {
  const fixture = await pipelineFixture();
  const { test, admin, seller, outsider, workspaceId } = fixture;
  await expect(
    admin.query(api.salesPipeline.list, {
      workspaceId,
      paginationOpts: { numItems: 25, cursor: null },
    }),
  ).rejects.toThrow('FORBIDDEN');
  await expect(fixture.totals(outsider)).rejects.toThrow();
  await expect(fixture.pipeline(outsider)).rejects.toThrow();
  await test.run((context) =>
    context.db.patch(seller.memberId, { active: false }),
  );
  await expect(fixture.pipeline(seller)).rejects.toThrow();
  await expect(fixture.totals(seller)).rejects.toThrow();
});
