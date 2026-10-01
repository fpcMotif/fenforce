import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directory = fileURLToPath(new URL('.', import.meta.url));
const targets = {
  'darwin-arm64': [
    'aarch64-apple-darwin',
    '79f4c33e497cd50864de2388fafff43f7ca98bd27f63847fb6a6b59102ae1fd1',
  ],
  'linux-x64': [
    'x86_64-unknown-linux-gnu',
    'f81c2e48c1588d4612cd2c8851947898a45ac8d72748a07dff3a5694f1cf589b',
  ],
};
const target = targets[`${process.platform}-${process.arch}`];
if (!target) throw new Error('Supported hosts: macOS arm64 and Linux x64.');
const tooling = `${directory}.tooling`;
mkdirSync(tooling, { recursive: true });
const response = await fetch(
  `https://github.com/leanprover/elan/releases/download/v4.1.2/elan-${target[0]}.tar.gz`,
  {
    signal: AbortSignal.timeout(120_000),
  },
);
if (!response.ok) throw new Error(`Elan download failed: ${response.status}`);
const archive = Buffer.from(await response.arrayBuffer());
if (createHash('sha256').update(archive).digest('hex') !== target[1]) {
  throw new Error('Elan archive checksum mismatch');
}
writeFileSync(`${tooling}/elan.tar.gz`, archive);
const environment = {
  ...process.env,
  ELAN_HOME: `${tooling}/elan`,
  ELAN_TOOLCHAIN: readFileSync(`${directory}lean-toolchain`, 'utf8').trim(),
};
for (const [command, args] of [
  ['tar', ['-xzf', `${tooling}/elan.tar.gz`, '-C', tooling]],
  [
    `${tooling}/elan-init`,
    ['-y', '--no-modify-path', '--default-toolchain', 'none'],
  ],
  [`${tooling}/elan/bin/elan`, ['--version']],
  [`${tooling}/elan/bin/lake`, ['--version']],
]) {
  const result = spawnSync(command, args, {
    cwd: directory,
    env: environment,
    stdio: 'inherit',
    timeout: 600_000,
  });
  if (result.error || result.status !== 0)
    throw new Error(`Bootstrap failed: ${command}`, { cause: result.error });
}
