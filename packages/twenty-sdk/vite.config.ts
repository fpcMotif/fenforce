import { defineConfig } from 'vite-plus';

export default defineConfig({
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
      dev: {
        command: 'bun run dev:command',
        dependsOn: [
          {
            task: 'build',
            from: ['dependencies', 'devDependencies'],
          },
        ],
        cache: false,
      },
      start: {
        command: 'bun run start:command',
        dependsOn: ['build'],
        cache: false,
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
      'test:e2e': {
        command: 'bun run test:e2e:command',
        dependsOn: [
          'build',
          'twenty-server#database:reset',
          'twenty-server#start:ci-if-needed',
        ],
        cache: true,
      },
      'build:sdk': {
        command: 'bun run build:sdk:command',
        dependsOn: [
          {
            task: 'build',
            from: ['dependencies', 'devDependencies'],
          },
        ],
        cache: true,
      },
    },
  },
});
