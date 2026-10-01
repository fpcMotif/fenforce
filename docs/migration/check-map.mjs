import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../..');
const documents = ['README.md', 'frontend-map.md', 'backend-map.md', 'criteria-map.md'];
const catalogs = {
  routes: 'packages/twenty-shared/src/types/AppPath.ts',
  settings: 'packages/twenty-shared/src/types/SettingsPath.ts',
  flags: 'packages/twenty-shared/src/types/FeatureFlagKey.ts',
  actions: 'packages/twenty-shared/src/workflow/types/WorkflowActionType.ts',
  objects: 'packages/twenty-shared/src/types/CoreObjectNameSingular.ts',
};

function read(path) {
  return readFileSync(path, 'utf8');
}

function unique(values, label) {
  assert.equal(new Set(values).size, values.length, `Duplicate ${label}`);
}

function featureIds() {
  const identifiers = documents.flatMap((name) =>
    [...read(resolve(directory, name)).matchAll(/^\|\s*(?:\*\*)?((?:FE|BE|EXTRA)-\d+)(?:\*\*)?(?:\.|\s*\|)/gm)]
      .map((match) => match[1]),
  );
  unique(identifiers, 'feature IDs');
  assert.equal(identifiers.length, 58, 'Expected 30 frontend, 25 backend, and 3 supplementary groups');
  return new Set(identifiers);
}

function checkLinks() {
  for (const name of documents) {
    const content = read(resolve(directory, name));
    for (const match of content.matchAll(/\]\(([^\s)]+)\)/g)) {
      const destination = match[1].split('#')[0];
      if (!destination || /^https?:/.test(destination)) continue;
      assert(existsSync(resolve(directory, destination)), `${name}: missing link ${destination}`);
    }
  }
}

function checkEvidence(entry) {
  assert(Array.isArray(entry.evidence), `${entry.member}: evidence must be an array`);
  if (entry.status !== 'verified') return;
  for (const scenario of ['positive', 'negative']) {
    const evidence = entry.evidence.find((item) => item.scenario === scenario);
    assert(evidence?.result === 'pass', `${entry.member}: missing passing ${scenario} evidence`);
    for (const revision of ['sourceRevision', 'targetRevision']) {
      assert(/^[a-f0-9]{40}$/.test(evidence[revision]), `${entry.member}: missing ${revision}`);
      assert.doesNotThrow(() => execFileSync('git', ['cat-file', '-e', `${evidence[revision]}^{commit}`], {
        cwd: root, stdio: 'pipe',
      }), `${entry.member}: ${revision} must resolve to a Git commit`);
    }
    for (const artifact of ['baselineArtifact', 'candidateArtifact', 'reviewArtifact']) {
      assert.equal(typeof evidence[artifact], 'string', `${entry.member}: missing ${artifact}`);
      const content = readArtifact(evidence[artifact]);
      assert(content.trim().length > 0, `${entry.member}: empty ${artifact}`);
    }
  }
}

function readArtifact(path) {
  assert(!isAbsolute(path), 'Evidence path must be repository-relative');
  const resolved = resolve(root, path);
  assert(resolved.startsWith(`${root}${sep}`), 'Evidence path escapes repository');
  const canonical = realpathSync(resolved);
  assert(canonical.startsWith(`${realpathSync(root)}${sep}`), 'Evidence symlink escapes repository');
  assert(statSync(canonical).isFile(), 'Evidence must be a regular file');
  return read(canonical);
}

function checkInventory(inventory, identifiers) {
  assert.equal(inventory.source, catalogs[inventory.kind], `Unexpected source for ${inventory.kind}`);
  const source = read(resolve(root, inventory.source));
  const digest = createHash('sha256').update(source).digest('hex');
  assert.equal(digest, inventory.sourceSha256, `${inventory.kind}: source changed; review mappings and hash`);
  const members = [...source.matchAll(/^\s+(\w+)\s*=/gm)].map((match) => match[1]);
  assert(members.length > 0, `${inventory.kind}: enum inventory is empty`);
  const assigned = inventory.entries.map((entry) => entry.member);
  unique(assigned, `${inventory.kind} members`);
  assert.deepEqual([...assigned].sort(), [...members].sort(), `${inventory.kind}: missing or stale mapping`);
  assert(inventory.acceptance?.positive?.trim() && inventory.acceptance?.negative?.trim(), `${inventory.kind}: missing acceptance scenario`);
  for (const entry of inventory.entries) {
    assert(identifiers.has(entry.feature), `${entry.member}: unknown feature ${entry.feature}`);
    assert(['unverified', 'in-progress', 'blocked', 'verified'].includes(entry.status), `${entry.member}: invalid status`);
    checkEvidence(entry);
  }
}

