import { convexTest } from 'convex-test';
import { expect, it } from 'vitest';

import { salesActor } from '../testing/accountFixtures';
import { signedInAs } from '../testing/sessionFixtures';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const paginationOpts = { numItems: 20, cursor: null };

it('projects readable historical names after offboarding without disclosing foreign member names', async () => {
  const test = convexTest(schema, modules);
  const { session: admin } = await signedInAs(test, 'Administrator');
  const workspaceId = await admin.mutation(api.workspaces.create, {
    name: 'Sales',
  });
  const formerOwner = await salesActor(
    test,
    workspaceId,
    'seller',
    'Former owner',
  );
  const owner = await salesActor(test, workspaceId, 'seller', 'Current owner');
  const manager = await salesActor(
    test,
    workspaceId,
    'manager',
    'Historical manager',
  );
  const companyId = await manager.session.mutation(
    api.workspaceCompanies.create,
    { workspaceId, name: 'Audit names', accountOwnerId: formerOwner.memberId },
  );
  await manager.session.mutation(api.workspaceCompanies.update, {
    workspaceId,
    companyId,
    expectedRevision: 1,
    accountOwnerId: owner.memberId,
  });
  await admin.mutation(api.employeeIdentity.disableMember, {
    workspaceId,
    memberId: formerOwner.memberId,
  });
  await admin.mutation(api.employeeIdentity.disableMember, {
    workspaceId,
    memberId: manager.memberId,
  });
  const history = await owner.session.query(api.workspaceCompanies.history, {
    workspaceId,
    companyId,
    paginationOpts,
  });
  expect(history.page).toMatchObject([
    {
      actorId: manager.memberId,
      actorName: 'Historical manager',
      beforeOwnerName: null,
      afterOwnerName: 'Former owner',
    },
    {
      actorId: manager.memberId,
      actorName: 'Historical manager',
      beforeOwnerName: 'Former owner',
      afterOwnerName: 'Current owner',
    },
  ]);
  const otherWorkspaceId = await admin.mutation(api.workspaces.create, {
    name: 'Other workspace',
  });
  await test.run(async (context) => {
    await context.db.patch(manager.memberId, {
      workspaceId: otherWorkspaceId,
      displayName: 'Foreign manager secret',
    });
    await context.db.patch(formerOwner.memberId, {
      workspaceId: otherWorkspaceId,
      displayName: 'Foreign owner secret',
    });
  });
  const isolated = await owner.session.query(api.workspaceCompanies.history, {
    workspaceId,
    companyId,
    paginationOpts,
  });
  expect(isolated.page).toMatchObject([
    { actorName: manager.memberId, afterOwnerName: formerOwner.memberId },
    {
      actorName: manager.memberId,
      beforeOwnerName: formerOwner.memberId,
      afterOwnerName: 'Current owner',
    },
  ]);
  expect(JSON.stringify(isolated)).not.toContain('Foreign manager secret');
  expect(JSON.stringify(isolated)).not.toContain('Foreign owner secret');
});
