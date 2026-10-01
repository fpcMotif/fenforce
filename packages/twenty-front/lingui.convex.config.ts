import { defineConfig } from '@lingui/conf';
import { formatter } from '@lingui/format-po';

export default defineConfig({
  sourceLocale: 'en',
  locales: ['en'],
  catalogs: [
    {
      path: '<rootDir>/src/pages/convex-preview/locales/{locale}',
      include: ['src/pages/convex-preview'],
      exclude: ['**/__tests__/**', '**/locales/**'],
    },
  ],
  compileNamespace: 'ts',
  format: formatter({ lineNumbers: false }),
});
