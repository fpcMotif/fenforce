import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const argumentsList = process.argv.slice(2);
const value = (name, fallback) =>
  argumentsList
    .find((argument) => argument.startsWith(`${name}=`))
    ?.slice(name.length + 1) ?? fallback;
const artifactDirectory = dirname(fileURLToPath(import.meta.url));
const repository = realpathSync(resolve(value('--repo', process.cwd())));
const policyPath = resolve(
  value('--policy', join(artifactDirectory, 'architecture-debt-policy.json')),
);
const baselinePath = resolve(
  value(
    '--baseline',
    join(artifactDirectory, 'architecture-debt-baseline.json'),
  ),
);
const reportPath = value('--report', undefined);
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
const typescript = createRequire(join(repository, 'package.json'))(
  'typescript',
);
const codeExtension = /\.(?:[cm]?[jt]sx?)$/;
const omittedDirectory =
  /^(node_modules|__tests__|__mocks__|__stories__|tests|test|\.git|\.vitest)$/;
const omittedFile =
  /(?:\.(?:test|spec|stories|d)\.[cm]?[jt]sx?$|\/setupTests\.)/;
const pathInRepository = (path) =>
  relative(repository, path).split(sep).join('/');
const normalizedRule = policy.legacyRules.map((rule) => ({
  ...rule,
  pattern: new RegExp(rule.specifier),
}));
const targetPathRules = policy.forbiddenTargetPaths.map(
  (pattern) => new RegExp(pattern),
);
const sourceCache = new Map();
const optionsCache = new Map();
const workspaceNames = JSON.parse(
  readFileSync(join(repository, 'package.json'), 'utf8'),
).workspaces.packages.map(
  (directory) =>
    JSON.parse(
      readFileSync(join(repository, directory, 'package.json'), 'utf8'),
    ).name,
);

assert.equal(policy.schemaVersion, 1);
assert(
  policy.targets.length > 0 && policy.legacyRoots.length > 0,
  'Target and legacy source roots must be declared',
);
assert.equal(
  new Set(policy.targets.map((target) => target.name)).size,
  policy.targets.length,
  'Duplicate target names',
);
assert.equal(
  new Set(policy.targets.map((target) => target.root)).size,
  policy.targets.length,
  'Duplicate target roots',
);
for (const argument of argumentsList)
  assert(
    /^(--repo=|--policy=|--baseline=|--report=|--record-baseline$|--self-test$)/.test(
      argument,
    ),
    `Unknown argument ${argument}`,
  );

function filesUnder(directory) {
  assert(existsSync(directory), `Missing source root ${directory}`);
  assert.equal(
    realpathSync(directory),
    directory,
    `Source-root symlink requires review: ${directory}`,
  );
  if (statSync(directory).isFile())
    return codeExtension.test(directory) && !omittedFile.test(directory)
      ? [directory]
      : [];
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      assert(
        !entry.isSymbolicLink(),
        `Source-tree symlink requires review: ${path}`,
      );
      if (entry.isDirectory())
        return omittedDirectory.test(entry.name) ? [] : filesUnder(path);
      return entry.isFile() &&
        codeExtension.test(path) &&
        !omittedFile.test(path)
        ? [path]
        : [];
    })
    .sort();
}

