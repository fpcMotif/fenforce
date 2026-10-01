import { convexTest } from 'convex-test';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { FIXTURE_SITE_URL } from '../testing/sessionFixtures';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const paginationOpts = { numItems: 20, cursor: null };

const SITE_URL = FIXTURE_SITE_URL;
const INVITE_CODE = 'synthetic-session-lifecycle-invite-code-01';
const PASSWORD = 'synthetic-session-password';
const MEMBER_EMAIL = 'session-member@example.test';

const toPrivateKeyPem = (der: ArrayBuffer) => {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(der)));

  return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`;
};

const decodeClaims = (token: string): { iss?: string; sub?: string } => {
  const payload = token.split('.')[1] ?? '';

  return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const outcomeOf = (attempt: Promise<unknown>) =>
  attempt.then(
    () => 'accepted',
    (error: unknown) => `rejected: ${errorMessage(error)}`,
  );

beforeAll(async () => {
  const keys = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );

  vi.stubEnv('CONVEX_SITE_URL', SITE_URL);
  vi.stubEnv('SITE_URL', SITE_URL);
  vi.stubEnv('FENFORCE_PREVIEW_AUTH_ENABLED', 'true');
  vi.stubEnv('FENFORCE_PREVIEW_AUTH_EMAIL', MEMBER_EMAIL);
  vi.stubEnv('FENFORCE_PREVIEW_INVITE_CODE', INVITE_CODE);
  vi.stubEnv(
    'JWT_PRIVATE_KEY',
    toPrivateKeyPem(await crypto.subtle.exportKey('pkcs8', keys.privateKey)),
  );
  vi.stubEnv(
    'JWKS',
    JSON.stringify({
      keys: [
        {
          use: 'sig',
          ...(await crypto.subtle.exportKey('jwk', keys.publicKey)),
        },
      ],
    }),
  );
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const createFixture = async () => {
  const test = convexTest(schema, modules);

  const signIn = async (flow: 'signIn' | 'signUp') => {
    const result = await test.action(api.auth.signIn, {
      provider: 'preview-password',
      params: {
        flow,
        email: MEMBER_EMAIL,
        password: PASSWORD,
        ...(flow === 'signUp' ? { inviteCode: INVITE_CODE } : {}),
      },
    });
    const claims = decodeClaims(result.tokens?.token ?? '');
    const issuer = claims.iss ?? '';
    const subject = claims.sub ?? '';

    return test.withIdentity({
      issuer,
      subject,
      tokenIdentifier: `${issuer}|${subject}`,
    });
  };

  const firstSession = await signIn('signUp');
  const workspaceId = await firstSession.mutation(api.workspaces.create, {
    name: 'Session Workspace',
  });
  const companyId = await firstSession.mutation(api.workspaceCompanies.create, {
    workspaceId,
    name: 'Session Fixture Co',
  });
  const secondSession = await signIn('signIn');

  return { test, firstSession, secondSession, workspaceId, companyId };
};

type Fixture = Awaited<ReturnType<typeof createFixture>>;
type Caller = Pick<Fixture['test'], 'query' | 'mutation'>;

const protectedReads = (
  caller: Caller,
  { workspaceId, companyId }: Pick<Fixture, 'workspaceId' | 'companyId'>,
) => ({
  'workspaces.listMine': () =>
    caller.query(api.workspaces.listMine, { paginationOpts }),
  'workspaces.listMembers': () =>
    caller.query(api.workspaces.listMembers, { workspaceId, paginationOpts }),
  'workspaceCompanies.list': () =>
    caller.query(api.workspaceCompanies.list, { workspaceId, paginationOpts }),
  'workspaceCompanies.get': () =>
    caller.query(api.workspaceCompanies.get, { workspaceId, companyId }),
  'companies.listDemo': () => caller.query(api.companies.listDemo, {}),
});

describe('anonymous callers', () => {
  it('cannot read workspace or company data', async () => {
    const fixture = await createFixture();
    const outcomes: Record<string, string> = {};

    for (const [name, read] of Object.entries(
      protectedReads(fixture.test, fixture),
    )) {
      outcomes[name] = await outcomeOf(read());
    }

    expect(outcomes).toEqual({
      'workspaces.listMine': 'rejected: UNAUTHENTICATED',
      'workspaces.listMembers': 'rejected: UNAUTHENTICATED',
      'workspaceCompanies.list': 'rejected: UNAUTHENTICATED',
      'workspaceCompanies.get': 'rejected: UNAUTHENTICATED',
      'companies.listDemo': 'rejected: UNAUTHENTICATED',
    });
  });

  it('cannot create a workspace or write a company', async () => {
    const { test, workspaceId, companyId } = await createFixture();

    expect(
      await outcomeOf(test.mutation(api.workspaces.create, { name: 'Anon' })),
    ).toBe('rejected: UNAUTHENTICATED');
    expect(
      await outcomeOf(
        test.mutation(api.workspaceCompanies.create, {
          workspaceId,
          name: 'Anon Co',
        }),
      ),
    ).toBe('rejected: UNAUTHENTICATED');
    expect(
      await outcomeOf(
        test.mutation(api.workspaceCompanies.update, {
          workspaceId,
          companyId,
          expectedRevision: 1,
          name: 'Anon edit',
        }),
      ),
    ).toBe('rejected: UNAUTHENTICATED');
    expect(
      await outcomeOf(
        test.mutation(api.workspaceCompanies.softDelete, {
          workspaceId,
          companyId,
        }),
      ),
    ).toBe('rejected: UNAUTHENTICATED');
  });
});

describe('sign-out', () => {
  it('ends the session so a retained token can no longer read', async () => {
    const fixture = await createFixture();
    const { test, firstSession } = fixture;

    const before = await firstSession.query(api.workspaces.listMine, {
      paginationOpts,
    });
    expect(before.page).toHaveLength(1);

    await firstSession.action(api.auth.signOut, {});

    for (const [name, read] of Object.entries(
      protectedReads(firstSession, fixture),
    )) {
      expect(await outcomeOf(read()), name).toBe('rejected: UNAUTHENTICATED');
    }

    const writeAfterSignOut = await outcomeOf(
      firstSession.mutation(api.workspaceCompanies.create, {
        workspaceId: fixture.workspaceId,
        name: 'After sign-out',
      }),
    );
    expect(writeAfterSignOut).toBe('rejected: UNAUTHENTICATED');

    const rows = await test.run((context) =>
      context.db.query('workspaceCompanies').collect(),
    );
    expect(rows.map(({ name }) => name)).toEqual(['Session Fixture Co']);
  });

  it('leaves the same user’s other session working', async () => {
    const { firstSession, secondSession, workspaceId } = await createFixture();

    await firstSession.action(api.auth.signOut, {});

    const companies = await secondSession.query(
      api.workspaceCompanies.list,
      { workspaceId, paginationOpts },
    );
    expect(companies.page.map(({ name }) => name)).toEqual([
      'Session Fixture Co',
    ]);
  });
});

describe('invalid and expired sessions', () => {
  it('rejects a token whose session does not exist', async () => {
    const fixture = await createFixture();
    const { test, firstSession } = fixture;
    const identity = await firstSession.query(api.workspaces.listMine, {
      paginationOpts,
    });
    expect(identity.page).toHaveLength(1);

    const sessions = await test.run((context) =>
      context.db.query('authSessions').collect(),
    );
    const userId = sessions[0]?.userId;
    expect(userId).toBeDefined();

    const forged = test.withIdentity({
      issuer: SITE_URL,
      subject: `${userId}|jx7forgedsessionid0000000000000000`,
      tokenIdentifier: `${SITE_URL}|${userId}|jx7forgedsessionid0000000000000000`,
    });

    for (const [name, read] of Object.entries(
      protectedReads(forged, fixture),
    )) {
      expect(await outcomeOf(read()), name).toBe('rejected: UNAUTHENTICATED');
    }
  });

  it('rejects a token without a session component', async () => {
    const fixture = await createFixture();
    const bare = fixture.test.withIdentity({
      issuer: SITE_URL,
      subject: 'no-session-component',
      tokenIdentifier: `${SITE_URL}|no-session-component`,
    });

    expect(
      await outcomeOf(
        bare.query(api.workspaces.listMine, { paginationOpts }),
      ),
    ).toBe('rejected: UNAUTHENTICATED');
  });

  it('rejects a session past its expiration time', async () => {
    const fixture = await createFixture();
    const { test, firstSession } = fixture;

    await test.run(async (context) => {
      for (const session of await context.db.query('authSessions').collect()) {
        await context.db.patch(session._id, {
          expirationTime: Date.now() - 1_000,
        });
      }
    });

    for (const [name, read] of Object.entries(
      protectedReads(firstSession, fixture),
    )) {
      expect(await outcomeOf(read()), name).toBe('rejected: UNAUTHENTICATED');
    }
  });
});
