import type { TestConvex } from 'convex-test';

import type { Id } from '../convex/_generated/dataModel';
import type schema from '../convex/schema';
import { signedInAs } from './sessionFixtures';

export const salesActor = async (
  test: TestConvex<typeof schema>,
  workspaceId: Id<'workspaces'>,
  role: 'seller' | 'manager' | 'admin' = 'seller',
  name = role,
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
