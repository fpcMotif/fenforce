import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const SERVER_URL = process.env.TWENTY_SERVER_URL ?? 'http://localhost:3000';
const COMPOSE_FILE = resolve(
  import.meta.dir,
  '../../../../packages/twenty-docker/docker-compose.dev.yml',
);
const DEMO_ACCOUNT = { email: 'tim@apple.dev', password: 'tim@apple.dev' };
const COMPANY_NAME = 'Journey Fixture Co';
const COMPANY_DOMAIN = 'journey-fixture.example';
const COMPANY_FIELDS = `
  id
  name
  domainName { primaryLinkUrl primaryLinkLabel secondaryLinks { url label } }
  accountOwnerId
  deletedAt
`;

type GraphqlError = { message: string; extensions?: { code?: string } };
type GraphqlResult<TData> = {
  status: number;
  body: { data?: TData | null; errors?: GraphqlError[] };
};
type CompanyNode = {
  id: string;
  name: string;
  domainName: {
    primaryLinkUrl: string;
    primaryLinkLabel: string;
    secondaryLinks: Array<{ url: string; label: string }> | null;
  };
  accountOwnerId: string | null;
  deletedAt: string | null;
};
type CompanyList = {
  companies: {
    edges: Array<{ node: CompanyNode }>;
    pageInfo: { hasNextPage: boolean };
    totalCount: number;
  };
};

const evidence: Array<{ step: string; outcome: unknown }> = [];

const record = (step: string, outcome: unknown) => {
  evidence.push({ step, outcome });
};

