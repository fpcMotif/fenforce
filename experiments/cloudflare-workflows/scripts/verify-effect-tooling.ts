import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const RESULTS = path.join(ROOT, 'test-results');
await mkdir(RESULTS, { recursive: true });
const directory = await mkdtemp(path.join(RESULTS, 'effect-diagnostics-'));
const cases = [
  {
    label: 'floating',
    source: 'import { Effect } from "effect";\nEffect.log("forgotten");\n',
    shouldFail: true,
  },
  {
    label: 'retained',
    source:
      'import { Effect } from "effect";\nexport const diagnosticProbe = Effect.log("retained");\n',
    shouldFail: false,
  },
];
const evidence: { label: string; exitCode: number; output: string }[] = [];

try {
  await Bun.write(
    path.join(directory, 'tsconfig.json'),
    JSON.stringify({ extends: '../../tsconfig.json', include: ['probe.ts'] }),
  );
  for (const sample of cases) {
    await Bun.write(path.join(directory, 'probe.ts'), sample.source);
    const child = Bun.spawn(
      [
        path.join(ROOT, 'node_modules/.bin/tsc'),
        '--project',
        path.join(directory, 'tsconfig.json'),
        '--noEmit',
      ],
      { cwd: ROOT, stdout: 'pipe', stderr: 'pipe', timeout: 30_000 },
    );
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    const output = `${stdout}${stderr}`;
    evidence.push({ label: sample.label, exitCode, output });
    if (sample.shouldFail) {
      assert.notEqual(exitCode, 0, 'Compiler accepted an unexecuted Effect');
      assert.match(
        output,
        /probe\.ts.*TS377001/u,
        'Missing the expected floatingEffect diagnostic',
      );
    } else {
      assert.equal(exitCode, 0, output);
      assert.equal(output.trim(), '', 'Positive control emitted unexpected diagnostics');
    }
  }
  console.log('PASS: compiler rejects a floating Effect and accepts the retained Effect');
} finally {
  await Bun.write(path.join(RESULTS, 'effect-tooling.json'), JSON.stringify(evidence, null, 2));
  await rm(directory, { recursive: true, force: true });
}
