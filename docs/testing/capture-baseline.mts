import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { redactEvidence, sanitizeEvidence } from './evidence-redaction.mjs';

type CommandResult = {
  exitCode: number | null;
  signal?: NodeJS.Signals | null;
  error?: string;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
};

type TestAssertion = {
  fullName?: string;
  title: string;
  status: string;
  failureMessages?: string[];
};

type TestReport = {
  numTotalTests?: number;
  numPassedTests?: number;
  numFailedTests?: number;
  numPendingTests?: number;
  numTodoTests?: number;
  numTotalTestSuites?: number;
  numPassedTestSuites?: number;
  numFailedTestSuites?: number;
  numPendingTestSuites?: number;
  success?: boolean;
  snapshot?: Record<string, unknown>;
  testResults?: { name: string; status: string; message?: string; assertionResults?: TestAssertion[] }[];
};

type Suite = {
  id: string;
  cwd: string;
  packageDirectory?: string;
  runner: string;
  config: string | null;
  external: boolean;
  collectionRequiresFixtures?: boolean;
  template?: boolean;
  alias?: boolean;
  versions?: Record<string, string | null>;
  binaryDirectory?: string | null;
  configSha256?: string;
  collectArgs: string[] | null;
  executeArgs: string[];
};

type CollectionResult = {
  status: string;
  reason?: string;
  files?: string[];
  command?: string[];
  durationMs?: number;
  exitCode?: number | null;
  entries?: unknown[];
  diagnostics?: string;
};

type ExecutionResult = {
  status: string;
  reason?: string;
  command?: string[];
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  durationMs?: number;
  result?: Record<string, unknown> | null;
  diagnostics?: string;
  failureClassification?: string | null;
  reportArtifact?: string;
  outputArtifact?: string;
};

type LaneResult = {
  id: string;
  cwd: string;
  runner: string;
  external: boolean;
  captureId?: string | null;
  contextStatus?: string;
  collection: CollectionResult;
  configuration?: unknown;
  execution?: ExecutionResult;
};

type PackageManifest = {
  name?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
};

type JestConfigurationReport = {
  version: string;
  configs: Record<string, unknown>[];
  globalConfig: Record<string, unknown>;
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argumentsList = process.argv.slice(2);
const outputIndex = argumentsList.indexOf('--output');
const OUTPUT = resolve(ROOT, outputIndex === -1 ? 'docs/testing/baseline/2026-10-01' : argumentsList[outputIndex + 1]);
const EXECUTE = argumentsList.includes('--execute');
const RUN_EXTERNAL = argumentsList.includes('--external');
const ONLY = argumentsList.find((argument) => argument.startsWith('--only='))?.slice(7);
const REFRESH = argumentsList.includes('--refresh');
for (let index = 0; index < argumentsList.length; index += 1) {
  const argument = argumentsList[index];
  if (argument === '--output') {
    if (!argumentsList[index + 1] || argumentsList[index + 1].startsWith('--')) throw new Error('--output requires a directory');
    index += 1;
  } else if (!['--execute', '--external', '--refresh'].includes(argument) && !argument.startsWith('--only=')) {
    throw new Error(`Unsupported argument: ${argument}`);
  }
}
mkdirSync(OUTPUT, { recursive: true });

const digest = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');
const readJson = <TData,>(path: string): TData => JSON.parse(readFileSync(path, 'utf8')) as TData;
const normalize = (value: string) => value.replaceAll(ROOT + '/', '').replaceAll(ROOT, '<checkout>');
const redact = (value: string) => redactEvidence(value, ROOT);
const write = (name: string, value: unknown) => {
  const path = resolve(OUTPUT, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(sanitizeEvidence(value, ROOT), null, 2) + '\n');
};

function files(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (/^(node_modules|dist|build|coverage|storybook-static|\.git|\.cache|graphify-out|\.next)$/.test(entry.name)) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : entry.isFile() ? [relative(ROOT, path)] : [];
  });
}

