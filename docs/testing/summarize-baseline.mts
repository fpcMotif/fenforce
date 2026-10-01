import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeEvidence } from './evidence-redaction.mjs';

type Assertion = { file: string; name: string; status: string; failureMessages?: string[] };
type Lane = {
  id: string;
  runner: string;
  external: boolean;
  captureId?: string | null;
  collection: { status: string; entries?: unknown[]; diagnostics?: string; reason?: string };
  execution?: { status: string; reportArtifact?: string; result?: {
    numTotalTests?: number; numPassedTests?: number; numFailedTests?: number; numPendingTests?: number;
    assertions?: Assertion[]; identities?: string[]; suites?: { message: string }[];
  } | null; diagnostics?: string; reason?: string; durationMs?: number; command?: string[] };
};
type Manifest = {
  testFiles: { path: string; skipMarkers: { kind: string }[] }[];
  snapshots: { entries: number }[];
  stories: unknown[];
  configurationFiles: string[];
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT = resolve(ROOT, process.argv[2] ?? 'docs/testing/baseline/2026-10-01');
const read = <TData,>(name: string): TData => JSON.parse(readFileSync(resolve(OUTPUT, name), 'utf8')) as TData;
const lanes = read<Lane[]>('results.json');
for (const lane of lanes) {
  if (lane.execution?.reportArtifact) lane.execution.result = read(lane.execution.reportArtifact);
}
const registry = read<{ id: string }[]>('suite-registry.json');
const manifest = read<Manifest>('source-manifest.json');
assert.equal(lanes.length, registry.length, 'Missing lane result');
assert(registry.every((lane) => lanes.some((result) => result.id === lane.id)), 'Mismatched lane results');

const counts = (values: string[]) => Object.fromEntries([...new Set(values)].sort()
  .map((value) => [value, values.filter((item) => item === value).length]));
const assertions = lanes.flatMap((lane) => lane.execution?.result?.assertions ?? []);
const testIdentities = new Map(assertions.map((test) => [JSON.stringify([test.file, test.name]), test]));
const collectedJestFiles = new Set(lanes.filter((lane) => lane.runner === 'jest')
  .flatMap((lane) => (lane.collection.entries ?? []).filter((entry): entry is string => typeof entry === 'string')));

function classify(lane: Lane) {
  const failureMessages = (lane.execution?.result?.assertions ?? [])
    .filter((test) => test.status === 'failed').flatMap((test) => test.failureMessages ?? []);
  const evidence = [lane.collection.reason, lane.collection.status === 'failed' ? lane.collection.diagnostics : '',
    lane.execution?.reason, ...(failureMessages.length ? failureMessages : [lane.execution?.diagnostics]),
    ...(lane.execution?.result?.suites ?? []).map((suite) => suite.message)].join('\n');
  const categories: string[] = [];
  if (/ECONNREFUSED|fetch failed|Failed to fetch|localhost:2020|localhost:3000/i.test(evidence)) categories.push('service-fixture-unavailable');
  if (/Cannot find|Could not resolve|Could not find an existing|Failed to resolve|does not provide an export/i.test(evidence)) categories.push('dependency-or-module-compatibility');
  if (/Failed to load \.env|missing.*(?:API|TOKEN|KEY)|required.*(?:API|TOKEN|KEY)/i.test(evidence)) categories.push('environment-fixture-unavailable');
  if (/example-sources-built|Failed to load static files/i.test(evidence)) categories.push('generated-story-prerequisite');
  if (lane.execution?.status === 'blocked') categories.push('external-runtime-not-executed');
  if (lane.execution?.result?.numFailedTests) categories.push('assertion-failure');
  if (lane.collection.status === 'empty' || lane.execution?.status === 'empty') categories.push('empty-required-output');
  if (categories.length === 0) categories.push('unclassified-baseline-failure');
  return categories;
}

const unresolved = lanes.filter((lane) => ['failed', 'empty', 'timed-out', 'blocked'].includes(lane.collection.status)
  || ['failed', 'empty', 'timed-out', 'blocked'].includes(lane.execution?.status ?? ''));
const summary = {
  capturedAt: new Date().toISOString(), issue: 'https://github.com/fpcMotif/fenforce/issues/15',
  checkout: read<unknown>('checkout.json'), laneCount: lanes.length,
  collection: counts(lanes.map((lane) => lane.collection.status)),
  execution: counts(lanes.map((lane) => lane.execution?.status ?? 'not-executed')),
  source: { testFiles: manifest.testFiles.length, snapshotFiles: manifest.snapshots.length,
    snapshotEntries: manifest.snapshots.reduce((total, snapshot) => total + snapshot.entries, 0),
    storyFiles: manifest.stories.length, configurationFiles: manifest.configurationFiles.length,
    staticMarkers: counts(manifest.testFiles.flatMap((file) => file.skipMarkers.map((marker) => marker.kind))) },
  identities: { uniqueCollectedJestFiles: collectedJestFiles.size, uniqueRuntimeJsonAssertions: testIdentities.size,
    runtimeJsonStatuses: counts([...testIdentities.values()].map((test) => test.status)),
    nativeRunnerDisplayNames: lanes.filter((lane) => lane.execution?.result?.identities).map((lane) => lane.id),
    semantics: 'JSON identities deduplicate file and fullName. Native display names retain runner context. Discovery entries can contain dynamic helper artifacts.' },
  lanes: lanes.map((lane) => ({ id: lane.id, captureId: lane.captureId ?? null,
    collectionStatus: lane.collection.status, collectedEntries: lane.collection.entries?.length ?? null,
    executionStatus: lane.execution?.status ?? 'not-executed', total: lane.execution?.result?.numTotalTests ?? null,
    passed: lane.execution?.result?.numPassedTests ?? null, failed: lane.execution?.result?.numFailedTests ?? null,
    pending: lane.execution?.result?.numPendingTests ?? null, durationMs: lane.execution?.durationMs ?? null })),
  unresolved: unresolved.map((lane) => ({ id: lane.id, categories: classify(lane),
    reason: lane.execution?.reason ?? lane.collection.reason ?? null,
    failedAssertions: (lane.execution?.result?.assertions ?? []).filter((test) => test.status === 'failed')
      .map((test) => ({ file: test.file, name: test.name, failureMessages: test.failureMessages })) })),
  limitations: [
    'Required external suites lack isolated service, browser, or provider fixtures; those acceptance checks remain open.',
    'Initial results without captureId lack immutable per-lane provenance. Their current checkout metadata cannot establish exact replay.',
    'Node 26.10.0 is the observed runtime. Several package engine ranges require Node 24; compatibility is not assumed.',
    'Existing assertions and dependency failures precede runner migration; this task changes neither product nor runner behavior.',
    'Source skip markers are static signals. Runtime reports establish executed skips only where captured.',
    'Configured coverage thresholds are recorded; coverage percentages were not measured by these runs.',
    'The dirty checkout digest is not a saved source archive. Untracked source and dependency prerequisites remain necessary.',
    'Passing baseline tests do not establish coverage of every catalogued journey or deployed provider behavior.',
  ],
  acceptanceStatus: unresolved.length > 0 ? 'partial-required-lanes-unresolved' : 'required-lanes-collected',
  classificationSemantics: 'Categories are diagnostic leads from observed failures, not independent root-cause proofs or migration regressions.',
};
writeFileSync(resolve(OUTPUT, 'summary.json'), JSON.stringify(sanitizeEvidence(summary, ROOT), null, 2) + '\n');
console.log(JSON.stringify({ lanes: lanes.length, collection: summary.collection, execution: summary.execution,
  uniqueAssertions: testIdentities.size, unresolved: unresolved.length }));
