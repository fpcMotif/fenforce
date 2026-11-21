import { defineConfig } from 'oxlint';

export default defineConfig({
  options: { typeAware: true },
  ignorePatterns: ['convex/_generated/**', 'node_modules/**'],
  jsPlugins: ['oxlint-plugin-complexity'],
  rules: {
    complexity: ['error', { max: 10, variant: 'modified' }],
    'complexity/complexity': ['error', { cognitive: 10 }],
  },
});
