import { spawnSync } from 'node:child_process';

const checks = [
  [
    'migration-format',
    [
      'bunx',
      '--no-install',
      'oxfmt',
      '--check',
      'tools/migration',
      '.github/workflows/ci-migration.yaml',
    ],
  ],
  [
    'frontend-build',
    ['bun', 'run', '--cwd', 'deployments/cloudflare-front', 'build'],
  ],
  [
    'lint-rules',
    ['bun', 'run', '--cwd', 'packages/twenty-oxlint-rules', 'build:command'],
  ],
  [
    'architecture',
    ['bun', 'tools/migration/check-architecture-debt.mjs', '--self-test'],
  ],
  ['catalog', ['bun', 'docs/migration/check-map.mjs', '--self-test']],
  ['convex', ['bun', 'run', '--cwd', 'deployments/convex', 'check']],
  [
    'frontend-host',
    ['bun', 'run', '--cwd', 'deployments/cloudflare-front', 'check'],
  ],
  [
    'preview',
    ['bun', 'run', '--cwd', 'packages/twenty-front', 'check:convex-preview'],
  ],
];
const results = [];
for (const [name, [command, ...argumentsList]] of checks) {
  const result = spawnSync(command, argumentsList, { stdio: 'inherit' });
  results.push({ name, exitCode: result.status, error: result.error?.message });
}
console.log(JSON.stringify({ checks: results }, null, 2));
if (results.some((result) => result.exitCode !== 0)) process.exitCode = 1;
