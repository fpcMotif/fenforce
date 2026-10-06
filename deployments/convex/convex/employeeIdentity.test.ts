import { convexTest, type TestConvex } from 'convex-test';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { exportPKCS8, generateKeyPair } from 'jose';

import { startMockIdentityProvider } from '../testing/mockIdentityProvider';
import { signedInAs } from '../testing/sessionFixtures';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

let provider: Awaited<ReturnType<typeof startMockIdentityProvider>>;
beforeAll(async () => {
  provider = await startMockIdentityProvider(4012);
  vi.stubEnv('CONVEX_SITE_URL', 'http://localhost:3211');
  vi.stubEnv('SITE_URL', 'http://localhost:3017');
  vi.stubEnv('FENFORCE_OIDC_ISSUER', provider.issuer);
  vi.stubEnv('FENFORCE_OIDC_CLIENT_ID', 'fenforce-local');
  vi.stubEnv('FENFORCE_OIDC_CLIENT_SECRET', 'synthetic-local-client-secret');
  vi.stubEnv('FENFORCE_OIDC_TENANT', 'tenant-demo');
  const keys = await generateKeyPair('RS256', { extractable: true });
  vi.stubEnv('JWT_PRIVATE_KEY', await exportPKCS8(keys.privateKey));
});

afterAll(async () => {
  await provider.close();
  vi.unstubAllEnvs();
});

it('starts the employee OIDC authorization flow through Convex Auth', async () => {
  const test = convexTest(schema, modules);
  const result = await test.action(api.auth.signIn, {
    provider: 'employee-oidc',
  });
  expect(result.redirect).toContain('/api/auth/signin/employee-oidc');
  expect(result.verifier).toBeTruthy();
  expect(result.tokens).toBeUndefined();
});

const authorize = async (
  test: TestConvex<typeof schema>,
  subject = 'seller-a',
) => {
  const start = await test.action(api.auth.signIn, {
    provider: 'employee-oidc',
  });
  const redirect = await test.fetch(
    new URL(start.redirect ?? '').pathname +
      new URL(start.redirect ?? '').search,
  );
  const cookies = redirect.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  const authorizationUrl = new URL(redirect.headers.get('Location') ?? '');
  authorizationUrl.searchParams.set('subject', subject);
  const authorization = await fetch(authorizationUrl, { redirect: 'manual' });
  const callbackUrl = new URL(authorization.headers.get('Location') ?? '');
  const callback = await test.fetch(callbackUrl.pathname + callbackUrl.search, {
    headers: { Cookie: cookies },
  });
  const code = new URL(callback.headers.get('Location') ?? '').searchParams.get(
    'code',
  );
  return { code, verifier: start.verifier };
};

it('rejects a signed employee identity without an exact invitation', async () => {
  const result = await authorize(convexTest(schema, modules));
  expect(result.code).toBeNull();
});

const invitedFixture = async () => {
  const test = convexTest(schema, modules);
  const workspaceId = await test.run(async (context) => {
    const userId = await context.db.insert('users', { name: 'Inviter' });
    const workspaceId = await context.db.insert('workspaces', {
      name: 'Demo',
      createdByUserId: userId,
      createdAt: Date.now(),
    });
    await context.db.insert('employeeInvitations', {
      issuer: provider.issuer,
      tenant: 'tenant-demo',
      subject: 'seller-a',
      workspaceId,
      displayName: 'Seller A',
      role: 'member',
      expiresAt: Date.now() + 60_000,
    });
    return workspaceId;
  });
  return { test, workspaceId };
};

const login = async (test: TestConvex<typeof schema>) => {
  const { code, verifier } = await authorize(test);
  expect(code).toBeTruthy();
  const result = await test.action(api.auth.signIn, {
    params: { code: code ?? '' },
    verifier,
  });
  expect(result.tokens).toBeTruthy();
  const claims = JSON.parse(
    atob((result.tokens?.token ?? '').split('.')[1] ?? ''),
  ) as { sub: string; iss: string };
  const caller = test.withIdentity({ subject: claims.sub, issuer: claims.iss });
  return { caller, tokens: result.tokens, code, verifier };
};

