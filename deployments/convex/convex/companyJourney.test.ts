import { convexTest } from 'convex-test';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const paginationOpts = { numItems: 20, cursor: null };

const SITE_URL = 'https://fixture.convex.site';
const INVITE_CODE = 'synthetic-company-journey-invite-code-0001';
const PASSWORD = 'synthetic-journey-password';
const OWNER_EMAIL = 'journey-owner@example.test';
const OUTSIDER_EMAIL = 'journey-outsider@example.test';
const COMPANY_NAME = 'Journey Fixture Co';
const COMPANY_DOMAIN = 'journey-fixture.example';

type TokenClaims = { iss?: string; sub?: string };

const evidence: Array<{ step: string; outcome: unknown }> = [];

const record = (step: string, outcome: unknown) => {
  evidence.push({ step, outcome });
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const outcomeOf = (attempt: Promise<unknown>) =>
  attempt.then(
    () => 'accepted',
    (error: unknown) => `rejected: ${errorMessage(error)}`,
  );

const configurePreviewAllowlist = (email: string) => {
  vi.stubEnv('FENFORCE_PREVIEW_AUTH_ENABLED', 'true');
  vi.stubEnv('FENFORCE_PREVIEW_AUTH_EMAIL', email);
  vi.stubEnv('FENFORCE_PREVIEW_INVITE_CODE', INVITE_CODE);
};

const toPrivateKeyPem = (der: ArrayBuffer) => {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(der)));

  return `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`;
};

const decodeClaims = (token: string): TokenClaims => {
  const payload = token.split('.')[1] ?? '';

  return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
};

const userIdOf = (claims: TokenClaims) => claims.sub?.split('|')[0];

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
  console.log(`COMPANY_JOURNEY_EVIDENCE ${JSON.stringify(evidence)}`);
});

