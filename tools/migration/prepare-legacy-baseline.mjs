import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASELINE_REVISION = '1bf3ec682fcc7b768d1ea895d1a39ec917299b5c';
const checkout = realpathSync(resolve(process.argv[2] ?? '.'));
const sourceCheckout = realpathSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
);
if (checkout === sourceCheckout) {
  throw new Error(
    'Use a separate baseline worktree, not the migration checkout.',
  );
}
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: checkout,
  encoding: 'utf8',
}).trim();
if (revision !== BASELINE_REVISION) {
  throw new Error(`Baseline must use revision ${BASELINE_REVISION}.`);
}
const runtimeDirectory = join(checkout, '.migration-baseline');
const serverEnvironment = join(checkout, 'packages/twenty-server/.env');
const frontendEnvironment = join(checkout, 'packages/twenty-front/.env');
for (const path of [runtimeDirectory, serverEnvironment, frontendEnvironment]) {
  if (existsSync(path)) throw new Error(`Refusing to replace ${path}.`);
}
const ports = [33100, 33101, 55432, 56379];
for (const port of ports) {
  await new Promise((accept, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(accept));
  });
}
mkdirSync(runtimeDirectory, { mode: 0o700 });
const databasePassword = randomBytes(32).toString('hex');
const writePrivateFile = (path, contents) =>
  writeFileSync(path, contents, { mode: 0o600, flag: 'wx' });
writePrivateFile(
  join(runtimeDirectory, 'postgres.env'),
  `POSTGRES_USER=fenforce_baseline\nPOSTGRES_DB=fenforce_baseline\nPOSTGRES_PASSWORD=${databasePassword}\n`,
);
writePrivateFile(
  serverEnvironment,
  [
    'NODE_ENV=development',
    'NODE_PORT=33101',
    'FRONTEND_URL=http://localhost:33100',
    'SERVER_URL=http://localhost:33101',
    `PG_DATABASE_URL=postgres://fenforce_baseline:${databasePassword}@127.0.0.1:55432/fenforce_baseline`,
    'REDIS_URL=redis://127.0.0.1:56379',
    `APP_SECRET=${randomBytes(32).toString('hex')}`,
    'SIGN_IN_PREFILLED=true',
    'AUTH_PASSWORD_ENABLED=true',
    'IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS=false',
    'IS_MULTIWORKSPACE_ENABLED=true',
    'IS_EMAIL_VERIFICATION_REQUIRED=false',
    'IS_BILLING_ENABLED=false',
    'IS_CONFIG_VARIABLES_IN_DB_ENABLED=false',
    'AUTH_GOOGLE_ENABLED=false',
    'AUTH_MICROSOFT_ENABLED=false',
    'MESSAGING_PROVIDER_GMAIL_ENABLED=false',
    'CALENDAR_PROVIDER_GOOGLE_ENABLED=false',
    'MESSAGING_PROVIDER_MICROSOFT_ENABLED=false',
    'CALENDAR_PROVIDER_MICROSOFT_ENABLED=false',
    'IS_IMAP_SMTP_CALDAV_ENABLED=false',
    'EMAIL_DRIVER=LOGGER',
    'EMAILING_DOMAIN_DRIVER=LOG',
    'STORAGE_TYPE=local',
    'STORAGE_LOCAL_PATH=.local-storage',
    'ANALYTICS_ENABLED=false',
    'TELEMETRY_ENABLED=false',
    'MARKETPLACE_CATALOG_SYNC_CRON_ENABLED=false',
    '',
  ].join('\n'),
);
writePrivateFile(
  frontendEnvironment,
  'REACT_APP_SERVER_BASE_URL=http://localhost:33101\nREACT_APP_PORT=33100\nVITE_BUILD_SOURCEMAP=false\n',
);
writePrivateFile(
  join(runtimeDirectory, 'compose.json'),
  `${JSON.stringify(
    {
      name: 'fenforce-migration-baseline',
      services: {
        postgres: {
          image:
            'postgres@sha256:e62fbf9d3e2b49816a32c400ed2dba83e3b361e6833e624024309c35d334b412',
          env_file: ['./postgres.env'],
          ports: ['127.0.0.1:55432:5432'],
          volumes: ['postgres-data:/var/lib/postgresql/data'],
          healthcheck: {
            test: [
              'CMD-SHELL',
              'pg_isready -U fenforce_baseline -d fenforce_baseline',
            ],
            interval: '2s',
            timeout: '5s',
            retries: 30,
          },
        },
        redis: {
          image:
            'redis@sha256:c6eabf748fc7a61dbb5a705c78bcf3d6377b1127a97d0ce965c11c44ba46896f',
          ports: ['127.0.0.1:56379:6379'],
          command: ['redis-server', '--save', '', '--appendonly', 'no'],
          healthcheck: {
            test: ['CMD', 'redis-cli', 'ping'],
            interval: '2s',
            timeout: '5s',
            retries: 30,
          },
        },
      },
      volumes: { 'postgres-data': {} },
    },
    null,
    2,
  )}\n`,
);
console.log(JSON.stringify({ checkout, revision, runtimeDirectory, ports }));
