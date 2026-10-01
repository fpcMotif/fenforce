import path from 'path';
import { type PackageJson } from 'type-fest';
import { defineConfig } from 'vite-plus';

import packageJson from './package.json';

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
            'sandbox:prebuild',
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
        'generate-remote-dom-elements': {
          command: 'bun run generate-remote-dom-elements:command',
          dependsOn: [
            {
              task: 'build',
              from: ['dependencies', 'devDependencies'],
            },
          ],
          cache: true,
        },
        'generate-remote-dom-elements:verbose': {
          command: 'bun run generate-remote-dom-elements:verbose:command',
          dependsOn: [
            {
              task: 'build',
              from: ['dependencies', 'devDependencies'],
            },
          ],
          cache: true,
        },
        'sandbox:prebuild': {
          command: 'bun run sandbox:prebuild:command',
          dependsOn: [
            'generate-remote-dom-elements',
            'twenty-sdk#build',
            'twenty-ui#build:individual',
            'twenty-shared#build:individual',
          ],
          cache: true,
        },
        'storybook:prebuild': {
          command: 'bun run storybook:prebuild:command',
          dependsOn: [
            'generate-remote-dom-elements',
            'sandbox:prebuild',
            'twenty-ui#build:individual',
            'twenty-shared#build:individual',
          ],
          cache: true,
        },
        'storybook:build': {
          command: 'bun run storybook:build:command',
          dependsOn: ['storybook:prebuild'],
          cache: true,
        },
        'storybook:build:test': {
          command: 'bun run storybook:build:test:command',
          dependsOn: ['storybook:prebuild'],
          cache: true,
        },
        'storybook:serve:dev': {
          command: 'bun run storybook:serve:dev:command',
          dependsOn: [
            {
              task: 'build',
              from: ['dependencies', 'devDependencies'],
            },
          ],
          cache: true,
        },
        'storybook:serve:static': {
          command: 'bun run storybook:serve:static:command',
          dependsOn: ['storybook:build'],
          cache: false,
        },
        'storybook:serve:static:test': {
          command: 'bun run storybook:serve:static:test:command',
          dependsOn: ['storybook:build'],
          cache: false,
        },
        'storybook:test': {
          command: 'bun run storybook:test:command',
          dependsOn: ['storybook:prebuild'],
          cache: true,
        },
        'storybook:test:no-coverage': {
          command: 'bun run storybook:test:no-coverage:command',
          dependsOn: ['storybook:prebuild'],
          cache: false,
        },
      },
    },
    root: __dirname,
    cacheDir:
      '../../node_modules/.vite/packages/twenty-front-component-renderer',
    resolve: {
      tsconfigPaths: true,
      alias: {
        '@/': path.resolve(__dirname, 'src') + '/',
      },
    },
    worker: {
      format: 'iife',
      rollupOptions: {
        output: {
          codeSplitting: false,
        },
      },
      plugins: () => [
        {
          name: 'define-process-env',
          transform: (code: string) =>
            code
              .replace(/process\.env\.NODE_ENV/g, JSON.stringify('production'))
              .replace(/process\.env/g, '{}'),
        },
      ],
    },
    build: {
      emptyOutDir: false,
      outDir: 'dist',
      lib: {
        entry: 'src/index.ts',
        name: 'twenty-front-component-renderer',
      },
      rollupOptions: {
        onwarn: (warning, warn) => {
          if (
            warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
            warning.message.includes('"use client"')
          ) {
            return;
          }
          warn(warning);
        },
        external: (id: string) => {
          const deps = Object.keys(
            (packageJson as PackageJson).dependencies || {},
          );

          return deps.some((dep) => id === dep || id.startsWith(dep + '/'));
        },
        output: [
          {
            format: 'es',
            entryFileNames: '[name].mjs',
          },
          {
            format: 'cjs',
            esModule: true,
            exports: 'named',
            entryFileNames: '[name].cjs',
          },
        ],
      },
    },
    logLevel: 'warn',
  };
});
