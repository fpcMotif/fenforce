import { defineConfig } from 'vite-plus';

export default defineConfig({
  run: {
    tasks: {
      test: {
        command: 'bun run test:command',
        dependsOn: [
          { task: 'build', from: ['dependencies', 'devDependencies'] },
        ],
        cache: true,
      },
    },
  },
});
