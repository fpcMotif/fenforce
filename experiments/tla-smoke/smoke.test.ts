import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const directory = fileURLToPath(new URL('.', import.meta.url));

for (const [mode, exitCode, outcome] of [
  ['positive', 0, 'complete'],
  ['negative', 2, 'counterexample'],
  ['model-error', 3, 'model-error'],
  ['resource-limit', 4, 'resource-limit'],
  ['depth-limit', 4, 'resource-limit'],
  ['timeout', 5, 'timeout'],
] as const) {
  test(`${mode} produces ${outcome} and exit ${exitCode}`, () => {
    const result = spawnSync(process.execPath, ['check.ts', mode], {
      cwd: directory,
      encoding: 'utf8',
      timeout: 130_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(exitCode);
    const report = JSON.parse(
      readFileSync(`${directory}artifacts/${mode}/report.json`, 'utf8'),
    );
    expect(report.outcome).toBe(outcome);
    if (mode === 'positive') {
      expect(report.distinctStates).toBe(4);
      expect(report.checker.status).toBe('ok');
    }
    if (mode === 'negative') {
      expect(report.checker.invariant_name).toBe('NeverTwo');
      expect(report.checker.trace).toEqual([
        { index: 0, action: null, state: { counter: 0 } },
        { index: 1, action: 'Next', state: { counter: 1 } },
        { index: 2, action: 'Next', state: { counter: 2 } },
      ]);
    }
  }, 135_000);
}
