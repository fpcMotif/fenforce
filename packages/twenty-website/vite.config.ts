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
      lint: {
        command: 'bun run lint:command',
        dependsOn: ['twenty-ui#build'],
        cache: true,
      },
      'lint:fix': {
        command: 'bun run lint:fix:command',
        dependsOn: ['twenty-ui#build'],
        cache: false,
      },
    },
  },
});
