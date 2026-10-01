import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

type ToolApplicability = {
  applicable: boolean;
  reason: string;
  evidenceStatus: string;
  evidence: unknown[];
};

type Journey = {
  id: string;
  kind?: string;
  title: string;
  groups: string[];
  ownerIssue: number;
  actors: string[];
  permissions: string[];
  inputs: string[];
  effects: string[];
  failures: string[];
  outcomes: string[];
  fixtures: string[];
  sourcePaths: string[];
  testPaths: string[];
  configurationVariants: string[];
  acceptanceDimensions: string[];
  baselineImplementation: { status: string };
  replacementImplementation: { status: string };
  toolApplicability: Record<string, ToolApplicability>;
  evidenceStatus: string;
  evidence: unknown[];
  catalog?: { kind: string; member: string; value: string };
};

type Ledger = {
  schemaVersion: number;
  groups: { id: string; name: string; owners: number[] }[];
  dimensions: { id: string; title: string; requiredEvidence: string[]; applicabilityRule: string }[];
  journeys: Journey[];
  catalogs: { kind: string; source: string; sourceSha256: string; members: { name: string; value: string }[] }[];
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_LEDGER = resolve(ROOT, 'docs/testing/crm-journeys.json');
const argumentsList = process.argv.slice(2);
const fileIndex = argumentsList.indexOf('--file');
const path = fileIndex === -1 ? DEFAULT_LEDGER : resolve(argumentsList[fileIndex + 1]);
const data = JSON.parse(readFileSync(path, 'utf8')) as Ledger;
const expectedGroups = [
  ...Array.from({ length: 30 }, (_, index) => `FE-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 25 }, (_, index) => `BE-${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 3 }, (_, index) => `EXTRA-${String(index + 1).padStart(2, '0')}`),
];
const expectedDimensions = Array.from({ length: 17 }, (_, index) => `AC-${String(index + 1).padStart(2, '0')}`);
const originalCatalogCounts = { routes: 31, settings: 103, flags: 16, actions: 20, objects: 34 };

function unique(values: string[], label: string) {
  assert.equal(values.length, new Set(values).size, `Duplicate ${label}`);
}

function source(path: string) {
  assert.equal(typeof path, 'string', 'Source path must be a string');
  assert(!isAbsolute(path), 'Source path must be repository-relative');
  const resolved = resolve(ROOT, path);
  assert(resolved.startsWith(ROOT + sep), 'Source path escapes checkout');
  assert(existsSync(resolved), `Missing source: ${path}`);
  assert(realpathSync(resolved).startsWith(realpathSync(ROOT) + sep), 'Source symlink escapes checkout');
  assert(statSync(resolved).isFile() || statSync(resolved).isDirectory(), 'Unsupported source path');
  return resolved;
}

function validate(ledger: Ledger) {
  assert.equal(ledger.schemaVersion, 1, 'Unsupported schema');
  unique(ledger.groups.map((group) => group.id), 'groups');
  assert.deepEqual(ledger.groups.map((group) => group.id).sort(), [...expectedGroups].sort(), 'Missing capability group');
  unique(ledger.dimensions.map((dimension) => dimension.id), 'dimensions');
  assert.deepEqual(ledger.dimensions.map((dimension) => dimension.id).sort(), expectedDimensions, 'Missing acceptance dimension');
  unique(ledger.journeys.map((journey) => journey.id), 'journey IDs');
  unique(ledger.catalogs.map((catalog) => catalog.kind), 'catalog kinds');
  for (const group of ledger.groups) {
    assert(group.name.trim(), `${group.id}: missing name`);
    assert(group.owners.length > 0, `${group.id}: missing owner`);
    assert(ledger.journeys.some((journey) => journey.groups.includes(group.id) && journey.kind !== 'configuration-contract'), `${group.id}: no concrete behavior`);
  }
  for (const dimension of ledger.dimensions) {
    assert(dimension.title?.trim(), `${dimension.id}: missing title`);
    assert(dimension.requiredEvidence?.length > 0, `${dimension.id}: missing evidence requirements`);
    assert(dimension.applicabilityRule?.trim(), `${dimension.id}: missing applicability rule`);
    assert(ledger.journeys.some((journey) => journey.acceptanceDimensions.includes(dimension.id)), `${dimension.id}: no applicable journey`);
  }
  for (const journey of ledger.journeys) {
    assert(journey.title.trim(), `${journey.id}: missing title`);
    assert(journey.groups.length > 0 && journey.groups.every((group) => expectedGroups.includes(group)), `${journey.id}: unknown group`);
    assert(Number.isInteger(journey.ownerIssue) && journey.ownerIssue >= 25 && journey.ownerIssue <= 36, `${journey.id}: invalid owner`);
    const owners = ledger.groups.find((group) => group.id === journey.groups[0])?.owners;
    assert(owners?.includes(journey.ownerIssue), `${journey.id}: owner does not match primary group`);
    const requiredFields: (keyof Journey)[] = ['actors', 'permissions', 'inputs', 'effects', 'failures', 'outcomes', 'fixtures', 'sourcePaths', 'configurationVariants', 'acceptanceDimensions'];
    for (const key of requiredFields) {
      const values = journey[key];
      assert(Array.isArray(values) && values.length > 0, `${journey.id}: missing ${key}`);
    }
    assert(journey.acceptanceDimensions.every((dimension) => expectedDimensions.includes(dimension)), `${journey.id}: unknown acceptance dimension`);
    assert(journey.baselineImplementation?.status && journey.replacementImplementation?.status, `${journey.id}: missing implementation states`);
    for (const path of [...journey.sourcePaths, ...journey.testPaths]) source(path);
    for (const tool of ['examples', 'properties', 'mutation', 'localFuzz', 'antithesis', 'browser']) {
      const applicability = journey.toolApplicability[tool];
      assert(typeof applicability?.applicable === 'boolean' && applicability.reason?.trim(), `${journey.id}: missing ${tool} rationale`);
      assert(Array.isArray(applicability.evidence), `${journey.id}: missing ${tool} evidence array`);
      assert(applicability.evidenceStatus !== 'verified' || applicability.evidence.length > 0, `${journey.id}: unsupported ${tool} pass`);
    }
    assert(journey.evidenceStatus !== 'verified' || journey.evidence.length > 0, `${journey.id}: unsupported journey pass`);
  }
  for (const [kind, count] of Object.entries(originalCatalogCounts)) {
    assert.equal(ledger.catalogs.find((catalog) => catalog.kind === kind)?.members.length, count, `Missing original ${kind} declarations`);
  }
  for (const catalog of ledger.catalogs) {
    const content = readFileSync(source(catalog.source), 'utf8');
    assert.equal(createHash('sha256').update(content).digest('hex'), catalog.sourceSha256, `${catalog.kind}: catalog source drift`);
    const members: { name: string; value: string }[] = [];
    for (const match of content.matchAll(/^\s+(\w+)\s*=\s*(['"`])([^'"`]+)\2/gm)) {
      const value = match[3].replace(/\$\{(\w+)\}/g, (_, name: string) => {
        const previous = members.find((member) => member.name === name);
        assert(previous, `${catalog.kind}: unresolved enum interpolation ${name}`);
        return previous.value;
      });
      members.push({ name: match[1], value });
    }
    assert.deepEqual(catalog.members, members, `${catalog.kind}: source members differ`);
    unique(catalog.members.map((member) => member.name), `${catalog.kind} members`);
    for (const member of catalog.members) {
      const matches = ledger.journeys.filter((journey) => journey.catalog?.kind === catalog.kind && journey.catalog.member === member.name);
      assert.equal(matches.length, 1, `${catalog.kind}/${member.name}: missing or duplicate mapping`);
      assert.equal(matches[0].catalog?.value, member.value, `${catalog.kind}/${member.name}: incorrect value`);
    }
  }
}

validate(data);
if (argumentsList.includes('--self-test')) {
  const controls: [string, (ledger: Ledger) => void, RegExp][] = [
    ['missing group', (copy) => copy.groups.pop(), /Missing capability group/],
    ['missing dimension', (copy) => copy.dimensions.pop(), /Missing acceptance dimension/],
    ['duplicate journey', (copy) => copy.journeys.push(copy.journeys[0]), /Duplicate journey IDs/],
    ['missing actor', (copy) => { copy.journeys[0].actors = []; }, /missing actors/],
    ['unknown group', (copy) => { copy.journeys[0].groups = ['FE-999']; }, /unknown group|no concrete behavior/],
    ['unsupported pass', (copy) => { copy.journeys[0].evidenceStatus = 'verified'; }, /unsupported journey pass/],
    ['missing catalog mapping', (copy) => { copy.journeys = copy.journeys.filter((journey) => journey.id !== 'CAT-actions-CODE'); }, /missing or duplicate mapping/],
    ['stale catalog', (copy) => { copy.catalogs[0].sourceSha256 = 'stale'; }, /catalog source drift/],
    ['missing applicability', (copy) => { copy.journeys[0].toolApplicability.properties.reason = ''; }, /missing properties rationale/],
    ['wrong domain owner', (copy) => { copy.journeys[0].ownerIssue = 36; }, /owner does not match primary group/],
    ['escaped source', (copy) => { copy.journeys[0].sourcePaths = ['../outside']; }, /escapes checkout/],
  ];
  for (const [name, mutate, pattern] of controls) {
    const copy = structuredClone(data);
    mutate(copy);
    assert.throws(() => validate(copy), pattern, `${name} must fail`);
  }
  console.log(`PASS: ${controls.length} invalid controls rejected.`);
}
console.log(JSON.stringify({ groups: data.groups.length, dimensions: data.dimensions.length,
  behaviors: data.journeys.filter((journey) => journey.kind !== 'configuration-contract').length,
  configurationContracts: data.journeys.filter((journey) => journey.kind === 'configuration-contract').length,
  runtimeVerified: data.journeys.filter((journey) => journey.evidenceStatus === 'verified').length }));