function validate(data) {
  assert.equal(data.schemaVersion, 1, 'Unsupported schema');
  for (const field of ['upstreamBaseline', 'auditedFork']) {
    assert(/^[a-f0-9]{40}$/.test(data[field]), `Invalid ${field}`);
  }
  const kinds = data.inventories.map((inventory) => inventory.kind);
  unique(kinds, 'catalogs');
  assert.deepEqual([...kinds].sort(), Object.keys(catalogs).sort(), 'Missing catalog');
  const identifiers = featureIds();
  checkLinks();
  for (const inventory of data.inventories) checkInventory(inventory, identifiers);
}

function selfTest(data) {
  function verifiedFixture(copy, overrides) {
    const entry = copy.inventories[0].entries[0];
    entry.status = 'verified';
    entry.evidence = ['positive', 'negative'].map((scenario) => ({
      scenario, result: 'pass', sourceRevision: data.auditedFork, targetRevision: data.auditedFork,
      baselineArtifact: 'docs/migration/README.md', candidateArtifact: 'docs/migration/README.md',
      reviewArtifact: 'docs/migration/README.md', ...overrides,
    }));
  }
  const cases = [
    ['missing mapping', (copy) => copy.inventories[0].entries.pop(), /missing or stale mapping/],
    ['unknown feature', (copy) => { copy.inventories[0].entries[0].feature = 'FE-999'; }, /unknown feature/],
    ['unsupported pass', (copy) => { copy.inventories[0].entries[0].status = 'verified'; }, /missing passing/],
    ['changed source', (copy) => { copy.inventories[0].sourceSha256 = 'stale'; }, /source changed/],
    ['missing catalog', (copy) => copy.inventories.pop(), /Missing catalog/],
    ['duplicate mapping', (copy) => copy.inventories[0].entries.push(copy.inventories[0].entries[0]), /Duplicate/],
    ['empty criterion', (copy) => { copy.inventories[0].acceptance.negative = ''; }, /missing acceptance/],
    ['fake revision', (copy) => verifiedFixture(copy, { targetRevision: '0'.repeat(40) }), /must resolve to a Git commit/],
    ['absolute artifact', (copy) => verifiedFixture(copy, { baselineArtifact: '/etc/hosts' }), /repository-relative/],
    ['escaped artifact', (copy) => verifiedFixture(copy, { baselineArtifact: '../outside' }), /escapes repository/],
    ['directory artifact', (copy) => verifiedFixture(copy, { baselineArtifact: 'docs/migration' }), /regular file/],
  ];
  for (const [name, mutate, expected] of cases) {
    const copy = structuredClone(data);
    mutate(copy);
    assert.throws(() => validate(copy), expected, `${name} must fail`);
  }
  console.log(`PASS: ${cases.length} negative controls rejected; valid control accepted.`);
}

assert(process.argv.slice(2).every((argument) => argument === '--self-test'), 'Only --self-test is supported');
const data = JSON.parse(read(resolve(directory, 'source-coverage.json')));
validate(data);
if (process.argv.includes('--self-test')) selfTest(data);
const entries = data.inventories.flatMap((inventory) => inventory.entries);
console.log(`PASS: ${entries.length} declarations mapped across ${data.inventories.length} catalogs; local links resolve.`);
console.log(`Catalog statuses: ${entries.filter((entry) => entry.status === 'verified').length} verified; ${entries.filter((entry) => entry.status === 'unverified').length} unverified.`);
console.log('Structural traceability only. Runtime parity and evidence quality require independent review.');
