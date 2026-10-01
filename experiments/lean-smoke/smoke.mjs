import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const directory = fileURLToPath(new URL('.', import.meta.url));
const artifacts = `${directory}artifacts`;
mkdirSync(artifacts, { recursive: true });
const environment = {
  ...process.env,
  ELAN_HOME: `${directory}.tooling/elan`,
  ELAN_TOOLCHAIN: readFileSync(`${directory}lean-toolchain`, 'utf8').trim(),
};
const lake = `${environment.ELAN_HOME}/bin/lake`;
const results = [];
const revision = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: directory,
  encoding: 'utf8',
});
const report = {
  status: 'running',
  revision: revision.stdout?.trim(),
  platform: `${process.platform}-${process.arch}`,
  bun: process.versions.bun,
  toolchain: readFileSync(`${directory}lean-toolchain`, 'utf8').trim(),
  sourceHashes: Object.fromEntries(
    [
      'lean-toolchain',
      'lakefile.toml',
      'lake-manifest.json',
      'Smoke.lean',
      'Assumptions.lean',
      'fixtures/Broken.lean',
      'fixtures/Admitted.lean',
      'bootstrap.mjs',
      'smoke.mjs',
    ].map((path) => [
      path,
      createHash('sha256')
        .update(readFileSync(`${directory}${path}`))
        .digest('hex'),
    ]),
  ),
  results,
};

function run(name, args, expectedFailure = false, diagnostic = '') {
  const result = spawnSync(lake, args, {
    cwd: directory,
    env: environment,
    encoding: 'utf8',
    timeout: 120_000,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  writeFileSync(`${artifacts}/${name}.log`, output);
  results.push({
    name,
    command: ['.tooling/elan/bin/lake', ...args],
    exitCode: result.status,
    signal: result.signal,
  });
  process.stdout.write(output);
  if (result.error || result.signal || result.status === null) {
    throw new Error(`${name}: execution failed`, { cause: result.error });
  }
  if (
    expectedFailure
      ? result.status === 0 || !output.includes(diagnostic)
      : result.status !== 0
  ) {
    throw new Error(`${name}: unexpected result (${result.status})`);
  }
  return output;
}

try {
  run('lake-version', ['--version']);
  run('lean-version', ['env', 'lean', '--version']);
  run('clean', ['clean']);
  run('build', ['build']);
  const assumptions = run('assumptions', [
    'env',
    'lean',
    '-DwarningAsError=true',
    'Assumptions.lean',
  ]);
  if (
    !assumptions.includes("'Smoke.appendEmpty' does not depend on any axioms")
  ) {
    throw new Error('Unexpected proof assumptions');
  }
  run(
    'broken',
    ['env', 'lean', '-DwarningAsError=true', 'fixtures/Broken.lean'],
    true,
    "tactic 'rfl' failed",
  );
  run(
    'admitted',
    ['env', 'lean', '-DwarningAsError=true', 'fixtures/Admitted.lean'],
    true,
    "declaration uses 'sorry'",
  );
  run('final-build', ['build']);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error);
  process.exitCode = 1;
} finally {
  writeFileSync(
    `${artifacts}/report.json`,
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(`Lean smoke: ${report.status}; ${artifacts}/report.json`);
}
