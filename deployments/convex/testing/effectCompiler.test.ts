import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

it('rejects a floating Effect and accepts a retained Effect through the native compiler', async () => {
  const cache = path.join(ROOT, 'node_modules', '.cache');
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(path.join(cache, 'effect-compiler-'));

  try {
    await writeFile(
      path.join(directory, 'tsconfig.json'),
      JSON.stringify({
        extends: path.join(ROOT, 'tsconfig.json'),
        include: ['probe.ts'],
      }),
    );

    for (const retained of [false, true]) {
      await writeFile(
        path.join(directory, 'probe.ts'),
        `import { Effect } from 'effect';\n${retained ? 'export const retained = ' : ''}Effect.log('probe');\n`,
      );
      const result = spawnSync(
        path.join(ROOT, 'node_modules', '.bin', 'tsc'),
        ['--project', path.join(directory, 'tsconfig.json'), '--noEmit'],
        { encoding: 'utf8', timeout: 30_000 },
      );
      const output = `${result.stdout}${result.stderr}`;

      if (retained) {
        expect(result.status, output).toBe(0);
        expect(output.trim()).toBe('');
      } else {
        expect(result.status, output).not.toBe(0);
        expect(output).toMatch(/TS377001/);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
