import { defineConfig } from 'oxlint';
import antiSlop from 'ultracite/oxlint/anti-slop';
import core from 'ultracite/oxlint/core';

export default defineConfig({
  extends: [core, antiSlop],
  options: { typeAware: true },
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    'env.d.ts',
    '.wrangler/**',
    '.fallow/**',
    'test-results/**',
  ],
  jsPlugins: ['oxlint-plugin-complexity'],
  rules: {
    'typescript/consistent-type-definitions': ['error', 'type'],
    'func-style': ['error', 'declaration', { allowArrowFunctions: true }],
    'max-classes-per-file': ['error', 2],
    'sort-keys': 'off',
    'require-await': 'off',
    complexity: ['error', { max: 10, variant: 'modified' }],
    'complexity/complexity': ['error', { cognitive: 10 }],
  },
  overrides: [{ files: ['scripts/**/*.ts'], rules: { 'no-await-in-loop': 'off' } }],
});
