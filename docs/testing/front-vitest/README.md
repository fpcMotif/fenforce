# twenty-front Vitest migration evidence

## At a glance

This is the acceptance evidence for issue [#17](https://github.com/fpcMotif/fenforce/issues/17).
twenty-front unit tests now run on Vite+-backed Vitest instead of Jest.
Every suite in the Jest baseline is collected and executed.
The only failing tests are the same 5 that failed under Jest.

| | Jest baseline | Vitest |
| --- | --- | --- |
| Test files collected | 1335 | 1336 |
| Test files failing | 119 | 3 |
| Tests executed | 7222 | 7905 |
| Tests failing | 44 | 5 |
| File snapshots | 85 | 85, byte-identical |
| Inline snapshots | 44 | 44 |

## Run context

| Item | Value |
| --- | --- |
| Baseline | Jest, revision `1790e94c`, [baseline/2026-10-01](../baseline/2026-10-01) |
| Candidate revision | `7a7113d9`; later commits add only this report and its script |
| Runtime | Node 24.16.0, Bun 1.4.2 |
| Runner | vite-plus 1.0.0, Vitest 5.0.1, jsdom 30.1.1 |
| Browser | Chromium 1194 (Playwright), headless |

Commands, run from `packages/twenty-front` after building twenty-shared, twenty-ui, twenty-sdk and the renderer:

```sh
bun run i18n:convex
bunx vp test run --config vite.unit.config.ts --coverage --reporter=json --outputFile.json=<report>
bun ../../docs/testing/summarize-front-vitest.mts docs/testing/front-vitest/2026-10-01 <report>
```

The run was uncached. [vitest-report.json](2026-10-01/vitest-report.json) uses the baseline report's shape.
[comparison.json](2026-10-01/comparison.json) lists every identity, status and duplicate difference.

## Collected-test differences

Every difference falls into one of these groups.
No threshold was lowered and no snapshot value changed.

**Suites Jest never collected (+684 tests).**
101 baseline suites failed before collecting a test.
61 hit Jest's rule against out-of-scope variables in `jest.mock` factories, and 37 failed to parse ESM.
One could not resolve the unbuilt renderer package, and two crashed their Jest workers.
Vitest collects all of them; their tests appear only in the Vitest report.

Four of those suites needed test-side repairs before they passed; see *Runner changes*.
They had never executed, so their expectations were never checked against the code before.

**New suite (+1).** `src/pages/convex-preview/__tests__/PreviewMessages.test.ts` did not exist at the baseline revision.

**Uncollected file (0 in both).** `src/modules/page-layout/widgets/record-table/utils/__tests__/sortFieldsByRelevanceForRecordTableWidget.ts` holds 8 tests but lacks the `.test` suffix.
Neither runner has ever collected it.
knip ignores it until it is merged into its `.test.ts` sibling, tracked as a follow-up.

**Renamed titles (same tests, same inputs).** Jest and Vitest format `test.each` titles differently.

| File | Tests | Difference |
| --- | --- | --- |
| `getRecordCreationCommandType.util.spec.ts` | 12 | Vitest interpolates `$expected` when the title also uses `%j`; Jest left it literal |
| `companyEnrichmentState.test.ts` | 2 | `%j` prints compact JSON; Jest's `%p` pretty-printed it |
| `useColorScheme.test.tsx` | 2 | `%s` prints objects on one line; Jest printed them across lines |

**Status changes.** 37 tests moved from failed to passed. None moved the other way.

**Duplicate names.** 27 identities repeat within their files, the same 27 as the baseline; they come from duplicated titles in the test sources.

**Remaining failures.** The same 5 tests failed under Jest.

| Suite | Failing tests | Cause under Vitest |
| --- | --- | --- |
| `objectMetadataItemSchema.test.ts` | 1 | Fixture lacks `objectMetadata` on its index metadata; same error under Jest |
| `useWebhookForm.test.tsx` | 3 | The success toast shows an empty webhook URL; same assertion fails under Jest |
| `RecordIndexPage.surface.test.tsx` | 1 | Waits for a `workflow-core-index` test id that no component renders |

Under Jest, the `RecordIndexPage` test failed earlier, on its dynamic import, which hid the stale assertion.
All three are test or product defects, not runner defects, and stay out of scope here.

## Runner changes

- `taskTitleValueFormatTruncate` is unbounded. Vitest otherwise cuts `$title` values at 40 characters, which broke test and snapshot identities.
- `%p` placeholders became `%j`; Vitest does not support `%p` and printed it literally.
- Two `test.each` tables were reshaped so every row keeps a unique, Jest-matching name.
  Vitest already passed whole rows to the handler when rows mix arrays and non-arrays; only the titles used the spread values.
- `setupVitest.ts` adds an `AnimationEvent` for jsdom, which React DOM needs to dispatch `animationend`.
- Test scripts compile the Convex preview catalogs first, as build and typecheck already do.
- Four suites that never ran under Jest were repaired: a partial mock, `__typename` on Apollo mocks, the jsdom event above, and a whitespace-tolerant accessible-name query.

## Snapshots

The 8 snapshot files held each entry twice: under the Jest key and under the Vitest key.
They now hold only Vitest keys.
A script compared every value against the Jest original at the parent revision: all 85 match byte for byte, with no missing or extra keys.

## Browser verification

Three representative stories ran in headless Chromium through the Storybook Vitest project.

| Story file | Stories | Covers |
| --- | --- | --- |
| `RecordSharingDropdown.stories.tsx` | 4 | Interactive record sharing |
| `MetadataTranslationValueCell.stories.tsx` | 3 | Locale and translation editing |
| `SettingsDevelopersWebhookForm.stories.tsx` | 3 | Form interaction and query errors |

All 10 passed.
The local run pointed Playwright at the installed Chromium 1194; the pinned Playwright expects a newer build.
`ECONNREFUSED 127.0.0.1:3000` lines came from the absent backend; these stories use mocked data.

## Coverage

The same uncached run collected coverage with the unchanged thresholds.

| Metric | Result | Threshold |
| --- | --- | --- |
| Statements | 51.14% | 47.3% |
| Lines | 51.16% | 45.9% |
| Functions | 52.33% | 39.5% |
| Branches | 48.59% | none |

All thresholds pass. The run exits non-zero only because of the 5 failing tests listed above.

## Work outside twenty-front

Fixing the front lanes exposed CI failures that Yarn hoisting had hidden.
At the owner's request, this change also:

- builds twenty-shared in the shared install action, because vite-plus loads every package's config before any task runs;
- declares imports Bun's isolated install no longer resolves (twenty-sdk, the renderer, twenty-server, the oxlint rules plugin);
- pins oxlint for twenty-website and `@tabler/icons-react` for twenty-ui at the versions Yarn had locked;
- installs Convex dependencies with the repository's Bun, since the pinned 1.4.3 has no release.

These change shared manifests and CI; they are listed so a reviewer can weigh them apart from the runner migration.

## Limitations

The full Storybook browser lanes and the Playwright end-to-end suite were not run locally.
CI runs them.
