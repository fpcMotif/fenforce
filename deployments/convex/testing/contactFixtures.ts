import { api } from '../convex/_generated/api';
import { insertImportedContact } from '../convex/contactSource';
import { salesActor, salesWorkspace } from './accountFixtures';
import { signedInAs } from './sessionFixtures';

export const m1Fixture = async () => {
  const sales = await salesWorkspace();
  const { test, workspaceId, seller, other } = sales;
  const accountA = await seller.session.mutation(
    api.workspaceCompanies.create,
    { workspaceId, name: 'account-a' },
  );
  const accountB = await other.session.mutation(api.workspaceCompanies.create, {
    workspaceId,
    name: 'account-b',
  });
  const contactA = await test.run((context) =>
    insertImportedContact(context, {
      workspaceId,
      accountId: accountA,
      actorId: seller.memberId,
      sourceId: 'contact-a',
      lastName: 'Synthetic',
      email: null,
    }),
  );
  const { session: otherAdmin } = await signedInAs(test, 'Other admin');
  const otherWorkspaceId = await otherAdmin.mutation(api.workspaces.create, {
    name: 'workspace-other',
  });
  const outsider = await salesActor(
    test,
    otherWorkspaceId,
    'seller',
    'Outsider',
  );
  const accountX = await outsider.session.mutation(
    api.workspaceCompanies.create,
    { workspaceId: otherWorkspaceId, name: 'account-x' },
  );
  return {
    ...sales,
    accountA,
    accountB,
    contactA,
    otherWorkspaceId,
    outsider,
    accountX,
  };
};

export const paginationOpts = { numItems: 25, cursor: null };