const call = async <TData>(
  path: '/graphql' | '/metadata',
  query: string,
  variables: Record<string, unknown> = {},
  token?: string,
): Promise<GraphqlResult<TData>> => {
  const response = await fetch(`${SERVER_URL}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: SERVER_URL,
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ query, variables }),
  });

  return {
    status: response.status,
    body: (await response.json()) as GraphqlResult<TData>['body'],
  };
};

const outcomeOf = ({ status, body }: GraphqlResult<unknown>) =>
  body.errors === undefined
    ? 'accepted'
    : `rejected: ${body.errors[0]?.extensions?.code ?? 'NO_CODE'}: ${body.errors[0]?.message} (http ${status})`;

const exchangeLoginToken = async (loginToken: string) => {
  const exchange = await call<{
    getAuthTokensFromLoginToken: {
      tokens: { accessOrWorkspaceAgnosticToken: { token: string } };
    };
  }>(
    '/metadata',
    `mutation ($loginToken: String!, $origin: String!) {
      getAuthTokensFromLoginToken(loginToken: $loginToken, origin: $origin) {
        tokens { accessOrWorkspaceAgnosticToken { token } }
      }
    }`,
    { loginToken, origin: SERVER_URL },
  );

  return {
    failure: exchange.body.errors === undefined ? undefined : outcomeOf(exchange),
    token:
      exchange.body.data?.getAuthTokensFromLoginToken.tokens
        .accessOrWorkspaceAgnosticToken.token,
  };
};

const signIn = async (email: string, password: string) => {
  const login = await call<{
    getLoginTokenFromCredentials: { loginToken: { token: string } };
  }>(
    '/metadata',
    `mutation ($email: String!, $password: String!, $origin: String!) {
      getLoginTokenFromCredentials(email: $email, password: $password, origin: $origin) {
        loginToken { token }
      }
    }`,
    { email, password, origin: SERVER_URL },
  );
  const loginToken = login.body.data?.getLoginTokenFromCredentials.loginToken.token;

  return loginToken === undefined
    ? { failure: outcomeOf(login), token: undefined }
    : exchangeLoginToken(loginToken);
};

const signInToWorkspace = async (
  email: string,
  password: string,
  workspaceDisplayName: string,
) => {
  const login = await call<{
    signIn: {
      availableWorkspaces: {
        availableWorkspacesForSignIn: Array<{
          displayName: string | null;
          loginToken: string | null;
        }>;
      };
    };
  }>(
    '/metadata',
    `mutation ($email: String!, $password: String!) {
      signIn(email: $email, password: $password) {
        availableWorkspaces { availableWorkspacesForSignIn { displayName loginToken } }
      }
    }`,
    { email, password },
  );
  const loginToken = login.body.data?.signIn.availableWorkspaces.availableWorkspacesForSignIn.find(
    (workspace) => workspace.displayName === workspaceDisplayName,
  )?.loginToken;

  return loginToken == null
    ? { failure: outcomeOf(login), token: undefined }
    : exchangeLoginToken(loginToken);
};

const findCompanies = (token: string | undefined, filter: object = {}) =>
  call<CompanyList>(
    '/graphql',
    `query ($filter: CompanyFilterInput) {
      companies(first: 5, filter: $filter, orderBy: [{ name: AscNullsFirst }]) {
        edges { node { ${COMPANY_FIELDS} } }
        pageInfo { hasNextPage }
        totalCount
      }
    }`,
    { filter },
    token,
  );

const psql = (sql: string) =>
  execFileSync(
    'docker',
    [
      'compose',
      '-f',
      COMPOSE_FILE,
      'exec',
      '-T',
      'db',
      'psql',
      '-U',
      'postgres',
      '-d',
      'default',
      '-Atc',
      sql,
    ],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean);

const main = async () => {
  const session = await signIn(DEMO_ACCOUNT.email, DEMO_ACCOUNT.password);
  record('sign-in (existing account)', {
    tokenIssued: session.token !== undefined,
    failure: session.failure,
  });

  const wrong = await signIn(DEMO_ACCOUNT.email, 'synthetic-wrong-password');
  record('sign-in (wrong password)', wrong.failure ?? 'accepted');

  const token = session.token;

  if (token === undefined) {
    console.log(JSON.stringify(evidence, null, 2));
    process.exitCode = 1;
    return;
  }

  const workspace = await call<{ currentWorkspace: { displayName: string } }>(
    '/metadata',
    'query { currentWorkspace { displayName } }',
    {},
    token,
  );
  record('open workspace', {
    displayName: workspace.body.data?.currentWorkspace.displayName,
    errors: workspace.body.errors,
  });

  const before = await findCompanies(token);
  const fixtureBefore = await findCompanies(token, {
    name: { eq: COMPANY_NAME },
  });
  record('list companies (before write)', {
    totalCount: before.body.data?.companies.totalCount,
    fixtureRows: fixtureBefore.body.data?.companies.totalCount,
    errors: before.body.errors,
  });

  const created = await call<{ createCompany: CompanyNode }>(
    '/graphql',
    `mutation ($input: CompanyCreateInput!) { createCompany(data: $input) { ${COMPANY_FIELDS} } }`,
    {
      input: {
        name: COMPANY_NAME,
        domainName: { primaryLinkUrl: COMPANY_DOMAIN },
      },
    },
    token,
  );
  const company = created.body.data?.createCompany;
  const readBack = await findCompanies(token, { id: { eq: company?.id } });
  const after = await findCompanies(token);
  const readBackNode = readBack.body.data?.companies.edges[0]?.node;
  record('create company then read back', {
    created: {
      name: company?.name,
      domainName: company?.domainName,
      accountOwnerId: company?.accountOwnerId,
      deletedAt: company?.deletedAt,
    },
    readBackById: {
      found: readBack.body.data?.companies.totalCount,
      name: readBackNode?.name,
      domainName: readBackNode?.domainName,
    },
    totalCountAfter: after.body.data?.companies.totalCount,
    errors: created.body.errors,
  });

  record(
    'persisted rows (workspace company tables)',
    psql(
      `select table_schema from information_schema.tables where table_name = 'company' and table_schema like 'workspace_%'`,
    ).map((schema) => ({
      schema,
      rows: psql(
        `select name, "domainNamePrimaryLinkUrl", "domainNamePrimaryLinkLabel", "deletedAt" is null as live from ${schema}.company where name = '${COMPANY_NAME}'`,
      ),
    })),
  );

  record('unauthorized: no credentials', outcomeOf(await findCompanies(undefined)));
  record(
    'unauthorized: invalid token',
    outcomeOf(await findCompanies('not-a-real-token')),
  );

  const otherWorkspace = await signInToWorkspace(
    DEMO_ACCOUNT.email,
    DEMO_ACCOUNT.password,
    'YCombinator',
  );
  const otherRead = await findCompanies(otherWorkspace.token, {
    id: { eq: company?.id },
  });
  const otherFixtureByName = await findCompanies(otherWorkspace.token, {
    name: { eq: COMPANY_NAME },
  });
  record('cross-workspace: same account signed into the other workspace', {
    tokenIssued: otherWorkspace.token !== undefined,
    failure: otherWorkspace.failure,
    canReadFixtureById: otherRead.body.data?.companies.totalCount,
    fixtureByNameRows: otherFixtureByName.body.data?.companies.totalCount,
    otherWorkspaceTotal: (await findCompanies(otherWorkspace.token)).body.data
      ?.companies.totalCount,
  });

  console.log(JSON.stringify(evidence, null, 2));
};

await main();
