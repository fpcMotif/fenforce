import { convexTest } from 'convex-test';
import { expect, it } from 'vitest';

import { salesActor } from '../testing/accountFixtures';
import { signedInAs } from '../testing/sessionFixtures';
import { api } from './_generated/api';
import schema from './schema';
import { ACCOUNT_FIELDS, ACCOUNT_SOURCE_MAPPING } from './accountFields';

const modules = import.meta.glob('./**/*.ts');

it('defaults ownership to the employee and persists nullable industry through edits', async () => {
  const test = convexTest(schema, modules);
  const { session: admin } = await signedInAs(test, 'Administrator');
  const workspaceId = await admin.mutation(api.workspaces.create, {
    name: 'Sales',
  });
  const { session, memberId } = await salesActor(test, workspaceId);
  const companyId = await session.mutation(api.workspaceCompanies.create, {
    workspaceId,
    name: '  Acme  ',
  });
  expect(
    await session.query(api.workspaceCompanies.get, { workspaceId, companyId }),
  ).toMatchObject({ name: 'Acme', industry: null, accountOwnerId: memberId });
  await session.mutation(api.workspaceCompanies.update, {
    workspaceId,
    companyId,
    expectedRevision: 1,
    industry: 'services',
  });
  await expect(
    session.mutation(api.workspaceCompanies.update, {
      workspaceId,
      companyId,
      expectedRevision: 1,
      name: 'Stale',
    }),
  ).rejects.toThrow('COMPANY_CHANGED');
  const history = await session.query(api.workspaceCompanies.history, {
    workspaceId,
    companyId,
    paginationOpts: { numItems: 20, cursor: null },
  });
  expect(history.page).toMatchObject([
    {
      actorId: memberId,
      before: null,
      after: { name: 'Acme', industry: null, revision: 1 },
    },
    {
      actorId: memberId,
      before: { industry: null, revision: 1 },
      after: { industry: 'services', revision: 2 },
    },
  ]);
});

it('rejects invalid names and null owners atomically and keeps omitted compound values', async () => {
  const test = convexTest(schema, modules);
  const { session: admin } = await signedInAs(test, 'Administrator');
  const workspaceId = await admin.mutation(api.workspaces.create, {
    name: 'Sales',
  });
  const { session, memberId } = await salesActor(test, workspaceId);
  for (const name of ['', '  ', 'x'.repeat(201)]) {
    await expect(
      session.mutation(api.workspaceCompanies.create, { workspaceId, name }),
    ).rejects.toThrow('INVALID_COMPANY_NAME');
  }
  await expect(
    session.mutation(api.workspaceCompanies.create, {
      workspaceId,
      name: 'Acme',
      accountOwnerId: null,
    }),
  ).rejects.toThrow('INVALID_ACCOUNT_OWNER');
  const companyId = await session.mutation(api.workspaceCompanies.create, {
    workspaceId,
    name: 'x'.repeat(200),
    industry: 'manufacturing',
  });
  const domainName = {
    primaryLinkUrl: 'https://old.example',
    primaryLinkLabel: 'Custom label',
    secondaryLinks: [{ url: 'https://secondary.example', label: 'Secondary' }],
  };
  await test.run((context) => context.db.patch(companyId, { domainName }));
  await session.mutation(api.workspaceCompanies.update, {
    workspaceId,
    companyId,
    expectedRevision: 1,
    name: 'Renamed',
  });
  expect(
    await session.query(api.workspaceCompanies.get, { workspaceId, companyId }),
  ).toMatchObject({
    domainName,
    industry: 'manufacturing',
    accountOwnerId: memberId,
  });
  await session.mutation(api.workspaceCompanies.update, {
    workspaceId,
    companyId,
    expectedRevision: 2,
    industry: null,
    domainName: 'new.example',
  });
  expect(
    await session.query(api.workspaceCompanies.get, { workspaceId, companyId }),
  ).toMatchObject({
    industry: null,
    domainName: {
      primaryLinkUrl: 'https://new.example',
      secondaryLinks: domainName.secondaryLinks,
    },
  });
  await session.mutation(api.workspaceCompanies.update, {
    workspaceId,
    companyId,
    expectedRevision: 3,
    industry: '',
  });
  const renamedDefinition = { ...ACCOUNT_FIELDS.name, label: 'Customer name' };
  expect(ACCOUNT_SOURCE_MAPPING.fields.Name).toBe(renamedDefinition.id);
  expect(
    (
      await session.query(api.workspaceCompanies.get, {
        workspaceId,
        companyId,
      })
    )?.[renamedDefinition.name],
  ).toBe('Renamed');
});