describe('company journey on the Convex candidate', () => {
  it('signs in, opens a workspace, writes a company, and rejects unauthorized callers', async () => {
    const test = convexTest(schema, modules);

    const signIn = async (
      flow: 'signIn' | 'signUp',
      email: string,
      password: string,
    ) => {
      const result = await test.action(api.auth.signIn, {
        provider: 'preview-password',
        params: {
          flow,
          email,
          password,
          ...(flow === 'signUp' ? { inviteCode: INVITE_CODE } : {}),
        },
      });

      expect(result.tokens).not.toBeNull();

      const claims = decodeClaims(result.tokens?.token ?? '');
      const issuer = claims.iss ?? '';
      const subject = claims.sub ?? '';

      return {
        claims,
        session: test.withIdentity({
          issuer,
          subject,
          tokenIdentifier: `${issuer}|${subject}`,
        }),
      };
    };

    configurePreviewAllowlist(OWNER_EMAIL);
    const enrollment = await signIn('signUp', OWNER_EMAIL, PASSWORD);
    expect(enrollment.claims.iss).toBe(SITE_URL);
    expect(userIdOf(enrollment.claims)).toBeTruthy();
    record('sign-up (allowlisted email, invite code)', {
      tokenIssued: true,
      issuer: enrollment.claims.iss,
    });

    const returning = await signIn('signIn', OWNER_EMAIL, PASSWORD);
    const sameUserAsSignUp =
      userIdOf(returning.claims) === userIdOf(enrollment.claims);
    record('sign-in (existing account)', {
      tokenIssued: true,
      sameUserAsSignUp,
    });
    expect(sameUserAsSignUp).toBe(true);

    const wrongPassword = await outcomeOf(
      test.action(api.auth.signIn, {
        provider: 'preview-password',
        params: {
          flow: 'signIn',
          email: OWNER_EMAIL,
          password: 'synthetic-wrong-password',
        },
      }),
    );
    record('sign-in (wrong password)', wrongPassword);
    expect(wrongPassword).toMatch(/^rejected/);

    const owner = returning.session;
    const workspaceId = await owner.mutation(api.workspaces.create, {
      name: 'Journey Workspace',
    });
    const workspaces = await owner.query(api.workspaces.listMine, {
      paginationOpts,
    });
    record('open workspace', {
      workspaces: workspaces.page.map(({ name, role }) => ({ name, role })),
    });
    expect(workspaces.page).toMatchObject([
      { workspaceId, name: 'Journey Workspace', role: 'admin' },
    ]);

    const beforeCreate = await owner.query(api.workspaceCompanies.list, {
      workspaceId,
      paginationOpts,
    });
    record('list companies (before write)', {
      count: beforeCreate.page.length,
      names: beforeCreate.page.map(({ name }) => name),
    });
    expect(beforeCreate.page).toEqual([]);

    const companyId = await owner.mutation(api.workspaceCompanies.create, {
      workspaceId,
      name: COMPANY_NAME,
      domainName: COMPANY_DOMAIN,
    });
    const created = await owner.query(api.workspaceCompanies.get, {
      workspaceId,
      companyId,
    });
    const afterCreate = await owner.query(api.workspaceCompanies.list, {
      workspaceId,
      paginationOpts,
    });
    record('create company then read back', {
      name: created?.name,
      domainName: created?.domainName,
      accountOwnerId: created?.accountOwnerId,
      deletedAt: created?.deletedAt,
      listedNames: afterCreate.page.map(({ name }) => name),
    });
    expect(created).toMatchObject({
      name: COMPANY_NAME,
      domainName: {
        primaryLinkUrl: `https://${COMPANY_DOMAIN}`,
        primaryLinkLabel: COMPANY_DOMAIN,
        secondaryLinks: [],
      },
      accountOwnerId: null,
      deletedAt: null,
    });
    expect(afterCreate.page.map(({ name }) => name)).toEqual([COMPANY_NAME]);

    const persisted = await test.run(async (context) => {
      const rows = await context.db.query('workspaceCompanies').collect();

      return rows.map((row) => ({
        name: row.name,
        domainName: row.domainName,
        deletedAt: row.deletedAt,
        inOwnerWorkspace: row.workspaceId === workspaceId,
      }));
    });
    record('persisted rows (workspaceCompanies)', persisted);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.inOwnerWorkspace).toBe(true);

    const anonymous = await outcomeOf(
      test.query(api.workspaceCompanies.list, { workspaceId, paginationOpts }),
    );
    record('unauthorized: no credentials', anonymous);
    expect(anonymous).toContain('UNAUTHENTICATED');

    configurePreviewAllowlist(OUTSIDER_EMAIL);
    const outsiderEnrollment = await signIn('signUp', OUTSIDER_EMAIL, PASSWORD);
    expect(userIdOf(outsiderEnrollment.claims)).not.toBe(
      userIdOf(enrollment.claims),
    );
    const outsider = outsiderEnrollment.session;

    const foreignRead = await outcomeOf(
      outsider.query(api.workspaceCompanies.list, {
        workspaceId,
        paginationOpts,
      }),
    );
    record('unauthorized: signed-in user outside the workspace', foreignRead);
    expect(foreignRead).toContain('FORBIDDEN');

    const foreignWrite = await outcomeOf(
      outsider.mutation(api.workspaceCompanies.create, {
        workspaceId,
        name: 'Intrusion',
      }),
    );
    record('unauthorized: foreign write', foreignWrite);
    expect(foreignWrite).toContain('FORBIDDEN');

    const outsiderWorkspaceId = await outsider.mutation(api.workspaces.create, {
      name: 'Outsider Workspace',
    });
    const outsiderOwnList = await outsider.query(api.workspaceCompanies.list, {
      workspaceId: outsiderWorkspaceId,
      paginationOpts,
    });
    record('scoping: a member of another workspace lists only that workspace', {
      count: outsiderOwnList.page.length,
    });
    expect(outsiderOwnList.page).toEqual([]);

    const rowsAfterIntrusion = await test.run((context) =>
      context.db.query('workspaceCompanies').collect(),
    );
    expect(rowsAfterIntrusion).toHaveLength(1);
  });
});