function importsOf(path, sourceText = readFileSync(path, 'utf8')) {
  const source = typescript.createSourceFile(
    path,
    sourceText,
    typescript.ScriptTarget.Latest,
    true,
  );
  const imports = [];
  const add = (node, specifier, symbols = [], namespace = false) =>
    imports.push({
      specifier,
      symbols,
      namespace,
      line:
        source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    });
  const visit = (node) => {
    if (typescript.isImportDeclaration(node)) {
      if (node.importClause?.isTypeOnly) return;
      const bindings = node.importClause?.namedBindings;
      const elements =
        bindings && typescript.isNamedImports(bindings)
          ? bindings.elements.filter((element) => !element.isTypeOnly)
          : [];
      if (
        bindings &&
        typescript.isNamedImports(bindings) &&
        elements.length === 0 &&
        !node.importClause.name
      )
        return;
      add(
        node,
        node.moduleSpecifier.text,
        elements.map((element) => (element.propertyName ?? element.name).text),
        Boolean(bindings && typescript.isNamespaceImport(bindings)),
      );
    } else if (
      typescript.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      !node.isTypeOnly
    ) {
      const elements =
        node.exportClause && typescript.isNamedExports(node.exportClause)
          ? node.exportClause.elements.filter((element) => !element.isTypeOnly)
          : [];
      if (
        node.exportClause &&
        typescript.isNamedExports(node.exportClause) &&
        elements.length === 0
      )
        return;
      add(
        node,
        node.moduleSpecifier.text,
        elements.map((element) => (element.propertyName ?? element.name).text),
        !node.exportClause || typescript.isNamespaceExport(node.exportClause),
      );
    } else if (
      typescript.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      typescript.isExternalModuleReference(node.moduleReference)
    ) {
      add(node, node.moduleReference.expression?.text ?? null, [], true);
    } else if (
      typescript.isCallExpression(node) &&
      (node.expression.kind === typescript.SyntaxKind.ImportKeyword ||
        (typescript.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    ) {
      add(
        node,
        node.arguments.length === 1 &&
          typescript.isStringLiteralLike(node.arguments[0])
          ? node.arguments[0].text
          : null,
        [],
        true,
      );
    }
    typescript.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}

function imported(path) {
  if (!sourceCache.has(path)) sourceCache.set(path, importsOf(path));
  return sourceCache.get(path);
}

function forbiddenImports(importedModule) {
  return normalizedRule
    .filter(
      (rule) =>
        rule.pattern.test(importedModule.specifier ?? '') &&
        (!rule.symbols ||
          importedModule.symbols.some((symbol) =>
            rule.symbols.includes(symbol),
          ) ||
          (rule.namespaceImportForbidden && importedModule.namespace)),
    )
    .map((rule) => rule.name);
}

function compilerOptions(path) {
  const directory = dirname(path);
  if (optionsCache.has(directory)) return optionsCache.get(directory);
  const configPath = typescript.findConfigFile(directory, existsSync);
  const config = configPath
    ? typescript.readConfigFile(configPath, typescript.sys.readFile)
    : { config: {} };
  assert(!config.error, `Cannot read ${configPath}`);
  const parsed = typescript.parseJsonConfigFileContent(
    config.config,
    typescript.sys,
    configPath ? dirname(configPath) : repository,
  );
  optionsCache.set(directory, parsed.options);
  return parsed.options;
}

function sourceCandidate(path) {
  return [
    path,
    ...[
      '.ts',
      '.tsx',
      '.mts',
      '.js',
      '.jsx',
      '.mjs',
      '/index.ts',
      '/index.tsx',
      '/index.js',
    ].map((suffix) => path + suffix),
  ].find(
    (candidate) =>
      existsSync(candidate) &&
      statSync(candidate).isFile() &&
      !candidate.endsWith('.d.ts'),
  );
}

function resolveRuntime(
  importedModule,
  parent,
  resolutionHost = typescript.sys,
) {
  const specifier = importedModule.specifier;
  if (specifier === null) return { error: 'nonliteral-module-load' };
  if (/\.(css|scss|svg|png|jpe?g|webp|gif|json|woff2?)(\?.*)?$/.test(specifier))
    return {};
  for (const [name, sourceRoot] of Object.entries(
    policy.workspaceSourceRoots,
  )) {
    if (specifier === name || specifier.startsWith(`${name}/`)) {
      const subpath =
        specifier === name ? '' : specifier.slice(name.length + 1);
      const path = sourceCandidate(resolve(repository, sourceRoot, subpath));
      return path
        ? canonicalRuntime(path)
        : { error: 'missing-workspace-source-export' };
    }
  }
  if (
    workspaceNames.some(
      (name) => specifier === name || specifier.startsWith(`${name}/`),
    )
  )
    return { error: 'unmapped-workspace-runtime-import' };
  const resolved = typescript.resolveModuleName(
    specifier,
    parent,
    compilerOptions(parent),
    resolutionHost,
  ).resolvedModule;
  if (resolved) {
    let path = resolve(resolved.resolvedFileName);
    if (path.includes(`${sep}node_modules${sep}`)) {
      const canonical =
        resolutionHost === typescript.sys ? realpathSync(path) : path;
      if (canonical.includes(`${sep}node_modules${sep}`)) return {};
      path = canonical;
    }
    if (path.endsWith('.d.ts'))
      path = sourceCandidate(path.slice(0, -5)) ?? path;
    if (codeExtension.test(path) && !path.endsWith('.d.ts'))
      return resolutionHost === typescript.sys
        ? canonicalRuntime(path)
        : { path };
    if (path.endsWith('.d.ts'))
      return { error: 'runtime-import-resolved-only-to-declaration' };
    return {};
  }
  if (
    specifier.startsWith('.') ||
    isAbsolute(specifier) ||
    /^(?:@|~|src)\//.test(specifier) ||
    specifier.startsWith('twenty-')
  )
    return { error: 'unresolved-local-runtime-import' };
  return {};
}

function canonicalRuntime(path) {
  const canonical = realpathSync(path);
  if (!canonical.startsWith(`${repository}${sep}`))
    return { error: 'local-import-escapes-repository' };
  return { path: canonical };
}

function targetSeeds(target) {
  const root = resolve(repository, target.root);
  assert(
    root.startsWith(`${repository}${sep}`),
    `Target root escapes repository: ${target.root}`,
  );
  const files = filesUnder(root);
  assert(files.length > 0, `Empty runtime target: ${target.root}`);
  return files;
}

function scanGraph(seeds, readImports = imported, resolver = resolveRuntime) {
  const visited = new Set();
  const violations = [];
  const queue = seeds.map((path) => ({ path, chain: [path] }));
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const { path, chain } = queue[cursor];
    if (visited.has(path)) continue;
    visited.add(path);
    for (const importedModule of readImports(path)) {
      for (const rule of forbiddenImports(importedModule))
        violations.push({
          path: pathInRepository(path),
          line: importedModule.line,
          specifier: importedModule.specifier,
          rule,
          chain: chain.map(pathInRepository),
        });
      const resolved = resolver(importedModule, path);
      if (resolved.error)
        violations.push({
          path: pathInRepository(path),
          line: importedModule.line,
          specifier: importedModule.specifier,
          rule: resolved.error,
          chain: chain.map(pathInRepository),
        });
      if (!resolved.path) continue;
      const next = pathInRepository(resolved.path);
      if (targetPathRules.some((pattern) => pattern.test(next)))
        violations.push({
          path: pathInRepository(path),
          line: importedModule.line,
          specifier: importedModule.specifier,
          rule: 'legacy-runtime-path',
          chain: [...chain, resolved.path].map(pathInRepository),
        });
      if (!resolved.path.startsWith(`${repository}${sep}`))
        violations.push({
          path: pathInRepository(path),
          rule: 'local-import-escapes-repository',
          specifier: importedModule.specifier,
        });
      else
        queue.push({ path: resolved.path, chain: [...chain, resolved.path] });
    }
  }
  return { modules: visited.size, violations };
}

function inventoryLegacy() {
  const targetRoots = policy.targets.map((target) =>
    resolve(repository, target.root),
  );
  const files = policy.legacyRoots
    .flatMap((root) => filesUnder(resolve(repository, root)))
    .filter(
      (path) =>
        !targetRoots.some(
          (root) => path === root || path.startsWith(root + sep),
        ),
    );
  const sites = {};
  const countsByRule = {};
  for (const path of new Set(files)) {
    for (const importedModule of imported(path)) {
      for (const rule of forbiddenImports(importedModule)) {
        const site = `${pathInRepository(path)}#${rule}#${importedModule.specifier}`;
        sites[site] = (sites[site] ?? 0) + 1;
        countsByRule[rule] = (countsByRule[rule] ?? 0) + 1;
      }
    }
  }
  return {
    sourceFiles: new Set(files).size,
    countsByRule,
    sites: Object.fromEntries(
      Object.entries(sites).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  };
}

function ratchet(current, baseline) {
  return Object.entries(current)
    .filter(([site, count]) => count > (baseline[site] ?? 0))
    .map(([site, count]) => ({
      site,
      baseline: baseline[site] ?? 0,
      current: count,
    }));
}

function selfTest() {
  const seed = resolve(repository, 'virtual/entry.ts');
  const relay = resolve(repository, 'virtual/relay.ts');
  const sources = new Map([
    [seed, "export * from './relay'"],
    [relay, "import { ApolloClient } from '@apollo/client';"],
  ]);
  const virtualRead = (path) => importsOf(path, sources.get(path));
  const virtualResolve = (item) =>
    item.specifier === './relay'
      ? { path: relay }
      : item.specifier === null
        ? { error: 'nonliteral-module-load' }
        : {};
  assert(
    scanGraph([seed], virtualRead, virtualResolve).violations.some(
      (item) => item.rule === 'apollo' && item.chain.length === 2,
    ),
  );
  sources.set(relay, "import type { ApolloClient } from '@apollo/client';");
  assert.equal(
    scanGraph([seed], virtualRead, virtualResolve).violations.length,
    0,
  );
  sources.set(relay, "const client = import('@apollo/client');");
  assert(
    scanGraph([seed], virtualRead, virtualResolve).violations.some(
      (item) => item.rule === 'apollo',
    ),
  );
  sources.set(relay, 'const client = import(suppliedModule);');
  assert(
    scanGraph([seed], virtualRead, virtualResolve).violations.some(
      (item) => item.rule === 'nonliteral-module-load',
    ),
  );
  sources.set(
    relay,
    "export { WorkflowEntrypoint as Backend } from 'cloudflare:workers';",
  );
  assert(
    scanGraph([seed], virtualRead, virtualResolve).violations.some(
      (item) => item.rule === 'cloudflare-workflows',
    ),
  );
  sources.set(relay, "import type { WorkflowStep } from 'cloudflare:workers';");
  assert.equal(
    scanGraph([seed], virtualRead, virtualResolve).violations.length,
    0,
  );
  sources.set(relay, "import * as workers from 'cloudflare:workers';");
  assert(
    scanGraph([seed], virtualRead, virtualResolve).violations.some(
      (item) => item.rule === 'cloudflare-workflows',
    ),
  );
  sources.set(relay, "import { WorkerEntrypoint } from 'cloudflare:workers';");
  assert.equal(
    scanGraph([seed], virtualRead, virtualResolve).violations.length,
    0,
  );
  assert.equal(ratchet({ old: 1 }, { old: 2 }).length, 0);
  assert.equal(ratchet({ new: 1 }, { old: 2 }).length, 1);
  assert.equal(ratchet({ old: 3 }, { old: 2 }).length, 1);
  sources.set(relay, "const database = require('typeorm');");
  assert(
    scanGraph([seed], virtualRead, virtualResolve).violations.some(
      (item) => item.rule === 'typeorm',
    ),
  );
  const aliasSeed = resolve(
    repository,
    'packages/twenty-front/src/pages/convex-preview/migration-gate-fixture.ts',
  );
  const aliasRelay = resolve(
    repository,
    'packages/twenty-front/src/modules/migration-gate-fixture.ts',
  );
  const aliasSources = new Map([
    [aliasSeed, "export * from '@/migration-gate-fixture'"],
    [aliasRelay, "export { ApolloClient } from '@apollo/client';"],
  ]);
  const aliasHost = {
    ...typescript.sys,
    fileExists: (path) =>
      aliasSources.has(path) || typescript.sys.fileExists(path),
    readFile: (path) => aliasSources.get(path) ?? typescript.sys.readFile(path),
  };
  const aliasResult = scanGraph(
    [aliasSeed],
    (path) => importsOf(path, aliasSources.get(path)),
    (item, parent) => resolveRuntime(item, parent, aliasHost),
  );
  assert(
    aliasResult.violations.some(
      (item) => item.rule === 'apollo' && item.chain.length === 2,
    ),
  );
  assert.equal(
    resolveRuntime(
      { specifier: 'twenty-server', symbols: [], namespace: false },
      aliasSeed,
    ).error,
    'unmapped-workspace-runtime-import',
  );
  sources.set(relay, "import { Workflow } from 'cloudflare:workflows';");
  assert(
    scanGraph([seed], virtualRead, virtualResolve).violations.some(
      (item) => item.rule === 'cloudflare-workflows',
    ),
  );
  sources.set(
    relay,
    "import { DurableObject as Backend } from 'cloudflare:workers';",
  );
  assert(
    scanGraph([seed], virtualRead, virtualResolve).violations.some(
      (item) => item.rule === 'cloudflare-durable-objects',
    ),
  );
  assert.throws(
    () => targetSeeds({ root: 'missing-runtime-root-for-negative-control' }),
    /Missing source root/,
  );
  assert.throws(
    () => targetSeeds({ root: 'packages/twenty-front/src/index.css' }),
    /Empty runtime target/,
  );
  assert.throws(
    () => targetSeeds({ root: '../outside-runtime-root' }),
    /escapes repository/,
  );
  assert.equal(
    canonicalRuntime(dirname(repository)).error,
    'local-import-escapes-repository',
  );
  console.log(
    'PASS: 20 architecture and ratchet controls, including real TypeScript-alias resolution and dynamic-import ablations.',
  );
}

if (argumentsList.includes('--self-test')) selfTest();
const policySha256 = createHash('sha256')
  .update(JSON.stringify(policy))
  .digest('hex');
const legacy = inventoryLegacy();
const targets = policy.targets.map((target) => ({
  name: target.name,
  root: target.root,
  ...scanGraph(targetSeeds(target)),
}));
if (argumentsList.includes('--record-baseline')) {
  assert(
    !baselinePath.startsWith(`${repository}${sep}`),
    'Proposal recording writes outside the checkout only',
  );
  const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repository,
    encoding: 'utf8',
  }).trim();
  writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        schemaVersion: 1,
        policySha256,
        sourceRevision,
        snapshotKind: 'dirty-working-tree-audit-not-runtime-parity',
        legacy,
      },
      null,
      2,
    ) + '\n',
  );
}
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
assert.equal(baseline.schemaVersion, 1);
assert.equal(
  baseline.policySha256,
  policySha256,
  'Policy changed: independently review scope and baseline before acceptance',
);
const regressions = ratchet(legacy.sites, baseline.legacy.sites);
const report = {
  schemaVersion: 1,
  policySha256,
  legacy: {
    sourceFiles: legacy.sourceFiles,
    countsByRule: legacy.countsByRule,
    sites: Object.keys(legacy.sites).length,
    regressions,
  },
  targets,
};
if (reportPath) {
  const reportDestination = resolve(reportPath);
  assert(
    !reportDestination.startsWith(`${repository}${sep}`),
    'Proposal reporting writes outside the checkout only',
  );
  writeFileSync(reportDestination, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
if (regressions.length || targets.some((target) => target.violations.length))
  process.exitCode = 1;
