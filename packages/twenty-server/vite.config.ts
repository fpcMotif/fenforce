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
      'test:ci': {
        command: 'bun run test:ci:command',
        dependsOn: [
          {
            task: 'build',
            from: ['dependencies', 'devDependencies'],
          },
        ],
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
      start: {
        command: 'bun run start:command',
        dependsOn: [
          {
            task: 'build',
            from: ['dependencies', 'devDependencies'],
          },
        ],
        cache: false,
      },
      'start:ci-if-needed': {
        command: 'bun run start:ci-if-needed:command',
        dependsOn: ['build'],
        cache: false,
      },
      'start:debug': {
        command: 'bun run start:debug:command',
        dependsOn: [
          {
            task: 'build',
            from: ['dependencies', 'devDependencies'],
          },
        ],
        cache: false,
      },
      command: {
        command: 'bun run command:command',
        dependsOn: ['build'],
        cache: false,
      },
      worker: {
        command: 'bun run worker:command',
        dependsOn: [
          {
            task: 'build',
            from: ['dependencies', 'devDependencies'],
          },
        ],
        cache: false,
      },
      'ts-node': {
        command: 'bun run ts-node:command',
        dependsOn: [
          {
            task: 'build',
            from: ['dependencies', 'devDependencies'],
          },
        ],
        cache: false,
      },
      lint: {
        command: 'bun run lint:command',
        dependsOn: ['twenty-oxlint-rules#build'],
        cache: true,
      },
      'lint:ci': {
        command: 'bun run lint:ci:command',
        dependsOn: ['twenty-oxlint-rules#build'],
        cache: true,
      },
      'lint:fix': {
        command: 'bun run lint:fix:command',
        dependsOn: ['twenty-oxlint-rules#build'],
        cache: false,
      },
      'lint:diff-with-main': {
        command: 'bun run lint:diff-with-main:command',
        dependsOn: ['twenty-oxlint-rules#build'],
        cache: false,
      },
      'lint:diff-with-main:fix': {
        command: 'bun run lint:diff-with-main:fix:command',
        dependsOn: ['twenty-oxlint-rules#build'],
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
      'database:migrate': {
        command: 'bun run database:migrate:command',
        dependsOn: ['build'],
        cache: false,
      },
      'database:init': {
        command: 'bun run database:init:command',
        dependsOn: ['build'],
        cache: false,
      },
      'database:migrate:generate': {
        command: 'bun run database:migrate:generate:command',
        dependsOn: ['build'],
        cache: false,
      },
      'database:reset': {
        command: 'bun run database:reset:command',
        dependsOn: ['build'],
        cache: false,
      },
      'database:reset:no-seed': {
        command: 'bun run database:reset:no-seed:command',
        dependsOn: ['build'],
        cache: false,
      },
      'database:reset:seed': {
        command: 'bun run database:reset:seed:command',
        dependsOn: ['build'],
        cache: false,
      },
      'lingui:extract': {
        command: 'bun run lingui:extract:command',
        dependsOn: [
          {
            task: 'build',
            from: ['dependencies', 'devDependencies'],
          },
        ],
        cache: false,
      },
      'lingui:compile': {
        command: 'bun run lingui:compile:command',
        dependsOn: [
          {
            task: 'build',
            from: ['dependencies', 'devDependencies'],
          },
        ],
        cache: false,
      },
    },
  },
});
