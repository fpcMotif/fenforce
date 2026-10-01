import { defineConfig } from 'vite-plus';

export default defineConfig({
  run: {
    tasks: {
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
      fmt: {
        command: 'bun run fmt:command',
        dependsOn: [
          {
            task: 'build',
            from: ['dependencies', 'devDependencies'],
          },
        ],
        cache: true,
      },
      'fmt:ci': {
        command: 'bun run fmt:ci:command',
        dependsOn: [
          {
            task: 'build',
            from: ['dependencies', 'devDependencies'],
          },
        ],
        cache: true,
      },
      'fmt:fix': {
        command: 'bun run fmt:fix:command',
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
      'check:ui-stories': {
        command: 'bun run check:ui-stories:command',
        dependsOn: ['twenty-ui#storybook:index'],
        cache: false,
      },
    },
  },
});
