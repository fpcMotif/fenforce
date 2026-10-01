export const PACKAGE_TAGS = {
  'scope:backend': ['twenty-server', 'twenty-emails'],
  'scope:client-sdk': ['twenty-client-sdk'],
  'scope:create-app': ['create-twenty-app'],
  'scope:frontend': ['twenty-front', 'twenty-front-component-renderer'],
  'scope:sdk': ['twenty-sdk'],
  'scope:shared': ['twenty-shared', 'twenty-ui', 'twenty-oxlint-rules'],
  'scope:website': ['twenty-website'],
  'scope:zapier': ['twenty-zapier'],
};

export function selectAffectedPackages(changedFiles, packages, tag) {
  const taggedPackages = PACKAGE_TAGS[tag];
  if (!taggedPackages) throw new Error(`Unknown package tag: ${tag}`);

  const packagesByDirectory = new Map(
    [...packages].map(([name, value]) => [value.directory, name]),
  );
  const changedPackages = new Set();
  let allPackagesAffected = false;

  for (const file of changedFiles) {
    const directory = file.split('/').slice(0, 2).join('/');
    const name = packagesByDirectory.get(directory);
    if (name) {
      changedPackages.add(name);
    } else {
      allPackagesAffected = true;
    }
  }

  if (allPackagesAffected) {
    for (const name of packages.keys()) changedPackages.add(name);
  }

  let previousCount;
  do {
    previousCount = changedPackages.size;
    for (const [name, { manifest }] of packages) {
      const dependencies = {
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.optionalDependencies,
        ...manifest.peerDependencies,
      };
      if (
        Object.keys(dependencies).some((dependency) =>
          changedPackages.has(dependency),
        )
      ) {
        changedPackages.add(name);
      }
    }
  } while (changedPackages.size !== previousCount);

  return taggedPackages.filter((name) => changedPackages.has(name));
}

export function selectRunnablePackages(selectedPackages, packages, task) {
  const runnable = selectedPackages.filter((name) => {
    const scripts = packages.get(name)?.manifest.scripts ?? {};
    return Object.hasOwn(scripts, task) || Object.hasOwn(scripts, `${task}:command`);
  });
  if (selectedPackages.length > 0 && runnable.length === 0) {
    throw new Error(`Selected packages do not define ${task}`);
  }
  return runnable;
}

export function runnerCommand(packages, task, parallel, additionalArgs) {
  return [
    'bunx',
    'vite-plus',
    'run',
    '--concurrency-limit',
    parallel,
    '--fail-if-no-match',
    ...packages.flatMap((name) => ['--filter', name]),
    task,
    ...additionalArgs,
  ];
}
