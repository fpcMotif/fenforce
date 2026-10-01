import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const runPackage = (name, argumentsList) => {
  console.log(`Building ${name}: ${argumentsList.join(' ')}`);
  execFileSync(process.execPath, ['--env-file=/dev/null', ...argumentsList], {
    cwd: resolve(root, 'packages', name),
    stdio: 'inherit',
  });
};

runPackage('twenty-shared', ['node_modules/vite/bin/vite.js', 'build']);
runPackage('twenty-shared', [
  'node_modules/typescript/bin/tsc',
  '-p',
  'tsconfig.lib.json',
  '--moduleResolution',
  'bundler',
  '--declaration',
  '--emitDeclarationOnly',
  '--noEmit',
  'false',
  '--outDir',
  'dist',
  '--rootDir',
  'src',
]);
runPackage('twenty-shared', [
  'node_modules/tsc-alias/dist/bin/index.js',
  '-p',
  'tsconfig.lib.json',
  '--outDir',
  'dist',
]);
runPackage('twenty-ui', ['node_modules/vite/bin/vite.js', 'build']);
runPackage('twenty-front', ['run', 'build:convex']);
