import { convexTest } from 'convex-test';
import { expect, it } from 'vitest';

import { signedInAs } from '../testing/sessionFixtures';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const paginationOpts = { numItems: 20, cursor: null };

const createFixture = async () => {
  const test = convexTest(schema, modules);
  const { session: actor } = await signedInAs(test, 'Workspace operator');
  const firstWorkspaceId = await actor.mutation(api.workspaces.create, {
    name: 'First workspace',
  });
  const secondWorkspaceId = await actor.mutation(api.workspaces.create, {
    name: 'Second workspace',
  });
  const firstMembers = await actor.query(api.workspaces.listMembers, {
    workspaceId: firstWorkspaceId,
    paginationOpts,
  });
  const secondMembers = await actor.query(api.workspaces.listMembers, {
    workspaceId: secondWorkspaceId,
    paginationOpts,
  });
  const firstOwnerId = firstMembers.page[0]?.memberId;
  const secondOwnerId = secondMembers.page[0]?.memberId;
  if (!firstOwnerId || !secondOwnerId)
    throw new Error('Fixture membership missing');
  const firstCompanyId = await actor.mutation(api.workspaceCompanies.create, {
    workspaceId: firstWorkspaceId,
    name: 'First account',
    accountOwnerId: firstOwnerId,
  });
  const secondCompanyId = await actor.mutation(api.workspaceCompanies.create, {
    workspaceId: secondWorkspaceId,
    name: 'Second account',
    accountOwnerId: secondOwnerId,
  });
  return {
    test,
    actor,
    firstWorkspaceId,
    secondWorkspaceId,
    firstOwnerId,
    secondOwnerId,
    firstCompanyId,
    secondCompanyId,
  };
};

it('omits disabled employees from the owner picker while retaining historical owner labels', async () => {
  const { test, actor, firstWorkspaceId, firstCompanyId } =
    await createFixture();
  const { userId } = await signedInAs(test, 'Former employee');
  const memberId = await test.run((context) =>
    context.db.insert('workspaceMembers', {
      workspaceId: firstWorkspaceId,
      userId,
      displayName: 'Former employee',
      role: 'member',
      active: true,
      createdAt: Date.now(),
    }),
  );
  await actor.mutation(api.workspaceCompanies.update, {
    workspaceId: firstWorkspaceId,
    companyId: firstCompanyId,
    expectedRevision: 1,
    accountOwnerId: memberId,
  });
  await actor.mutation(api.employeeIdentity.disableMember, {
    workspaceId: firstWorkspaceId,
    memberId,
  });
  const members = await actor.query(api.workspaces.listMembers, {
    workspaceId: firstWorkspaceId,
    paginationOpts,
  });
  expect(members.page.map((member) => member.displayName)).toEqual([
    'Workspace operator',
  ]);
  expect(
    (
      await actor.query(api.workspaceCompanies.get, {
        workspaceId: firstWorkspaceId,
        companyId: firstCompanyId,
      })
    )?.accountOwnerName,
  ).toBe('Former employee');
});

it('switches explicit workspace scope without reusing another workspace record or owner', async () => {
  const {
    actor,
    firstWorkspaceId,
    secondWorkspaceId,
    firstOwnerId,
    secondOwnerId,
    firstCompanyId,
    secondCompanyId,
  } = await createFixture();
  const first = await actor.query(api.workspaceCompanies.list, {
    workspaceId: firstWorkspaceId,
    paginationOpts,
  });
  const second = await actor.query(api.workspaceCompanies.list, {
    workspaceId: secondWorkspaceId,
    paginationOpts,
  });
  expect(first.page.map((row) => row._id)).toEqual([firstCompanyId]);
  expect(second.page.map((row) => row._id)).toEqual([secondCompanyId]);
  expect(
    (
      await actor.query(api.workspaces.listMembers, {
        workspaceId: secondWorkspaceId,
        paginationOpts,
      })
    ).page.map((row) => row.memberId),
  ).toEqual([secondOwnerId]);
  expect(
    await actor.query(api.workspaceCompanies.get, {
      workspaceId: secondWorkspaceId,
      companyId: firstCompanyId,
    }),
  ).toBeNull();
  await expect(
    actor.mutation(api.workspaceCompanies.update, {
      workspaceId: secondWorkspaceId,
      companyId: firstCompanyId,
      expectedRevision: 1,
      name: 'Foreign overwrite',
    }),
  ).rejects.toThrow('COMPANY_NOT_FOUND');
  await expect(
    actor.mutation(api.workspaceCompanies.softDelete, {
      workspaceId: secondWorkspaceId,
      companyId: firstCompanyId,
    }),
  ).rejects.toThrow('COMPANY_NOT_FOUND');
  await expect(
    actor.mutation(api.workspaceCompanies.create, {
      workspaceId: secondWorkspaceId,
      name: 'Foreign owner',
      accountOwnerId: firstOwnerId,
    }),
  ).rejects.toThrow('INVALID_ACCOUNT_OWNER');
  await expect(
    actor.mutation(api.workspaceCompanies.update, {
      workspaceId: secondWorkspaceId,
      companyId: secondCompanyId,
      expectedRevision: 1,
      accountOwnerId: firstOwnerId,
    }),
  ).rejects.toThrow('INVALID_ACCOUNT_OWNER');
  const unchanged = await actor.query(api.workspaceCompanies.get, {
    workspaceId: firstWorkspaceId,
    companyId: firstCompanyId,
  });
  expect(unchanged).toMatchObject({
    name: 'First account',
    revision: 1,
    accountOwnerId: firstOwnerId,
  });
  expect(
    (
      await actor.query(api.workspaceCompanies.list, {
        workspaceId: secondWorkspaceId,
        paginationOpts,
      })
    ).page.map((row) => row.name),
  ).toEqual(['Second account']);
});

it('omits an inactive workspace even while another workspace remains authorized', async () => {
  const { test, actor, firstWorkspaceId, secondWorkspaceId, firstOwnerId } =
    await createFixture();
  await test.run((context) =>
    context.db.patch(firstOwnerId, { active: false }),
  );
  const workspaces = await actor.query(api.workspaces.listMine, {
    paginationOpts,
  });
  expect(workspaces.page.map((row) => row.workspaceId)).toEqual([
    secondWorkspaceId,
  ]);
  expect(
    await actor.query(api.employeeIdentity.session, {
      workspaceId: firstWorkspaceId,
    }),
  ).toBeNull();
  expect(
    await actor.query(api.employeeIdentity.session, {
      workspaceId: secondWorkspaceId,
    }),
  ).not.toBeNull();
  await expect(
    actor.query(api.workspaces.listMembers, {
      workspaceId: firstWorkspaceId,
      paginationOpts,
    }),
  ).rejects.toThrow('FORBIDDEN');
  await expect(
    actor.query(api.workspaceCompanies.list, {
      workspaceId: firstWorkspaceId,
      paginationOpts,
    }),
  ).rejects.toThrow('FORBIDDEN');
  expect(
    (
      await actor.query(api.workspaceCompanies.list, {
        workspaceId: secondWorkspaceId,
        paginationOpts,
      })
    ).page.map((row) => row.name),
  ).toEqual(['Second account']);
});
