import { convexTest } from 'convex-test';
import { expect, it } from 'vitest';

import { signedInAs } from '../testing/sessionFixtures';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

it('resolves a requested workspace beyond the first page of memberships', async () => {
  const test = convexTest(schema, modules);
  const { session: employee, userId } = await signedInAs(test, 'Employee');
  const workspaceIds = await test.run(async (context) => {
    const insertedWorkspaceIds = [];
    for (let index = 0; index < 60; index++) {
      const workspaceId = await context.db.insert('workspaces', {
        name: `Workspace ${index}`,
        createdByUserId: userId,
        createdAt: Date.now(),
      });
      await context.db.insert('workspaceMembers', {
        workspaceId,
        userId,
        displayName: 'Employee',
        role: 'seller',
        active: true,
        createdAt: Date.now(),
      });
      insertedWorkspaceIds.push(workspaceId);
    }
    return insertedWorkspaceIds;
  });
  const lastWorkspaceId = workspaceIds[59];
  const firstPage = await employee.query(api.workspaces.listMine, {
    paginationOpts: { numItems: 50, cursor: null },
  });
  expect(
    firstPage.page.some(
      (workspace) => workspace.workspaceId === lastWorkspaceId,
    ),
  ).toBe(false);

  expect(
    await employee.query(api.workspaces.getMine, {
      workspaceId: lastWorkspaceId,
    }),
  ).toEqual({
    workspaceId: lastWorkspaceId,
    name: 'Workspace 59',
    role: 'seller',
  });
});

it('returns nothing for a foreign, inactive or malformed workspace', async () => {
  const test = convexTest(schema, modules);
  const { session: owner } = await signedInAs(test, 'Owner');
  const { session: employee, userId } = await signedInAs(test, 'Employee');
  const foreignWorkspaceId = await owner.mutation(api.workspaces.create, {
    name: 'Foreign workspace',
  });
  const inactiveWorkspaceId = await owner.mutation(api.workspaces.create, {
    name: 'Inactive workspace',
  });
  await test.run((context) =>
    context.db.insert('workspaceMembers', {
      workspaceId: inactiveWorkspaceId,
      userId,
      displayName: 'Employee',
      role: 'seller',
      active: false,
      createdAt: Date.now(),
    }),
  );

  for (const workspaceId of [
    foreignWorkspaceId,
    inactiveWorkspaceId,
    'not-a-workspace-id',
  ])
    expect(
      await employee.query(api.workspaces.getMine, { workspaceId }),
    ).toBeNull();
  await expect(
    test.query(api.workspaces.getMine, { workspaceId: foreignWorkspaceId }),
  ).rejects.toThrow('UNAUTHENTICATED');
});
