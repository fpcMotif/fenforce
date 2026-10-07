import { defineConfig } from '@playwright/test';

import foundation from './playwright.m1.config';

export default defineConfig(foundation, {
  testMatch: 'sales-projects.spec.ts',
  outputDir: 'run_results/sales-projects',
  reporter: [
    ['list'],
    ['json', { outputFile: 'run_results/sales-projects/results.json' }],
  ],
});
