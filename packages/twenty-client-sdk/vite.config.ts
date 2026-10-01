import path from 'path';
import { defineConfig } from 'vite-plus';

import { entryFileNames, isExternal } from './vite.shared';

const entries = [
  'src/core/index.ts',
  'src/rest/index.ts',
  'src/generate/index.ts',
];

export default defineConfig(() => {
  return {
    run: {
      tasks: {
        build: {
          command: 'bun run build:command',
          dependsOn: [
            {
              task: 'build',
              from: ['dependencies', 'devDependencies'],
            },
          ],
          cache: true,
        },
        'generate-metadata-client': {
          command: 'bun run generate-metadata-client:command',
          dependsOn: [
            {
              task: 'build',
              from: ['dependencies', 'devDependencies'],
            },
          ],
          cache: false,
        },
        test: {
          command: 'bun run test:command',
          dependsOn: [
            {
              task: 'build',
              from: ['dependencies', 'devDependencies'],
            },
          ],
          cache: true,
        },
        'test:ci': {
          command: 'bun run test:ci:command',
          dependsOn: [
            {
              task: 'build',
              from: ['dependencies', 'devDependencies'],
            },
          ],
          cache: true,
        },
        typecheck: {
          command: 'bun run typecheck:command',
          dependsOn: [
            {
              task: 'build',
              from: ['dependencies', 'devDependencies'],
            },
          ],
          cache: true,
        },
        lint: {
          command: 'bun run lint:command',
          dependsOn: [
            {
              task: 'build',
              from: ['dependencies', 'devDependencies'],
            },
            'twenty-oxlint-rules#build',
          ],
          cache: true,
        },
      },
    },
    root: __dirname,
    cacheDir: '../../node_modules/.vite/packages/twenty-client-sdk',
    resolve: {
      tsconfigPaths: true,
      alias: {
        '@/': path.resolve(__dirname, 'src') + '/',
      },
    },
    build: {
      emptyOutDir: false,
      outDir: 'dist',
      lib: { entry: entries, name: 'twenty-client-sdk' },
      rollupOptions: {
        external: isExternal,
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
