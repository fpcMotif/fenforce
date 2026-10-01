import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import toolchain from './toolchain.json';

type CheckerResult = {
  status: string;
  stats?: { states_explored: number };
  trace?: unknown[];
};
type Outcome =
  | 'complete'
  | 'counterexample'
  | 'model-error'
  | 'resource-limit'
  | 'timeout'
  | 'process-failure';
type Report = {
  outcome: Outcome;
  exitCode: number;
  checker?: CheckerResult;
  [key: string]: unknown;
};

const directory = fileURLToPath(new URL('.', import.meta.url));
const modes = {
  positive: {
    configuration: 'Counter.cfg',
    states: 100,
    depth: 10,
    timeout: 120_000,
  },
  negative: {
    configuration: 'Negative.cfg',
    states: 100,
    depth: 10,
    timeout: 120_000,
  },
  'model-error': {
    configuration: 'ModelError.cfg',
    states: 100,
    depth: 10,
    timeout: 120_000,
  },
  'resource-limit': {
    configuration: 'Counter.cfg',
    states: 2,
    depth: 10,
    timeout: 120_000,
  },
  'depth-limit': {
    configuration: 'Counter.cfg',
    states: 100,
    depth: 2,
    timeout: 120_000,
  },
  timeout: {
    configuration: 'Timeout.cfg',
    states: 1_000_000_001,
    depth: 1_000_000_001,
    timeout: 10,
  },
};
const mode = process.argv[2] ?? 'positive';
if (!Object.hasOwn(modes, mode)) throw new Error(`Unknown smoke mode: ${mode}`);
const limits = modes[mode as keyof typeof modes];
const artifacts = `${directory}artifacts/${mode}`;
mkdirSync(artifacts, { recursive: true });
writeFileSync(`${artifacts}/stdout.log`, '');
writeFileSync(`${artifacts}/stderr.log`, '');
const executable = `${directory}.tooling/tla`;
const args = [
  'Counter.tla',
  '--config',
  limits.configuration,
  '--json',
  '--max-states',
  String(limits.states),
  '--max-depth',
  String(limits.depth),
];
const report: Report = {
  outcome: 'process-failure',
  exitCode: 6,
  mode,
  limits,
  command: ['.tooling/tla', ...args],
  bun: process.versions.bun,
  platform: `${process.platform}-${process.arch}`,
};

function classify(
  result: SpawnSyncReturns<string>,
  checker?: CheckerResult,
): [Outcome, number] {
  if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT')
    return ['timeout', 5];
  if (result.error || result.signal || result.status === null)
    return ['process-failure', 6];
  if (
    result.status === 0 &&
    checker?.status === 'ok' &&
    (checker.stats?.states_explored ?? 0) > 0
  ) {
    return ['complete', 0];
  }
  if (result.status !== 1) return ['process-failure', 6];
  if (
    checker?.status === 'invariant_violation' &&
    (checker.trace?.length ?? 0) > 0
  )
    return ['counterexample', 2];
  if (
    [
      'init_error',
      'next_error',
      'invariant_error',
      'no_initial_states',
      'assume_error',
      'assume_violation',
    ].includes(checker?.status ?? '')
  ) {
    return ['model-error', 3];
  }
  if (
    ['max_states_exceeded', 'max_depth_exceeded'].includes(
      checker?.status ?? '',
    )
  )
    return ['resource-limit', 4];
  if (checker?.status === 'max_time_exceeded') return ['timeout', 5];
  return ['process-failure', 6];
}

function parseChecker(output: string): CheckerResult | undefined {
  const jsonLines = output.split('\n').filter((line) => line.startsWith('{'));
  if (jsonLines.length !== 1) return undefined;
  const decoded: unknown = JSON.parse(jsonLines[0]);
  if (
    !decoded ||
    typeof decoded !== 'object' ||
    !('status' in decoded) ||
    typeof decoded.status !== 'string'
  ) {
    throw new Error('Invalid checker result');
  }
  if ('stats' in decoded) {
    const stats = decoded.stats;
    if (
      !stats ||
      typeof stats !== 'object' ||
      !('states_explored' in stats) ||
      typeof stats.states_explored !== 'number' ||
      !Number.isSafeInteger(stats.states_explored) ||
      stats.states_explored < 0
    ) {
      throw new Error('Invalid checker statistics');
    }
  }
  if ('trace' in decoded && !Array.isArray(decoded.trace))
    throw new Error('Invalid checker trace');
  return decoded as CheckerResult;
}

try {
  const binaryHash = createHash('sha256')
    .update(readFileSync(executable))
    .digest('hex');
  const platform = `${process.platform}-${process.arch}`;
  if (
    !(platform in toolchain.targets) ||
    binaryHash !==
      toolchain.targets[platform as keyof typeof toolchain.targets].sha256
  )
    throw new Error('Checker checksum mismatch; run bootstrap');
  report.checkerVersion = toolchain.version;
  report.binaryHash = binaryHash;
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: directory,
    encoding: 'utf8',
  });
  if (revision.status !== 0) throw new Error('Cannot record Git revision');
  report.revision = revision.stdout.trim();
  report.sourceHashes = Object.fromEntries(
    [
      'Counter.tla',
      limits.configuration,
      'toolchain.json',
      'check.ts',
      'smoke.test.ts',
    ].map((path) => [
      path,
      createHash('sha256')
        .update(readFileSync(`${directory}${path}`))
        .digest('hex'),
    ]),
  );
  const result = spawnSync(executable, args, {
    cwd: directory,
    encoding: 'utf8',
    timeout: limits.timeout,
    killSignal: 'SIGKILL',
    maxBuffer: 8 * 1024 * 1024,
  });
  writeFileSync(`${artifacts}/stdout.log`, result.stdout ?? '');
  writeFileSync(`${artifacts}/stderr.log`, result.stderr ?? '');
  report.checkerExitCode = result.status;
  report.signal = result.signal;
  report.processError = (
    result.error as NodeJS.ErrnoException | undefined
  )?.code;
  if (!result.error && !result.signal)
    report.checker = parseChecker(result.stdout ?? '');
  [report.outcome, report.exitCode] = classify(result, report.checker);
  report.distinctStates = report.checker?.stats?.states_explored;
} catch (error) {
  report.error = String(error);
} finally {
  writeFileSync(
    `${artifacts}/report.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(`${mode}: ${report.outcome}; ${artifacts}/report.json`);
  process.exitCode = report.exitCode;
}
