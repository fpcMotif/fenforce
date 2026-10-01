import { fileURLToPath } from 'node:url';
import type { ViteUserConfig } from 'vite-plus';
import wyw from '@wyw-in-js/vite';
import { playwright } from 'vite-plus/test/browser-playwright';
import babel from '@rolldown/plugin-babel';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';

const artifacts = process.env.COMPATIBILITY_ARTIFACTS ?? 'artifacts/direct';

const config: ViteUserConfig = {
  plugins: [
    await babel({
      presets: [
        {
          preset: { plugins: ['@lingui/babel-plugin-lingui-macro'] },
          rolldown: { filter: { code: /@lingui\/core\/macro/ } },
        },
      ],
    }),
    wyw({
      include: ['**/fixtures/Counter.tsx'],
      babelOptions: { plugins: ['@lingui/babel-plugin-lingui-macro'] },
    }),
  ],
  resolve: {
    alias: {
      '#fixtures': fileURLToPath(new URL('./fixtures', import.meta.url)),
    },
  },
  test: {
    passWithNoTests: false,
    maxWorkers: 2,
    reporters: ['default', 'json', 'junit'],
    outputFile: {
      json: `${artifacts}/results.json`,
      junit: `${artifacts}/junit.xml`,
    },
    coverage: {
      provider: 'v8',
      reportsDirectory: `${artifacts}/coverage`,
      reporter: ['text', 'json', 'lcov'],
      include: ['fixtures/greeting.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 100,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/node/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['tests/dom/**/*.test.tsx'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['tests/browser/**/*.test.tsx'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          testTimeout: 15000,
        },
      },
      {
        extends: true,
        plugins: [
          await storybookTest({
            configDir: fileURLToPath(new URL('./.storybook', import.meta.url)),
          }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'secure-deployment',
          environment: 'node',
          include: ['tests/secure-deployment/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'provider',
          environment: 'node',
          include: ['tests/provider/**/*.test.ts'],
        },
      },
    ],
  },
};

export default config;