async function command(cwd: string, args: string[], timeoutMs = 120_000, env: Record<string, string> = {}): Promise<CommandResult> {
  const start = performance.now();
  return await new Promise<CommandResult>((done) => {
    const child = spawn(args[0], args.slice(1), {
      cwd: resolve(ROOT, cwd), env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    let stdout = '', stderr = '', timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid !== undefined) { try { process.kill(-child.pid, 'SIGTERM'); } catch { } }
      killTimer = setTimeout(() => { if (child.pid !== undefined) { try { process.kill(-child.pid, 'SIGKILL'); } catch { } } }, 5000);
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      done({ exitCode: null, error: error.message, stdout, stderr, durationMs: Math.round(performance.now() - start), timedOut });
    });
    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      done({ exitCode, signal, stdout, stderr, durationMs: Math.round(performance.now() - start), timedOut });
    });
  });
}

function parseJson(output: string): unknown {
  try { return JSON.parse(output) as unknown; } catch { }
  for (const match of output.matchAll(/^[\[{](?=\s|")/gm)) {
    try { return JSON.parse(output.slice(match.index)) as unknown; } catch { }
  }
  return null;
}

function installedVersions(cwd: string): Record<string, string | null> {
  const require = createRequire(resolve(ROOT, cwd, 'package.json'));
  return Object.fromEntries(['vite-plus', 'vitest', 'jest', '@playwright/test', '@storybook/addon-vitest',
    '@vitest/coverage-v8', '@vitest/coverage-istanbul'].map((name) => {
    try { return [name, readJson<{ version: string }>(require.resolve(`${name}/package.json`)).version]; } catch { return [name, null]; }
  }));
}

function assertions(result: TestReport) {
  return (result.testResults ?? []).flatMap((suite) => (suite.assertionResults ?? []).map((test) => ({
    file: normalize(suite.name), name: test.fullName ?? test.title, status: test.status,
    failureMessages: (test.failureMessages ?? []).map(redact),
  })));
}

function summarize(result: TestReport | null) {
  if (!result) return null;
  const fields: (keyof TestReport)[] = ['numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests',
    'numTotalTestSuites', 'numPassedTestSuites', 'numFailedTestSuites', 'numPendingTestSuites', 'success'];
  return {
    ...Object.fromEntries(fields.filter((key) => key in result).map((key) => [key, result[key]])),
    snapshot: result.snapshot,
    assertions: assertions(result),
    suites: (result.testResults ?? []).map((suite) => ({
      file: normalize(suite.name), status: suite.status, message: redact(suite.message ?? ''),
    })),
  };
}

function summarizeText(runner: string, output: string) {
  if (!['bun', 'node'].includes(runner)) return null;
  const count = (expression: RegExp) => Number(output.match(expression)?.[1] ?? 0);
  const total = runner === 'bun' ? count(/Ran (\d+) tests? across/) : count(/(?:ℹ|#) tests (\d+)/);
  if (total === 0) return null;
  const passed = runner === 'bun' ? count(/(\d+) pass\b/) : count(/(?:ℹ|#) pass (\d+)/);
  const failed = runner === 'bun' ? count(/(\d+) fail\b/) : count(/(?:ℹ|#) fail (\d+)/);
  return { numTotalTests: total, numPassedTests: passed, numFailedTests: failed,
    numPendingTests: runner === 'node' ? count(/(?:ℹ|#) skipped (\d+)/) : 0,
    identities: output.split('\n').filter((line) => /\(pass\)|\(fail\)|✔|✖|# Subtest:/.test(line)).map(redact),
    identitySemantics: 'Runner text retains suite context and individual display names; names are not normalized into JSON assertion identities.' };
}

const sourceFiles = ['packages', 'deployments', 'experiments'].flatMap((path) => files(resolve(ROOT, path)));
const testFiles = sourceFiles.filter((path) => /(?:\.(?:test|spec)\.[cm]?[jt]sx?|\.integration-(?:spec|test)\.ts|\.e2e-spec\.ts|\.setup\.ts)$/.test(path));
const configurationFiles = sourceFiles.filter((path) => /\/(?:jest(?:-integration(?:-secure)?)?\.config\.[cm]?[jt]s|vitest(?:\.[\w-]+)?\.config\.[cm]?[jt]s|playwright\.config\.[cm]?[jt]s)$/.test(path));
const sourceRecords = testFiles.map((path) => {
  const content = readFileSync(resolve(ROOT, path), 'utf8');
  const skipMarkers = [...content.matchAll(/\b(?:it|test|describe|suite)\s*\.\s*(skipIf|runIf|skip|todo|only)\s*(?:\.\s*each\s*)?\(/g)]
    .map((match) => ({ kind: match[1], line: content.slice(0, match.index).split('\n').length }));
  return { path, sha256: digest(content), skipMarkers };
});
const snapshots = sourceFiles.filter((path) => /\.snap$/.test(path)).map((path) => {
  const content = readFileSync(resolve(ROOT, path), 'utf8');
  return { path, sha256: digest(content), bytes: statSync(resolve(ROOT, path)).size, entries: [...content.matchAll(/^exports\[/gm)].length };
});
const stories = sourceFiles.filter((path) => /\.stories\.[cm]?[jt]sx?$/.test(path)).map((path) => {
  const content = readFileSync(resolve(ROOT, path), 'utf8');
  return { path, sha256: digest(content), declaredExports: [...content.matchAll(/export\s+(?:const|function)\s+(\w+)/g)].map((match) => match[1]),
    hasPlayFunction: /\bplay\s*:/.test(content), status: 'source-declarations-not-runtime-test-identities' };
});

const suites: Suite[] = configurationFiles.map((path) => {
  const packageDirectory = dirname(path);
  const rootInvocation = ['packages/twenty-docs/vitest.config.mts', 'packages/twenty-oxlint-rules/vitest.config.mts'].includes(path);
  const cwd = rootInvocation ? '.' : packageDirectory;
  const runner = path.includes('/jest') ? 'jest' : path.includes('/playwright') ? 'playwright' : 'vitest';
  const config = rootInvocation ? path : path.slice(packageDirectory.length + 1);
  const configSource = readFileSync(resolve(ROOT, path), 'utf8');
  const template = path.includes('/constants/template/');
  const browser = runner === 'playwright' || /storybook/.test(config + configSource) || ['packages/twenty-front/vitest.config.ts'].includes(path);
  const external = (browser && packageDirectory !== 'packages/twenty-ui') || /integration|e2e/.test(config) || /include:\s*\[\s*['"][^'"]*integration-test/.test(configSource);
  const alias = path === 'packages/twenty-sdk/vitest.unit.config.ts';
  const executable = ['bunx', '--no-install', runner];
  return {
    id: path.replaceAll('/', '--').replace(/\.[^.]+$/, ''), cwd, packageDirectory, runner, config, external, template, alias,
    collectionRequiresFixtures: runner === 'vitest' && external && !browser,
    versions: installedVersions(packageDirectory),
    binaryDirectory: rootInvocation ? `${packageDirectory}/node_modules/.bin` : null,
    configSha256: digest(readFileSync(resolve(ROOT, path))),
    collectArgs: runner === 'jest' ? ['bunx', '--no-install', 'jest', '--config', config, '--listTests', '--json', '--runInBand']
      : runner === 'playwright' ? ['bunx', '--no-install', 'playwright', 'test', '--config', config, '--list', '--reporter=json']
        : [...executable, 'list', '--config', config, '--json', ...(cwd === 'packages/twenty-ui' ? ['--project', 'unit'] : [])],
    executeArgs: runner === 'jest' ? ['bunx', '--no-install', 'jest', '--config', config, '--runInBand', '--no-cache', '--json', '--ci', '--updateSnapshot=false']
      : runner === 'playwright' ? ['bunx', '--no-install', 'playwright', 'test', '--config', config, '--reporter=json']
        : [...executable, 'run', '--config', config, '--reporter=json', ...(cwd === 'packages/twenty-ui' ? ['--project', 'unit'] : [])],
  };
});
suites.push({ id: 'deployments--convex--default', cwd: 'deployments/convex', runner: 'vitest', config: null,
  collectArgs: ['bunx', '--no-install', 'vitest', 'list', '--json'],
  executeArgs: ['bunx', '--no-install', 'vitest', 'run', '--reporter=json'], external: false });
suites.push({ id: 'deployments--cloudflare-front--bun', cwd: 'deployments/cloudflare-front', runner: 'bun', config: null,
  collectArgs: null, executeArgs: ['bun', 'test'], external: false });
suites.push({ id: 'packages--twenty-agent-skills--node', cwd: 'packages/twenty-agent-skills', runner: 'node', config: null,
  collectArgs: null, executeArgs: ['bun', 'run', 'test:command'], external: false });
suites.push({ id: 'packages--twenty-companion--vitest-default', cwd: 'packages/twenty-companion', runner: 'vitest', config: null,
  collectArgs: ['bunx', '--no-install', 'vitest', 'list', '--json'],
  executeArgs: ['bunx', '--no-install', 'vitest', 'run', '--reporter=json'], external: false });
for (const suite of suites) suite.versions ??= installedVersions(suite.cwd);
const selectedSuites = suites.filter((item) => !ONLY || item.id.includes(ONLY));
if (ONLY && selectedSuites.length === 0) throw new Error(`No lane matches --only=${ONLY}`);

const revision = await command('.', ['git', 'rev-parse', 'HEAD']);
const branch = await command('.', ['git', 'branch', '--show-current']);
const status = await command('.', ['git', 'status', '--porcelain=v1']);
const diff = await command('.', ['git', 'diff', '--binary', 'HEAD', '--', '.', ':!docs/testing']);
const lockfiles = ['bun.lock', 'deployments/convex/bun.lock', 'deployments/cloudflare-front/bun.lock', 'experiments/cloudflare-workflows/bun.lock']
  .filter((path) => existsSync(resolve(ROOT, path))).map((path) => ({ path, sha256: digest(readFileSync(resolve(ROOT, path))) }));
const packages = sourceFiles.filter((path) => path.endsWith('/package.json') && !path.includes('/code-interpreter/'))
  .map((path) => ({ path, data: readJson<PackageManifest>(resolve(ROOT, path)) }));
const packageCommands = packages.map(({ path, data }) => ({
  path, name: data.name, packageManager: data.packageManager,
  scripts: Object.fromEntries(Object.entries(data.scripts ?? {}).filter(([key]) => /test|check|build/.test(key))),
}));
const versions = {
  node: (await command('.', ['node', '--version'])).stdout.trim(),
  bun: (await command('.', ['bun', '--version'])).stdout.trim(),
};
const provenance = {
  revision: revision.stdout.trim(), branch: branch.stdout.trim(), trackedDiffSha256: digest(diff.stdout), lockfiles,
  sourceManifestSha256: digest(JSON.stringify({ testFiles: sourceRecords, snapshots, stories })),
  configurationFiles: configurationFiles.map((path) => ({ path, sha256: digest(readFileSync(resolve(ROOT, path))) })),
  packageManifests: packages.map(({ path }) => ({ path, sha256: digest(readFileSync(resolve(ROOT, path))) })),
  lanes: suites.map((suite) => ({ id: suite.id, versions: suite.versions })),
  versions,
  collectorSha256: digest(readFileSync(fileURLToPath(import.meta.url))),
  redactionHelperSha256: digest(readFileSync(resolve(ROOT, 'docs/testing/evidence-redaction.mts'))),
};
const captureId = digest(JSON.stringify(provenance));
const provenancePath = resolve(OUTPUT, 'provenance.json');
if (existsSync(provenancePath)) {
  const previous = readJson<{ captureId: string }>(provenancePath);
  if (previous.captureId !== captureId && !REFRESH) {
    throw new Error('Capture context changed. Use a new output directory, or --refresh to retain distinct per-lane contexts.');
  }
}
write(`captures/${captureId}.json`, { captureId, provenance });
write('provenance.json', { captureId, semantics: 'Latest observed context. Every refreshed lane references its immutable capture descriptor.' });
write('source-manifest.json', { scope: 'packages, deployments, experiments; dependencies, build outputs, and caches excluded',
  testFiles: sourceRecords, snapshots, stories, configurationFiles });
write('package-commands.json', packageCommands);
write('suite-registry.json', suites);
write('configuration-sources.json', configurationFiles.map((path) => ({ path,
  sha256: digest(readFileSync(resolve(ROOT, path))), source: redact(readFileSync(resolve(ROOT, path), 'utf8')),
  semantics: 'Source snapshot with credential values redacted; hash identifies the original source bytes.' })));
write('checkout.json', { capturedAt: new Date().toISOString(), revision: revision.stdout.trim(), branch: branch.stdout.trim(),
  trackedDiffSha256: digest(diff.stdout), status: normalize(status.stdout).trim().split('\n'), lockfiles,
  versions,
  semantics: 'Tracked diff digest excludes this docs/testing deliverable. Source/config/snapshot hashes identify observed bytes; this is not a checkout archive.' });

const resultsPath = resolve(OUTPUT, 'results.json');
const results = existsSync(resultsPath) ? readJson<LaneResult[]>(resultsPath) : [];
for (const result of results) {
  if (result.captureId === undefined) {
    result.captureId = null;
    result.contextStatus = 'Legacy capture did not retain immutable per-lane provenance; current metadata must not be attributed to this result.';
  }
}
for (const suite of selectedSuites) {
  if (!REFRESH && results.some((item) => item.id === suite.id && (!EXECUTE || item.execution))) continue;
  const artifact: LaneResult = { id: suite.id, cwd: suite.cwd, runner: suite.runner, external: suite.external ?? false, captureId,
    collection: { status: 'pending' } };
  const environment: Record<string, string> = {
    ...(suite.binaryDirectory ? { PATH: resolve(ROOT, suite.binaryDirectory) + ':' + process.env.PATH } : {}),
    ...(suite.cwd === 'packages/twenty-server' && suite.external ? { NODE_ENV: 'test' } : {}),
  };
  if (suite.template) {
    artifact.collection = { status: 'template-only', reason: 'Scaffold configuration runs in a generated project.' };
  } else if (suite.collectionRequiresFixtures && !RUN_EXTERNAL) {
    artifact.collection = { status: 'blocked', command: suite.collectArgs ?? undefined,
      reason: 'Vitest collection can run service setup. Provide isolated fixtures and select --external before discovery.' };
  } else if (!suite.collectArgs) {
    artifact.collection = { status: 'source-inventory-only', files: testFiles.filter((path) => path.startsWith(suite.cwd + '/')),
      reason: 'Runner has no nonexecuting discovery command in this captured contract.' };
  } else {
    const collection = await command(suite.cwd, suite.collectArgs, 120_000,
      { ...environment, ...(suite.cwd === 'packages/twenty-server' && suite.external ? { NODE_ENV: 'test' } : {}) });
    const parsed = parseJson(collection.stdout);
    const entries = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && 'suites' in parsed && Array.isArray(parsed.suites) ? parsed.suites : null;
    artifact.collection = {
      status: collection.exitCode === 0 && entries?.length ? 'collected' : collection.timedOut ? 'timed-out' : entries?.length === 0 ? 'empty' : 'failed',
      command: suite.collectArgs, durationMs: collection.durationMs, exitCode: collection.exitCode,
      ...(entries ? { entries: sanitizeEvidence(entries, ROOT) as unknown[] } : {}),
      diagnostics: redact(collection.stderr + (parsed ? '' : collection.stdout)).slice(-16_000),
    };
    if (suite.runner === 'jest') {
      const configResult = await command(suite.cwd, ['bunx', '--no-install', 'jest', '--config', suite.config ?? '', '--showConfig'], 30_000,
        suite.external ? { NODE_ENV: 'test' } : {});
      const config = parseJson(configResult.stdout) as JestConfigurationReport | null;
      const keys = ['displayName', 'testMatch', 'testRegex', 'testPathIgnorePatterns', 'testEnvironment', 'setupFiles', 'setupFilesAfterEnv',
        'transform', 'transformIgnorePatterns', 'coverageThreshold', 'collectCoverageFrom', 'coveragePathIgnorePatterns', 'moduleNameMapper',
        'fakeTimers', 'clearMocks', 'resetMocks', 'restoreMocks', 'snapshotSerializers'];
      artifact.configuration = config ? JSON.parse(normalize(JSON.stringify({ version: config.version,
        projects: config.configs.map((item) => Object.fromEntries(keys.filter((key) => key in item).map((key) => [key, item[key]]))),
        coverage: Object.fromEntries(['coverageThreshold', 'collectCoverageFrom', 'coverageProvider', 'coverageReporters'].filter((key) => key in config.globalConfig).map((key) => [key, config.globalConfig[key]])),
      }))) : { status: 'failed', diagnostics: redact(configResult.stderr).slice(-8000) };
    }
  }
  if (EXECUTE) {
    if (suite.template || suite.alias) {
      artifact.execution = { status: suite.template ? 'template-only' : 'alias-not-rerun', reason: 'Source configuration retained in the registry.' };
    } else if (suite.external && !RUN_EXTERNAL) {
      artifact.execution = { status: 'blocked', reason: 'Requires isolated browser/server/provider fixtures; collection remains separate.',
        command: suite.executeArgs };
    } else {
      const reportName = `${suite.id}-report.json`;
      const reportPath = resolve(OUTPUT, reportName);
      const jsonRunner = ['jest', 'vitest'].includes(suite.runner);
      if (jsonRunner && existsSync(reportPath)) unlinkSync(reportPath);
      const executeArgs = [...suite.executeArgs, ...(jsonRunner ? ['--outputFile', reportPath] : [])];
      const run = await command(suite.cwd, executeArgs, 600_000, environment);
      const parsed = (jsonRunner && existsSync(reportPath) ? readJson<TestReport>(reportPath) : parseJson(run.stdout)) as TestReport | null;
      const summary = summarize(parsed) ?? summarizeText(suite.runner, run.stdout + run.stderr);
      if (jsonRunner && parsed) write(reportName, summary);
      const indexSummary = summary && 'assertions' in summary
        ? Object.fromEntries(Object.entries(summary).filter(([key]) => !['assertions', 'suites'].includes(key)))
        : summary;
      artifact.execution = { status: run.timedOut ? 'timed-out' : run.exitCode === 0 ? 'passed' : 'failed', command: executeArgs.map(normalize),
        exitCode: run.exitCode, signal: run.signal, durationMs: run.durationMs,
        result: indexSummary, diagnostics: redact(run.stderr + (parsed ? '' : run.stdout)).slice(-20_000),
        ...(jsonRunner && parsed ? { reportArtifact: reportName } : {}),
        failureClassification: run.exitCode === 0 ? null : run.timedOut ? 'capture-timeout' : 'baseline-failure-requires-classification' };
      if (run.exitCode === 0 && parsed?.numTotalTests === 0) artifact.execution.status = 'empty';
      if (!parsed) {
        const outputArtifact = `${suite.id}-output.json`;
        write(outputArtifact, { stdout: redact(run.stdout), stderr: redact(run.stderr) });
        artifact.execution.outputArtifact = outputArtifact;
      }
    }
  }
  const index = results.findIndex((item) => item.id === suite.id);
  if (index === -1) results.push(artifact); else results[index] = artifact;
  write('results.json', results);
  console.log(`${suite.id}: ${artifact.collection.status}${artifact.execution ? ' / ' + artifact.execution.status : ''}`);
}
console.log(JSON.stringify({ lanes: results.length, testFiles: testFiles.length, snapshots: snapshots.length, output: relative(ROOT, OUTPUT) }));