it('enrolls only the invited subject and returns a usable one-hour session', async () => {
  const { test, workspaceId } = await invitedFixture();
  const { caller } = await login(test);
  const workspaces = await caller.query(api.workspaces.listMine, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(workspaces.page).toEqual([
    { name: 'Demo', role: 'member', workspaceId },
  ]);
  await expect(
    caller.mutation(api.workspaces.create, { name: 'Uninvited workspace' }),
  ).rejects.toThrow('FORBIDDEN');
  const session = await caller.query(api.employeeIdentity.session, {});
  expect(session?.expiresAt).toBeGreaterThan(Date.now() + 3_590_000);
  expect(session?.expiresAt).toBeLessThanOrEqual(Date.now() + 3_600_000);
});

it.each(['issuer', 'audience', 'tenant', 'expired', 'forged'] as const)(
  'rejects a provider token with invalid %s',
  async (fault) => {
    const { test } = await invitedFixture();
    if (fault === 'expired' || fault === 'forged')
      provider.faults[fault] = true;
    else provider.faults[fault] = 'wrong-value';
    try {
      expect((await authorize(test)).code).toBeNull();
    } finally {
      if (fault === 'expired' || fault === 'forged')
        provider.faults[fault] = false;
      else provider.faults[fault] = '';
    }
  },
);

it('does not enroll an unknown subject through another employee invitation', async () => {
  const { test } = await invitedFixture();
  expect((await authorize(test, 'unknown')).code).toBeNull();
});

it('renews an active session, rejects code replay, and denies tokens after logout', async () => {
  const { test } = await invitedFixture();
  const { caller, tokens, code, verifier } = await login(test);
  const renewed = await test.action(api.auth.signIn, {
    refreshToken: tokens?.refreshToken,
  });
  expect(renewed.tokens).toBeTruthy();
  expect(
    (
      await test.action(api.auth.signIn, {
        params: { code: code ?? '' },
        verifier,
      })
    ).tokens,
  ).toBeNull();
  await caller.action(api.auth.signOut, {});
  expect(await caller.query(api.employeeIdentity.session, {})).toBeNull();
  expect(
    (
      await test.action(api.auth.signIn, {
        refreshToken: renewed.tokens?.refreshToken,
      })
    ).tokens,
  ).toBeNull();
});

it('disablement blocks retained tokens, renewal and subsequent provider sign-in', async () => {
  const { test, workspaceId } = await invitedFixture();
  const { caller, tokens } = await login(test);
  const { session: admin, userId } = await signedInAs(test, 'Administrator');
  await test.run((context) =>
    context.db.insert('workspaceMembers', {
      userId,
      workspaceId,
      displayName: 'Administrator',
      role: 'admin',
      active: true,
      createdAt: Date.now(),
    }),
  );
  const members = await admin.query(api.workspaces.listMembers, {
    workspaceId,
    paginationOpts: { numItems: 10, cursor: null },
  });
  const member = members.page.find((row) => row.displayName === 'Seller A');
  expect(member).toBeDefined();
  if (!member) throw new Error('Missing invited member');
  await admin.mutation(api.employeeIdentity.disableMember, {
    workspaceId,
    memberId: member.memberId,
  });
  expect(await caller.query(api.employeeIdentity.session, {})).toBeNull();
  await expect(
    caller.query(api.workspaces.listMine, {
      paginationOpts: { numItems: 10, cursor: null },
    }),
  ).rejects.toThrow('UNAUTHENTICATED');
  expect(
    (await test.action(api.auth.signIn, { refreshToken: tokens?.refreshToken }))
      .tokens,
  ).toBeNull();
  expect((await authorize(test)).code).toBeNull();
});

it('rejects access and renewal after the one-hour session deadline', async () => {
  const { test } = await invitedFixture();
  const { caller, tokens } = await login(test);
  const session = await caller.query(api.employeeIdentity.session, {});
  const now = vi
    .spyOn(Date, 'now')
    .mockReturnValue((session?.expiresAt ?? 0) + 1);
  try {
    expect(await caller.query(api.employeeIdentity.session, {})).toBeNull();
    expect(
      (
        await test.action(api.auth.signIn, {
          refreshToken: tokens?.refreshToken,
        })
      ).tokens,
    ).toBeNull();
  } finally {
    now.mockRestore();
  }
});
