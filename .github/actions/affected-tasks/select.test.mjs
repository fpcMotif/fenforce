import { expect, test } from 'bun:test';
import {
  runnerCommand,
  selectAffectedPackages,
  selectRunnablePackages,
} from './select.mjs';

const packages = new Map([
  [
    'twenty-shared',
    {
      directory: 'packages/twenty-shared',
      manifest: { scripts: { build: 'vp build' } },
    },
  ],
  [
    'twenty-front-component-renderer',
    {
      directory: 'packages/twenty-front-component-renderer',
      manifest: {
        dependencies: { 'twenty-shared': 'workspace:*' },
        scripts: { 'build:command': 'vp build' },
      },
    },
  ],
  [
    'twenty-front',
    {
      directory: 'packages/twenty-front',
      manifest: {
        dependencies: { 'twenty-front-component-renderer': 'workspace:*' },
        scripts: {
          'build:command': 'vp build',
          'lint:command': 'oxlint src',
          'lingui:extract': 'lingui extract',
        },
      },
    },
  ],
]);

test('a frontend change schedules its build and lint tasks', () => {
  const selected = selectAffectedPackages(
    ['packages/twenty-front/src/index.tsx'],
    packages,
    'scope:frontend',
  );
  expect(selected).toEqual(['twenty-front']);
  expect(selectRunnablePackages(selected, packages, 'build')).toEqual([
    'twenty-front',
  ]);
  expect(selectRunnablePackages(selected, packages, 'lint')).toEqual([
    'twenty-front',
  ]);
  expect(runnerCommand(selected, 'lint', '3', [])).toEqual([
    'bunx',
    'vite-plus',
    'run',
    '--concurrency-limit',
    '3',
    '--fail-if-no-match',
    '--filter',
    'twenty-front',
    'lint',
  ]);
});

test('a shared change includes frontend dependents', () => {
  expect(
    selectAffectedPackages(
      ['packages/twenty-shared/src/index.ts'],
      packages,
      'scope:frontend',
    ),
  ).toEqual(['twenty-front', 'twenty-front-component-renderer']);
});

test('a workspace configuration change selects every tagged package', () => {
  expect(
    selectAffectedPackages(['tsconfig.base.json'], packages, 'scope:frontend'),
  ).toEqual(['twenty-front', 'twenty-front-component-renderer']);
});

test('a selected package with no matching task fails', () => {
  expect(() =>
    selectRunnablePackages(['twenty-front'], packages, 'missing-task'),
  ).toThrow('Selected packages do not define missing-task');
});

test('a task on one selected package skips another package without that task', () => {
  expect(
    selectRunnablePackages(
      ['twenty-front', 'twenty-front-component-renderer'],
      packages,
      'lingui:extract',
    ),
  ).toEqual(['twenty-front']);
});
