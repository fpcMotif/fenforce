import type { TestConvex } from 'convex-test';

import type { Id } from '../convex/_generated/dataModel';
import type schema from '../convex/schema';
import { signedInAs } from './sessionFixtures';

export const salesActor = async (
  test: TestConvex<typeof schema>,
  workspaceId: Id<'workspaces'>,
  role: 'seller' | 'manager' | 'admin' = 'seller',
  name: string = role,
) => {
  const actor = await signedInAs(test, name);
  const memberId = await test.run((context) =>
    context.db.insert('workspaceMembers', {
      workspaceId,
      userId: actor.userId,
      displayName: name,
      role,
      active: true,
      createdAt: Date.now(),
    }),
  );
  return { ...actor, memberId };
};

export const setCreatorSalesRole = async (
  test: TestConvex<typeof schema>,
  workspaceId: Id<'workspaces'>,
) => {
  return test.run(async (context) => {
    const workspace = await context.db.get(workspaceId);
    if (workspace === null) throw new Error('Missing fixture workspace');
    const member = await context.db
      .query('workspaceMembers')
      .withIndex('by_workspaceId_and_userId', (index) =>
        index
          .eq('workspaceId', workspaceId)
          .eq('userId', workspace.createdByUserId),
      )
      .unique();
    if (member === null) throw new Error('Missing fixture creator');
    await context.db.patch(member._id, { role: 'manager', active: true });
    return member._id;
  });
};
