import type { TestConvex } from 'convex-test';

import type schema from '../convex/schema';

export const FIXTURE_SITE_URL = 'https://fixture.convex.site';

const ONE_HOUR_IN_MILLISECONDS = 3_600_000;

// Mirrors the subject Convex Auth puts in its tokens: `<userId>|<sessionId>`.
export const signedInAs = async (
  test: TestConvex<typeof schema>,
  name: string,
) => {
  const { userId, sessionId } = await test.run(async (context) => {
    const insertedUserId = await context.db.insert('users', { name });
    const insertedSessionId = await context.db.insert('authSessions', {
      userId: insertedUserId,
      expirationTime: Date.now() + ONE_HOUR_IN_MILLISECONDS,
    });

    return { userId: insertedUserId, sessionId: insertedSessionId };
  });
  const subject = `${userId}|${sessionId}`;

  return {
    userId,
    sessionId,
    session: test.withIdentity({
      issuer: FIXTURE_SITE_URL,
      subject,
      tokenIdentifier: `${FIXTURE_SITE_URL}|${subject}`,
      name,
    }),
  };
};

export const insertUser = (test: TestConvex<typeof schema>, name: string) =>
  test.run((context) => context.db.insert('users', { name }));
