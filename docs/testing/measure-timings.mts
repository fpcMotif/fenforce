import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

type Report = {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  snapshot: { added: number; updated: number; unmatched: number };
  testResults: { name: string; assertionResults: { fullName: string; status: string }[] }[];
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const directory = mkdtempSync(resolve(tmpdir(), 'fenforce-timings-'));
const output = resolve(ROOT, process.argv[2] ?? 'docs/testing/baseline/2026-10-01/timings.json');
const samples: { mode: string; command: string[]; durationMs: number; exitCode: number | null; tests: number; passed: number; failed: number; pending: number; identitySha256: string }[] = [];
try {
  for (const mode of ['cold', 'cold', 'cold', 'prime', 'warm', 'warm', 'warm']) {
    const reportPath = resolve(directory, 'report.json');
    const command = ['bunx', '--no-install', 'jest', '--config', 'jest.config.mjs', '--runInBand',
      mode === 'cold' ? '--no-cache' : '--cache', '--ci', '--updateSnapshot=false', '--json', '--outputFile', reportPath];
    const started = performance.now();
    const result = spawnSync(command[0], command.slice(1), {
      cwd: resolve(ROOT, 'packages/twenty-utils'), encoding: 'utf8', timeout: 60_000,
    });
    assert.equal(result.status, 0, `Timing run failed: ${result.stderr.slice(-1000)}`);
    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as Report;
    assert(report.numTotalTests > 0, 'Empty timing run');
    assert.equal(report.snapshot.added + report.snapshot.updated + report.snapshot.unmatched, 0, 'Snapshot drift');
    const identities = report.testResults.flatMap((suite) => suite.assertionResults.map((test) =>
      [suite.name.replace(ROOT, '<checkout>'), test.fullName, test.status])).sort();
    samples.push({ mode, command: command.map((argument) => argument.replace(directory, '<temporary-report-directory>')),
      durationMs: Math.round(performance.now() - started), exitCode: result.status,
      tests: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests,
      pending: report.numPendingTests, identitySha256: createHash('sha256').update(JSON.stringify(identities)).digest('hex') });
  }
  assert(samples.every((sample) => sample.identitySha256 === samples[0].identitySha256), 'Timing runs differ');
  const median = (mode: string) => samples.filter((sample) => sample.mode === mode)
    .map((sample) => sample.durationMs).sort((left, right) => left - right)[1];
  const nodeVersion = spawnSync('node', ['--version'], { encoding: 'utf8' }).stdout.trim();
  const bunVersion = spawnSync('bun', ['--version'], { encoding: 'utf8' }).stdout.trim();
  const jestVersion = spawnSync('bunx', ['--no-install', 'jest', '--version'],
    { cwd: resolve(ROOT, 'packages/twenty-utils'), encoding: 'utf8' }).stdout.trim();
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  const trackedDiff = spawnSync('git', ['diff', '--binary', 'HEAD', '--', '.', ':!docs/testing'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 20_000_000 }).stdout;
  writeFileSync(output, JSON.stringify({ capturedAt: new Date().toISOString(),
    cwd: 'packages/twenty-utils', versions: { launcher: 'bun', bun: bunVersion, node: nodeVersion, jest: jestVersion },
    checkout: { revision, trackedDiffSha256: createHash('sha256').update(trackedDiff).digest('hex'),
      lockfileSha256: createHash('sha256').update(readFileSync(resolve(ROOT, 'bun.lock'))).digest('hex') },
    meaning: 'Fresh test processes. Cold disables Jest transform caching; warm enables caching after one priming run. OS caches remain uncontrolled.',
    scope: 'Representative utilities only; this does not estimate full-suite migration performance.',
    samples, coldMedianMs: median('cold'), warmMedianMs: median('warm') }, null, 2) + '\n');
  console.log(JSON.stringify({ tests: samples[0].tests, coldMedianMs: median('cold'), warmMedianMs: median('warm') }));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
