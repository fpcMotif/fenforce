import type { StorybookConfig } from '@storybook/react-vite';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const require = createRequire(import.meta.url);

const resolvePackageDirectory = (packageName: string) =>
  path.dirname(require.resolve(`${packageName}/package.json`));

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],

  addons: ['@storybook/addon-vitest'],

  framework: '@storybook/react-vite',

  refs: {
    '@chakra-ui/react': { disable: true },
  },

  staticDirs: [
    {
      from: '../src/__stories__/example-sources-built',
      to: '/built',
    },
    {
      from: '../src/__stories__/example-sources-built-preact',
      to: '/built-preact',
    },
  ],

  viteFinal: async (viteConfig) => {
    return {
      ...viteConfig,
      resolve: {
        ...viteConfig.resolve,
        tsconfigPaths: true,
        alias: {
          ...viteConfig.resolve?.alias,
          '@': path.resolve(dirname, '../src'),
          // Pin every importer, twenty-ui's dist included, to this package's
          // React so the story build bundles a single copy.
          react: resolvePackageDirectory('react'),
          'react-dom': resolvePackageDirectory('react-dom'),
          'react/jsx-runtime': path.join(
            resolvePackageDirectory('react'),
            'jsx-runtime',
          ),
          'react/jsx-dev-runtime': path.join(
            resolvePackageDirectory('react'),
            'jsx-dev-runtime',
          ),
        },
      },
      optimizeDeps: {
        ...viteConfig.optimizeDeps,
        include: [
          ...(viteConfig.optimizeDeps?.include ?? []),
          'transliteration',
          '@remote-dom/core/polyfill',
          '@remote-dom/react/polyfill',
          '@remote-dom/core/elements',
          '@remote-dom/react',
          'react-dom/client',
          'react/jsx-runtime',
        ],
      },
    };
  },
};

export default config;
