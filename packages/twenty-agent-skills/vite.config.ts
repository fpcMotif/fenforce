import { defineConfig } from 'vite-plus';

export default defineConfig({
  run: {
    tasks: {
      build: {
        command: 'bun run build:command',
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
    },
  },
});
