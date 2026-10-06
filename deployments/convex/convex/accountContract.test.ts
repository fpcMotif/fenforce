import { convexTest, type TestConvex } from 'convex-test';
import { expect, it } from 'vitest';

import { salesActor } from '../testing/accountFixtures';
import { signedInAs } from '../testing/sessionFixtures';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import { ACCOUNT_FIELDS, ACCOUNT_SOURCE_MAPPING } from './accountFields';

const modules = import.meta.glob('./**/*.ts');

const CURRENT_FIELDS = Object.values(ACCOUNT_FIELDS);
const RELABELED_FIELDS = CURRENT_FIELDS.map((field) => ({
  ...field,
  label: `Account ${field.label}`,
}));

const fieldIdentity = ({
  id,
  name,
  sourceField,
}: (typeof RELABELED_FIELDS)[number]) => ({ id, name, sourceField });

const findRelabeledField = (fieldId: string) => {
  const field = RELABELED_FIELDS.find(({ id }) => id === fieldId);
  if (field === undefined) throw new Error(`Unknown field ${fieldId}`);
  return field;
};

const readStoredRecords = async (
  test: TestConvex<typeof schema>,
  companyId: Id<'workspaceCompanies'>,
  viewId: Id<'accountViews'>,
) => {
  const [storedCompany, storedView] = await test.run((context) =>
    Promise.all([context.db.get(companyId), context.db.get(viewId)]),
  );
  if (storedCompany === null || storedView === null)
    throw new Error('Saved records are missing');
  return { storedCompany, storedView };
};

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
  expect(
    await session.query(api.workspaceCompanies.get, { workspaceId, companyId }),
  ).toMatchObject({ name: 'Renamed', industry: null });
});

it('keeps field ids, storage keys, source mapping, and saved views when display labels change', async () => {
  const test = convexTest(schema, modules);
  const { session: admin } = await signedInAs(test, 'Administrator');
  const workspaceId = await admin.mutation(api.workspaces.create, {
    name: 'Sales',
  });
  const { session, memberId } = await salesActor(test, workspaceId);
  const companyId = await session.mutation(api.workspaceCompanies.create, {
    workspaceId,
    name: 'Acme',
    industry: 'services',
  });
  const viewId = await session.mutation(api.accountViews.save, {
    workspaceId,
    name: 'Services accounts',
    scope: 'private',
    configuration: {
      columns: [
        ACCOUNT_FIELDS.name.id,
        ACCOUNT_FIELDS.industry.id,
        ACCOUNT_FIELDS.owner.id,
      ],
      search: '',
      filters: { industry: 'services' },
      sort: { field: ACCOUNT_FIELDS.name.id, direction: 'asc' },
    },
  });

  expect(RELABELED_FIELDS.map(fieldIdentity)).toEqual(
    CURRENT_FIELDS.map(fieldIdentity),
  );
  expect(
    Object.fromEntries(
      RELABELED_FIELDS.map((field) => [field.sourceField, field.id]),
    ),
  ).toEqual(ACCOUNT_SOURCE_MAPPING.fields);

  const { storedCompany, storedView } = await readStoredRecords(
    test,
    companyId,
    viewId,
  );
  const storedText = JSON.stringify([storedCompany, storedView]);
  expect(
    CURRENT_FIELDS.filter(({ label }) => storedText.includes(`"${label}"`)),
  ).toEqual([]);

  const resolvedColumns = storedView.configuration.columns.map((columnId) => {
    const field = findRelabeledField(columnId);
    return { label: field.label, value: storedCompany[field.name] };
  });
  expect(resolvedColumns).toEqual([
    { label: 'Account Name', value: 'Acme' },
    { label: 'Account Industry', value: 'services' },
    { label: 'Account Owner', value: memberId },
  ]);
  const viewResults = await session.query(api.workspaceCompanies.list, {
    workspaceId,
    paginationOpts: { numItems: 10, cursor: null },
    search: storedView.configuration.search,
    filters: storedView.configuration.filters,
    sortDirection: storedView.configuration.sort.direction,
  });
  expect(viewResults.page.map((company) => company._id)).toEqual([companyId]);
});
