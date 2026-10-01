import path from 'path';
import { defineConfig } from 'vite-plus';
import packageJson from './package.json';

const moduleEntries = Object.keys((packageJson as any).exports || {})
  .filter(
    (key) => key !== './style.css' && key !== '.' && !key.startsWith('./src/'),
  )
  .map((module) => `src/${module.replace(/^\.\//, '')}/index.ts`);

const entries = ['src/index.ts', ...moduleEntries];

const entryFileNames = (chunk: any, extension: 'cjs' | 'mjs') => {
  if (!chunk.isEntry) {
    throw new Error(
      `Should never occurs, encountered a non entry chunk ${chunk.facadeModuleId}`,
    );
  }

  const splitFaceModuleId = chunk.facadeModuleId?.split('/');
  if (splitFaceModuleId === undefined) {
    throw new Error(
      `Should never occurs splitFaceModuleId is undefined ${chunk.facadeModuleId}`,
    );
  }

  const moduleDirectory = splitFaceModuleId[splitFaceModuleId?.length - 2];
  if (moduleDirectory === 'src') {
    return `${chunk.name}.${extension}`;
  }
  return `${moduleDirectory}.${extension}`;
};

export default defineConfig(() => {
  return {
    run: {
      tasks: {
        build: {
          command: 'bun run build:command',
          dependsOn: ['generateBarrels'],
          cache: true,
        },
        'build:individual': {
          command: 'bun run build:individual:command',
          dependsOn: ['build'],
          cache: true,
        },
        typecheck: {
          command: 'bun run typecheck:command',
          dependsOn: [
            { task: 'build', from: ['dependencies', 'devDependencies'] },
          ],
          cache: true,
        },
        test: {
          command: 'bun run test:command',
          dependsOn: [
            { task: 'build', from: ['dependencies', 'devDependencies'] },
          ],
          cache: true,
        },
        fmt: {
          command: 'bun run fmt:command',
          dependsOn: [
            { task: 'build', from: ['dependencies', 'devDependencies'] },
          ],
          cache: true,
        },
        lint: {
          command: 'bun run lint:command',
          dependsOn: ['twenty-oxlint-rules#build'],
          cache: true,
        },
        'lint:fix': {
          command: 'bun run lint:fix:command',
          dependsOn: ['twenty-oxlint-rules#build'],
          cache: false,
        },
      },
    },
    root: __dirname,
    cacheDir: '../../node_modules/.vite/packages/twenty-shared',
    resolve: {
      tsconfigPaths: true,
      alias: {
        '@/': path.resolve(__dirname, 'src') + '/',
      },
    },
    build: {
      emptyOutDir: false,
      outDir: 'dist',
      lib: { entry: entries, name: 'twenty-shared' },
      rollupOptions: {
        external: [
          ...Object.keys((packageJson as any).dependencies || {}),
          'typescript',
          // `twenty-shared/i18n` hashes message ids with node:crypto. Keep the
          // builtin external so rollup emits a plain import instead of trying
          // to bundle or polyfill it.
          'node:crypto',
        ],
        output: [
          {
            format: 'es',
            entryFileNames: (chunk) => entryFileNames(chunk, 'mjs'),
          },
          {
            format: 'cjs',
            esModule: true,
            exports: 'named',
            entryFileNames: (chunk) => entryFileNames(chunk, 'cjs'),
          },
        ],
      },
    },
    logLevel: 'warn',
  };
});
