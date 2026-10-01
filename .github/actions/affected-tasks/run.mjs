import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PACKAGE_TAGS,
  runnerCommand,
  selectAffectedPackages,
  selectRunnablePackages,
} from './select.mjs';

const baseSha = process.argv[2];
const tag = process.env.TASK_TAG;
const tasks = process.env.TASKS?.split(',').map((task) => task.trim());
const configuration = process.env.TASK_CONFIGURATION || 'ci';
const parallel = process.env.TASK_PARALLEL || '3';
const additionalArgs = process.env.TASK_ARGS?.trim().split(/\s+/).filter(Boolean) ?? [];

if (!baseSha || !tag || !PACKAGE_TAGS[tag] || !tasks?.length || tasks.some((task) => !task)) {
  throw new Error('A base commit, known package tag, and task names are required');
}

if (!/^\d+$/.test(parallel) || Number(parallel) < 1) {
  throw new Error('Task parallelism must be a positive integer');
}

if (additionalArgs.some((argument) => !/^--shard=\d+\/\d+$/.test(argument))) {
  throw new Error('Unsupported task argument');
}

const root = process.cwd();
const workspace = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const packages = new Map(
  workspace.workspaces.packages.map((directory) => {
    const manifest = JSON.parse(
      readFileSync(resolve(root, directory, 'package.json'), 'utf8'),
    );
    return [manifest.name, { directory, manifest }];
  }),
);
for (const name of PACKAGE_TAGS[tag]) {
  if (!packages.has(name)) throw new Error(`Tagged package is missing: ${name}`);
}
const changedFiles = execFileSync(
  'git',
  ['diff', '--name-only', '-z', baseSha, 'HEAD'],
  { cwd: root },
)
  .toString()
  .split('\0')
  .filter(Boolean);
const selectedPackages = selectAffectedPackages(changedFiles, packages, tag);
console.log(`Changed files: ${changedFiles.length}`);
console.log(`Selected ${tag}: ${selectedPackages.join(', ') || 'none'}`);

for (const inputTask of tasks) {
  const task =
    configuration === 'ci'
      ? inputTask
      : `${inputTask}:${configuration}`;
  const runnable = selectRunnablePackages(selectedPackages, packages, task);
  if (runnable.length === 0) {
    console.log(`No affected package for ${task}`);
    continue;
  }

  const command = runnerCommand(runnable, task, parallel, additionalArgs);
  console.log(`Running ${task} for ${runnable.join(', ')}`);
  const result = Bun.spawnSync(command, { cwd: root, stdout: 'inherit', stderr: 'inherit' });
  if (result.exitCode !== 0) process.exit(result.exitCode ?? 1);
}
