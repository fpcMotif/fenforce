import { expect, it } from 'vitest';

import { salesFixture, SALES_PRODUCT } from '../testing/salesFixtures';
import { api } from './_generated/api';
import { insertImportedSalesProject } from './salesSource';

it('imports an opportunity by stable source ID with exact quantity, currency and date-only values', async () => {
  const fixture = await salesFixture();
  const { test, workspaceId, accountA, contactA, seller } = fixture;
  const imported = {
    ...SALES_PRODUCT,
    workspaceId,
    accountId: accountA,
    actorId: seller.memberId,
    sourceId: 'OPP-MOCK-001',
    primaryContactId: contactA,
    quantityMilli: Number.MAX_SAFE_INTEGER - 1,
    unit: 't' as const,
    currency: 'EUR' as const,
    closeDate: '2026-11-01',
    nextActionDate: '2026-02-28',
  };
  const projectId = await test.run((context) =>
    insertImportedSalesProject(context, imported),
  );
  expect(
    await seller.session.query(api.salesProjects.get, {
      workspaceId,
      projectId,
    }),
  ).toMatchObject({
    sourceId: 'OPP-MOCK-001',
    primaryContactId: contactA,
    quantityMilli: 9007199254740990,
    unit: 't',
    currency: 'EUR',
    closeDate: '2026-11-01',
    nextActionDate: '2026-02-28',
    revision: 1,
    stage: 'qualified',
    createdBy: seller.memberId,
  });
  await expect(
    test.run((context) => insertImportedSalesProject(context, imported)),
  ).rejects.toThrow('DUPLICATE_SALES_SOURCE_ID');
  await expect(
    test.run((context) =>
      insertImportedSalesProject(context, {
        ...imported,
        sourceId: 'OPP-MOCK-002',
        accountId: fixture.accountX,
      }),
    ),
  ).rejects.toThrow('COMPANY_NOT_FOUND');
  await expect(
    test.run((context) =>
      insertImportedSalesProject(context, {
        ...imported,
        sourceId: 'OPP-MOCK-003',
        accountId: fixture.accountB,
      }),
    ),
  ).rejects.toThrow('CONTACT_NOT_FOUND');
  await expect(
    test.run((context) =>
      insertImportedSalesProject(context, {
        ...imported,
        sourceId: 'OPP-MOCK-004',
        closeDate: '2026-02-29',
      }),
    ),
  ).rejects.toThrow('SALES_INVALID_DATE');
});

it('rejects imports onto trashed accounts or by actors who are not active workspace members', async () => {
  const fixture = await salesFixture();
  const { test, workspaceId, accountA, seller, outsider } = fixture;
  const imported = {
    ...SALES_PRODUCT,
    workspaceId,
    accountId: accountA,
    actorId: seller.memberId,
    sourceId: 'OPP-MOCK-010',
  };
  await expect(
    test.run((context) =>
      insertImportedSalesProject(context, {
        ...imported,
        actorId: outsider.memberId,
      }),
    ),
  ).rejects.toThrow('INVALID_IMPORT_ACTOR');
  await test.run((context) =>
    context.db.patch(seller.memberId, { active: false }),
  );
  await expect(
    test.run((context) => insertImportedSalesProject(context, imported)),
  ).rejects.toThrow('INVALID_IMPORT_ACTOR');
  await test.run(async (context) => {
    await context.db.patch(seller.memberId, { active: true });
    await context.db.patch(accountA, { deletedAt: Date.now() });
  });
  await expect(
    test.run((context) => insertImportedSalesProject(context, imported)),
  ).rejects.toThrow('COMPANY_NOT_FOUND');
});
