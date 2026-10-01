import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeEvidence } from './evidence-redaction.mjs';

type Assertion = {
  file: string;
  name: string;
  status: string;
  failureMessages: string[];
};
type Suite = { file: string; status: string; message: string };
type Report = { suites: Suite[]; assertions: Assertion[] };
type VitestReport = {
  testResults: {
    name: string;
    status: string;
    message?: string;
    assertionResults: {
      fullName: string;
      status: string;
      failureMessages?: string[];
    }[];
  }[];
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BASELINE = resolve(
  ROOT,
  'docs/testing/baseline/2026-10-01/packages--twenty-front--jest.config-report.json',
);
const [outputArgument, ...reportArguments] = process.argv.slice(2);
if (!outputArgument || reportArguments.length === 0) {
  throw new Error(
    'Usage: bun docs/testing/summarize-front-vitest.mts <output-dir> <vitest-json>...',
  );
}
const OUTPUT = resolve(ROOT, outputArgument);

const candidate: Report = { suites: [], assertions: [] };
for (const reportPath of reportArguments) {
  const report = JSON.parse(
    readFileSync(resolve(reportPath), 'utf8'),
  ) as VitestReport;
  for (const result of report.testResults) {
    const file = relative(ROOT, result.name);
    candidate.suites.push({
      file,
      status: result.status,
      message: result.message ?? '',
    });
    for (const assertion of result.assertionResults) {
      candidate.assertions.push({
        file,
        name: assertion.fullName,
        status: assertion.status,
        failureMessages: assertion.failureMessages ?? [],
      });
    }
  }
}
candidate.suites.sort((left, right) => left.file.localeCompare(right.file));
candidate.assertions.sort(
  (left, right) =>
    left.file.localeCompare(right.file) || left.name.localeCompare(right.name),
);

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Report;
const identity = (assertion: Assertion) =>
  `${assertion.file}::${assertion.name}`;
const countBy = (values: string[]) =>
  Object.fromEntries(
    [...new Set(values)]
      .sort()
      .map((value) => [value, values.filter((item) => item === value).length]),
  );
const duplicates = (assertions: Assertion[]) => {
  const seen = new Set<string>();
  return assertions
    .map(identity)
    .filter((key) => seen.has(key) || !seen.add(key));
};
const baselineByIdentity = new Map(
  baseline.assertions.map((assertion) => [identity(assertion), assertion]),
);
const candidateByIdentity = new Map(
  candidate.assertions.map((assertion) => [identity(assertion), assertion]),
);
const baselineSuites = new Map(
  baseline.suites.map((suite) => [suite.file, suite]),
);
const candidateSuites = new Set(candidate.suites.map((suite) => suite.file));
const groupByFile = (keys: string[]) =>
  countBy(keys.map((key) => key.split('::')[0]));

const onlyCandidate = [...candidateByIdentity.keys()].filter(
  (key) => !baselineByIdentity.has(key),
);
const comparison = {
  baseline: {
    suites: countBy(baseline.suites.map((suite) => suite.status)),
    tests: countBy(baseline.assertions.map((assertion) => assertion.status)),
  },
  candidate: {
    suites: countBy(candidate.suites.map((suite) => suite.status)),
    tests: countBy(candidate.assertions.map((assertion) => assertion.status)),
  },
  suitesOnlyInBaseline: [...baselineSuites.keys()].filter(
    (file) => !candidateSuites.has(file),
  ),
  suitesOnlyInCandidate: [...candidateSuites].filter(
    (file) => !baselineSuites.has(file),
  ),
  testsOnlyInBaselineByFile: groupByFile(
    [...baselineByIdentity.keys()].filter(
      (key) => !candidateByIdentity.has(key),
    ),
  ),
  testsOnlyInCandidateByFile: Object.fromEntries(
    Object.entries(groupByFile(onlyCandidate)).map(([file, count]) => [
      file,
      {
        count,
        baselineSuiteStatus: baselineSuites.get(file)?.status ?? 'absent',
      },
    ]),
  ),
  statusChanges: [...baselineByIdentity.keys()]
    .filter(
      (key) =>
        candidateByIdentity.has(key) &&
        baselineByIdentity.get(key)?.status !==
          candidateByIdentity.get(key)?.status,
    )
    .map((key) => ({
      test: key,
      from: baselineByIdentity.get(key)?.status,
      to: candidateByIdentity.get(key)?.status,
    })),
  duplicateIdentities: {
    baseline: duplicates(baseline.assertions),
    candidate: duplicates(candidate.assertions),
  },
  failingCandidateSuites: candidate.suites
    .filter((suite) => suite.status !== 'passed')
    .map((suite) => ({
      file: suite.file,
      baselineSuiteStatus: baselineSuites.get(suite.file)?.status ?? 'absent',
      failedTests: candidate.assertions
        .filter(
          (assertion) =>
            assertion.file === suite.file && assertion.status === 'failed',
        )
        .map((assertion) => ({
          name: assertion.name,
          failedInBaseline:
            baselineByIdentity.get(identity(assertion))?.status === 'failed',
        })),
    })),
};

mkdirSync(OUTPUT, { recursive: true });
writeFileSync(
  resolve(OUTPUT, 'vitest-report.json'),
  `${JSON.stringify(sanitizeEvidence(candidate, ROOT), null, 2)}\n`,
);
writeFileSync(
  resolve(OUTPUT, 'comparison.json'),
  `${JSON.stringify(sanitizeEvidence(comparison, ROOT), null, 2)}\n`,
);
console.log(
  JSON.stringify({
    baseline: comparison.baseline,
    candidate: comparison.candidate,
    statusChanges: countBy(
      comparison.statusChanges.map((change) => `${change.from}->${change.to}`),
    ),
  }),
);
