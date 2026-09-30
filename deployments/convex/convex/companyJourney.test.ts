import { convexTest } from 'convex-test';
import { decodeJwt, exportJWK, exportPKCS8, generateKeyPair } from 'jose';
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

beforeAll(async () => {
  const keys = await generateKeyPair('RS256', { extractable: true });

  vi.stubEnv('CONVEX_SITE_URL', SITE_URL);
  vi.stubEnv('SITE_URL', SITE_URL);
  vi.stubEnv('JWT_PRIVATE_KEY', await exportPKCS8(keys.privateKey));
  vi.stubEnv(
    'JWKS',
    JSON.stringify({
      keys: [{ use: 'sig', ...(await exportJWK(keys.publicKey)) }],
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

      const claims = decodeJwt(result.tokens?.token ?? '');
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
    record('sign-up (allowlisted email, invite code)', {
      tokenIssued: true,
      issuer: enrollment.claims.iss,
    });

    const returning = await signIn('signIn', OWNER_EMAIL, PASSWORD);
    record('sign-in (existing account)', {
      tokenIssued: true,
      sameUserAsSignUp:
        returning.claims.sub?.split('|')[0] ===
        enrollment.claims.sub?.split('|')[0],
    });

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

      return rows.map(({ name, domainName, deletedAt, workspaceId: id }) => ({
        name,
        domainName,
        deletedAt,
        inOwnerWorkspace: id === workspaceId,
      }));
    });
    record('persisted rows (workspaceCompanies)', persisted);
    expect(persisted).toHaveLength(1);

    const anonymous = await outcomeOf(
      test.query(api.workspaceCompanies.list, { workspaceId, paginationOpts }),
    );
    record('unauthorized: no credentials', anonymous);
    expect(anonymous).toContain('UNAUTHENTICATED');

    configurePreviewAllowlist(OUTSIDER_EMAIL);
    const outsider = (await signIn('signUp', OUTSIDER_EMAIL, PASSWORD)).session;
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

    const rowsAfterIntrusion = await test.run((context) =>
      context.db.query('workspaceCompanies').collect(),
    );
    expect(rowsAfterIntrusion).toHaveLength(1);
  });
});
