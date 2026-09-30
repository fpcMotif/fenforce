import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

const run = (command, args, options = {}) => {
  try {
    return execFileSync(command, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    }).trim();
  } catch (error) {
    return `unavailable: ${String(error.message).split('\n')[0]}`;
  }
};

const git = (...args) => run('git', args);
const sha256 = (path) =>
  createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');

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

const upstreamBaseline = JSON.parse(
  readFileSync(resolve(root, 'docs/migration/source-coverage.json'), 'utf8'),
).upstreamBaseline;

const trackedChanges = git('diff', '--name-only', 'HEAD', '--', ...CANDIDATE_PATHS)
  .split('\n')
  .filter(Boolean);
const untracked = git(
  'ls-files',
  '--others',
  '--exclude-standard',
  '--',
  ...CANDIDATE_PATHS,
)
  .split('\n')
  .filter(Boolean);

const candidateFiles = [...trackedChanges, ...untracked]
  .filter((path) => !SECRET_FILES.test(path))
  .filter((path) => !GENERATED_OR_VENDORED.test(path))
  .sort();

const version = (packageName, directory) => {
  try {
    return JSON.parse(
      readFileSync(
        resolve(root, directory, 'node_modules', packageName, 'package.json'),
        'utf8',
      ),
    ).version;
  } catch {
    return 'unavailable';
  }
};

const convexDirectory = 'deployments/convex';
const convexDeploymentName = (() => {
  try {
    return readFileSync(resolve(root, convexDirectory, '.env.local'), 'utf8')
      .split('\n')
      .find((line) => line.startsWith('CONVEX_DEPLOYMENT='))
      ?.split('=')[1]
      ?.split(' ')[0];
  } catch {
    return 'unavailable';
  }
})();

const provenance = {
  capturedAtUtc: new Date().toISOString(),
  source: {
    upstreamBaseline,
    upstreamBaselineResolves: git('rev-parse', '--verify', `${upstreamBaseline}^{commit}`),
  },
  candidate: {
    branch: git('branch', '--show-current'),
    head: git('rev-parse', 'HEAD'),
    headSubject: git('log', '-1', '--format=%s'),
    mergeBaseWithBaseline: git('merge-base', 'HEAD', upstreamBaseline),
    worktreeStatusCounts: Object.fromEntries(
      Object.entries(
        git('status', '--porcelain')
          .split('\n')
          .filter(Boolean)
          .reduce((counts, line) => {
            const key = line.slice(0, 2).trim() || '?';
            counts[key] = (counts[key] ?? 0) + 1;
            return counts;
          }, {}),
      ),
    ),
    candidateFileChecksums: candidateFiles.map((path) => ({
      path,
      trackedChange: trackedChanges.includes(path),
      sha256: sha256(path),
    })),
    excludedFromChecksums:
      'environment files, generated output, and installed packages',
  },
  applicationSourceAgainstBaseline: {
    committedDiffFileCount: git(
      'diff',
      '--name-only',
      upstreamBaseline,
      'HEAD',
      '--',
      ...APPLICATION_SOURCE,
    )
      .split('\n')
      .filter(Boolean).length,
    committedDiffFiles: git(
      'diff',
      '--name-only',
      upstreamBaseline,
      'HEAD',
      '--',
      ...APPLICATION_SOURCE,
    )
      .split('\n')
      .filter(Boolean),
    uncommittedApplicationSourceChanges: git(
      'status',
      '--porcelain',
      '--',
      ...APPLICATION_SOURCE,
    )
      .split('\n')
      .filter(Boolean),
  },
  toolchain: {
    bun: run('bun', ['--version']),
    node: run('node', ['--version']),
    docker: run('docker', ['version', '--format', '{{.Server.Version}}']),
    convex: version('convex', convexDirectory),
    convexAuth: version('@convex-dev/auth', convexDirectory),
    convexTest: version('convex-test', convexDirectory),
    vitest: version('vitest', convexDirectory),
    typescript: version('typescript', convexDirectory),
  },
  flagsAndConfiguration: {
    previewPasswordSignUpDefault: run('rg', [
      '--no-config',
      '-o',
      '^FENFORCE_PREVIEW_AUTH_ENABLED=.*',
      `${convexDirectory}/.env.schema`,
    ]),
    convexDeploymentName,
    convexDeploymentEnvironment:
      'remote state; not captured without deployment access',
    twentyFrontEntry:
      'preview renders only when REACT_APP_FENFORCE_CONVEX_URL is set at build time',
  },
};

console.log(JSON.stringify(provenance, null, 2));
