import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/m1',
  outputDir: 'run_results/m1',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:3017',
    headless: true,
    launchOptions: {
      executablePath: process.env.FENFORCE_TEST_BROWSER,
    },
    viewport: { width: 1440, height: 1000 },
    video: 'on',
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  reporter: [['list'], ['json', { outputFile: 'run_results/m1/results.json' }]],
});
