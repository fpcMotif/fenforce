import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import toolchain from './toolchain.json';

const directory = fileURLToPath(new URL('.', import.meta.url));
const platform = `${process.platform}-${process.arch}`;
if (!(platform in toolchain.targets))
  throw new Error('Supported hosts: macOS arm64/x64 and Linux x64.');
const target = toolchain.targets[platform as keyof typeof toolchain.targets];
const response = await fetch(
  `https://github.com/${toolchain.repository}/releases/download/v${toolchain.version}/${target.asset}`,
  { signal: AbortSignal.timeout(120_000) },
);
if (!response.ok)
  throw new Error(`Checker download failed: ${response.status}`);
const binary = Buffer.from(await response.arrayBuffer());
if (createHash('sha256').update(binary).digest('hex') !== target.sha256) {
  throw new Error('Checker checksum mismatch');
}
mkdirSync(`${directory}.tooling`, { recursive: true });
const executable = `${directory}.tooling/tla`;
writeFileSync(executable, binary);
chmodSync(executable, 0o755);
const result = spawnSync(executable, ['--version'], {
  encoding: 'utf8',
  timeout: 10_000,
});
if (
  result.error ||
  result.status !== 0 ||
  !result.stdout.includes(toolchain.version)
) {
  throw new Error('Checker version verification failed', {
    cause: result.error,
  });
}
console.log(result.stdout.trim());
console.log(`SHA-256 verified: ${target.sha256}`);
