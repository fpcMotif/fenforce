import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const CONVEX_DIRECTORY = 'deployments/convex';
const CANDIDATE_PATHS = [
  'deployments',
  'packages/twenty-front/src/pages/convex-preview',
  'packages/twenty-front/src/index.tsx',
  'docs/migration',
  'docs/adr',
  'CONTEXT.md',
];
const SECRET_FILES = /(^|\/)\.env(\.local)?$/;
const GENERATED_OR_VENDORED =
  /(^|\/)(node_modules|_generated|\.alchemy)\/|^docs\/migration\/evidence\//;
const APPLICATION_SOURCE = [
  'packages/twenty-server/src',
  'packages/twenty-front/src',
  'packages/twenty-shared/src',
  'packages/twenty-ui/src',
];

const problems = [];

const run = (command, commandArguments) => {
  try {
    return execFileSync(command, commandArguments, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    problems.push(
      `${command} ${commandArguments.join(' ')}: ${String(error.message).split('\n')[0]}`,
    );
    return '';
  }
};

const git = (...commandArguments) => run('git', commandArguments);
const lines = (output) => output.split('\n').filter(Boolean);
const readText = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const sha256 = (path) =>
  createHash('sha256')
    .update(readFileSync(resolve(ROOT, path)))
    .digest('hex');

const installedVersion = (packageName) => {
  try {
    return JSON.parse(
      readText(`${CONVEX_DIRECTORY}/node_modules/${packageName}/package.json`),
    ).version;
  } catch (error) {
    problems.push(`${packageName} version: ${error.message}`);
    return null;
  }
};

const upstreamBaseline = JSON.parse(
  readText('docs/migration/source-coverage.json'),
).upstreamBaseline;

const trackedChanges = lines(
  git('diff', '--name-only', 'HEAD', '--', ...CANDIDATE_PATHS),
);
const untracked = lines(
  git('ls-files', '--others', '--exclude-standard', '--', ...CANDIDATE_PATHS),
);
const candidateFiles = [...trackedChanges, ...untracked]
  .filter((path) => !SECRET_FILES.test(path))
  .filter((path) => !GENERATED_OR_VENDORED.test(path))
  .sort();

const committedApplicationSourceDiff = lines(
  git(
    'diff',
    '--name-only',
    upstreamBaseline,
    'HEAD',
    '--',
    ...APPLICATION_SOURCE,
  ),
);
const statusCounts = {};

for (const line of lines(git('status', '--porcelain'))) {
  const status = line.slice(0, 2).trim() || '?';
  statusCounts[status] = (statusCounts[status] ?? 0) + 1;
}

const provenance = {
  capturedAtUtc: new Date().toISOString(),
  source: {
    upstreamBaseline,
    upstreamBaselineResolves: git(
      'rev-parse',
      '--verify',
      `${upstreamBaseline}^{commit}`,
    ),
  },
  candidate: {
    branch: git('branch', '--show-current'),
    head: git('rev-parse', 'HEAD'),
    headSubject: git('log', '-1', '--format=%s'),
    mergeBaseWithBaseline: git('merge-base', 'HEAD', upstreamBaseline),
    worktreeStatusCounts: statusCounts,
    candidateFileChecksums: candidateFiles.map((path) => ({
      path,
      trackedChange: trackedChanges.includes(path),
      sha256: sha256(path),
    })),
    excludedFromChecksums:
      'environment files, generated output, installed packages, and the evidence directory itself',
  },
  applicationSourceAgainstBaseline: {
    committedDiffFileCount: committedApplicationSourceDiff.length,
    committedDiffFiles: committedApplicationSourceDiff,
    uncommittedApplicationSourceChanges: lines(
      git('status', '--porcelain', '--', ...APPLICATION_SOURCE),
    ),
  },
  toolchain: {
    bun: run('bun', ['--version']),
    node: run('node', ['--version']),
    nodeEnginesDeclared: JSON.parse(readText('package.json')).engines?.node,
    nvmrc: readText('.nvmrc').trim(),
    docker: run('docker', ['version', '--format', '{{.Server.Version}}']),
    convex: installedVersion('convex'),
    convexAuth: installedVersion('@convex-dev/auth'),
    convexTest: installedVersion('convex-test'),
    vitest: installedVersion('vitest'),
    typescript: installedVersion('typescript'),
  },
  flagsAndConfiguration: {
    previewPasswordSignUpDefault: run('rg', [
      '--no-config',
      '-o',
      '^FENFORCE_PREVIEW_AUTH_ENABLED=.*',
      `${CONVEX_DIRECTORY}/.env.schema`,
    ]),
    previewConvexUrlInHostingSchema: run('rg', [
      '--no-config',
      '-o',
      '^REACT_APP_FENFORCE_CONVEX_URL=.*',
      'deployments/cloudflare-front/.env.schema',
    ]),
    convexDeploymentEnvironment:
      'remote state; not captured without deployment access',
    twentyFrontEntry:
      'preview renders only when REACT_APP_FENFORCE_CONVEX_URL is set at build time',
  },
  problems,
};

console.log(JSON.stringify(provenance, null, 2));
