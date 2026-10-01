import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
process.chdir(root);
const projects = [
  'node',
  'dom',
  'browser',
  'storybook',
  'integration',
  'secure-deployment',
  'provider',
];
const profile = process.argv[2] ?? 'pr';
const selected =
  profile === 'pr'
    ? projects.slice(0, 4)
    : profile === 'extended'
      ? projects
      : projects.includes(profile)
        ? [profile]
        : [];
const shard = process.argv[3];
if (
  !selected.length ||
  process.argv.length > 4 ||
  (shard && (profile !== 'node' || !/^[12]\/2$/.test(shard)))
) {
  throw new Error(
    'Usage: bun check.mts pr|extended|node|dom|browser|storybook|integration|secure-deployment|provider [1/2|2/2 for node]',
  );
}
const nodeVersion = spawnSync('node', ['--version'], {
  encoding: 'utf8',
}).stdout?.trim();
const bunVersion = spawnSync('bun', ['--version'], {
  encoding: 'utf8',
}).stdout?.trim();
if (nodeVersion !== 'v24.16.0' || bunVersion !== '1.4.2') {
  throw new Error('Use pinned Node 24.16.0 and Bun 1.4.2; see mise.toml');
}
const revision =
  spawnSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).stdout?.trim() || 'unavailable';
const excludedDirectories = new Set([
  'node_modules',
  'artifacts',
  '.vitest',
  '.stryker-tmp',
  '.git',
]);
const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory())
      return excludedDirectories.has(entry.name) ? [] : sourceFiles(path);
    return entry.isFile() ? [path] : [];
  });
const sourceDigest = createHash('sha256');
for (const path of sourceFiles(root).sort()) {
  sourceDigest
    .update(relative(root, path))
    .update('\0')
    .update(readFileSync(path))
    .update('\0');
}
const sourceSha256 = sourceDigest.digest('hex');
let failed = false;
for (const project of selected) {
  const directory = `artifacts/${project}${shard ? `-${shard.replace('/', '-')}` : ''}`;
  rmSync(directory, { recursive: true, force: true });
  mkdirSync(directory, { recursive: true });
  const started = Date.now();
  const args = ['test', 'run', '--project', project];
  if (project === 'node' && !shard) args.push('--coverage');
  if (shard) args.push(`--shard=${shard}`);
  const result = spawnSync('node_modules/.bin/vp', args, {
    stdio: 'inherit',
    timeout: 120000,
    env: { ...process.env, COMPATIBILITY_ARTIFACTS: directory },
  });
  let passed = 0;
  let complete = false;
  try {
    const report = JSON.parse(
      readFileSync(`${directory}/results.json`, 'utf8'),
    );
    passed = report.numPassedTests;
    complete =
      report.success === true && passed > 0 && passed === report.numTotalTests;
  } catch {
    complete = false;
  }
  const verified = result.status === 0 && complete;
  const evidence = {
    project,
    revision,
    sourceSha256,
    nodeVersion,
    bunVersion,
    command: ['vp', ...args],
    elapsedMilliseconds: Date.now() - started,
    exitCode: result.status,
    passed,
    status: verified ? 'verified' : 'failed-or-blocked',
    boundary:
      'synthetic compatibility fixture; no CRM journey or hosted-provider claim',
  };
  writeFileSync(
    `${directory}/execution.json`,
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
  if (!verified) {
    console.error(
      `${project}: failed, empty, skipped, or missing results. Required suites cannot pass without executed assertions.`,
    );
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;
