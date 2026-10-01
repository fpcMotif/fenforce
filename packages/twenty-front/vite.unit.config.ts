import babel from '@rolldown/plugin-babel';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { ViteUserConfig } from 'vite-plus';

const require = createRequire(import.meta.url);
const coverageIgnoredPaths = [
  'states/.+State.ts$',
  'states/selectors/*',
  'contexts/.+Context.ts',
  'testing/*',
  'tests/*',
  'config/*',
  'graphql/queries/*',
  'graphql/mutations/*',
  'graphql/subscriptions/*',
  'graphql/fragments/*',
  'types/*',
  'constants/*',
  'generated-metadata/*',
  'generated/*',
  '__stories__/*',
  'display/icon/index.ts',
].map((pattern) => new RegExp(pattern));

process.env.TZ = 'GMT';
process.env.LC_ALL = 'en_US.UTF-8';

const config: ViteUserConfig = {
  plugins: [
    await babel({
      presets: [
        {
          preset: { plugins: ['@lingui/babel-plugin-lingui-macro'] },
          rolldown: {
            filter: { code: /@lingui\/(?:core\/macro|react\/macro|macro)/ },
          },
        },
      ],
    }),
  ],
  resolve: {
    alias: [
      {
        find: /^.+\.(jpg|jpeg|png|gif|webp|svg|svg\?react)$/,
        replacement: path.resolve(__dirname, '__mocks__/imageMockFront.js'),
      },
      {
        find: /^.+\.(css|scss|sass|less)$/,
        replacement: path.resolve(__dirname, '__mocks__/styleMock.js'),
      },
      {
        find: /^.+\?worker$/,
        replacement: path.resolve(__dirname, '__mocks__/workerMock.js'),
      },
      {
        find: /^@\//,
        replacement: path.resolve(__dirname, 'src/modules') + '/',
      },
      { find: /^~\//, replacement: path.resolve(__dirname, 'src') + '/' },
      {
        find: /^transliteration$/,
        replacement: require.resolve('transliteration'),
      },
      {
        find: /^apollo-link-rest$/,
        replacement: require.resolve('apollo-link-rest/index.js'),
      },
    ],
  },
  test: {
    name: 'unit',
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    server: { deps: { inline: ['apollo-link-rest'] } },
    globals: true,
    clearMocks: false,
    mockReset: false,
    restoreMocks: false,
    passWithNoTests: false,
    update: 'none',
    include: ['src/**/?(*.)+(spec|test).[jt]s?(x)'],
    setupFiles: ['./setupVitest.ts'],
    maxWorkers: 3,
    testTimeout: 30000,
    reporters: ['default'],
    coverage: {
      provider: 'istanbul',
      reportOnFailure: true,
      include: readdirSync(path.resolve(__dirname, 'src'), { recursive: true })
        .map((file) => `src/${file}`)
        .filter(
          (file) =>
            file.endsWith('.ts') &&
            !coverageIgnoredPaths.some((pattern) => pattern.test(file)),
        ),
      reportsDirectory: './coverage/unit',
      reporter: ['html', 'json', 'json-summary', 'text-summary'],
      thresholds: { statements: 47.3, lines: 45.9, functions: 39.5 },
    },
  },
};

export default config;
