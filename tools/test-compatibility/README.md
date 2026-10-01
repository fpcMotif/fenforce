# Runner compatibility

## At a glance

Existing Vitest 4 adapters conflict with the checkout's Vite+ 1 and Vitest 5 dependencies.
This isolated, locked package measures a candidate compatibility matrix and supplies fail-closed CI commands.
Package migrations update their own entrypoints separately; this compatibility package does not replace browser or Bun-native lanes.

This package implements preparatory infrastructure for [#16](https://github.com/fpcMotif/fenforce/issues/16).
It does not close #15 or establish CRM journey coverage.
Package migrations belong to #17–#20; broader mutation coverage belongs to #22.

## Pinned matrix

| Component                            | Version              | Executed boundary                                       |
| ------------------------------------ | -------------------- | ------------------------------------------------------- |
| Node                                 | 24.16.0              | Vite+ and Stryker processes                             |
| Bun                                  | 1.4.2                | Installation and command orchestration                  |
| Vite+                                | 1.0.0                | Built-in `vp test run`                                  |
| Vitest, browser adapter, V8 coverage | 5.0.1                | Node, jsdom, Chromium, coverage                         |
| Playwright                           | 1.63.0               | Headless Chromium                                       |
| Storybook and Vitest addon           | 10.6.1               | Browser Mode story interaction                          |
| Stryker core and Vitest runner       | 10.0.0               | Two generated mutants killed                            |
| TypeScript native preview            | 7.0.0-dev.20260707.2 | Configuration and fixture typecheck                     |
| Nest common/testing; core            | 11.2.1; 11.2.6       | Constructor injection from emitted metadata             |
| TypeORM; PostgreSQL                  | 0.3.31; 16.4         | Inferred columns, persistence, rollback, schema cleanup |
| Lingui; Linaria core                 | 5.9.5; 7.0.0         | Macro transform and extracted CSS                       |

The local lockfile fixes transitive dependencies independently from the unfinished root migration.
Standalone Vitest remains installed because Storybook and Stryker consume its APIs.
This synthetic TypeORM fixture does not use the server's patched TypeORM dependency.
Server migration must validate that patch and its existing fixtures separately.

## Clean setup

1. Enter `tools/test-compatibility` in a clean checkout.
2. Run `mise install` for the versions in `mise.toml`.
3. Run `mise exec -- bun install --frozen-lockfile`.
4. Run `mise exec -- bunx --no-install playwright install chromium`.
5. Run `mise exec -- bun run typecheck`.
6. Run `mise exec -- bun run test:pr`.
7. Run `mise exec -- bun run mutation`.

Linux hosts need Chromium system dependencies: use `playwright install --with-deps chromium` in step four.
CI performs that installation on its ephemeral runner.
Neither setup nor verification requires npm or npx.

For PostgreSQL, create a disposable local database named `fenforce_compatibility`.
The CI workflow pins the container image by digest and waits for readiness.
Set `COMPATIBILITY_DATABASE_URL`, then run `mise exec -- bun run test:integration`.
Only localhost, loopback, or the CI service hostname `postgres` is accepted.
Every execution creates a unique schema and removes it in teardown.
Do not point this fixture at customer databases.

Root entrypoints are `bun run test:compatibility`, `test:compatibility:integration`, and `test:compatibility:extended`.
They require the pinned tools on PATH and the isolated installation first.

## Commands and evidence

`bun check.mts PROJECT` selects `node`, `dom`, `browser`, `storybook`, `integration`, `secure-deployment`, or `provider`.
`pr` runs the first four projects; `extended` selects all seven.
Each selected project runs separately, preventing another project's tests from hiding an empty suite.
Empty, skipped, failed, timed-out, or missing reports produce a nonzero exit.
Secure-deployment and provider projects currently have no migrated fixtures and deliberately fail this gate.
They must gain real boundary checks before extended verification can pass.

The Node lane accepts `bun check.mts node 1/2` and `bun check.mts node 2/2`.
Each shard must execute tests; unsharded Node verification owns the coverage threshold.
CI runs both shards and the unsharded coverage lane.
Workers are limited to two; each project has a two-minute process limit.
Mutation execution uses one worker and excludes Browser Mode.
The 100% coverage and mutation gates apply only to the tiny greeting fixture.
They are not repository-wide thresholds and replace no existing gates.

`artifacts/PROJECT/` contains JSON, JUnit, command, revision, runtime versions, timing, and execution status.
Node coverage appears beneath that directory; mutation JSON and HTML appear in `artifacts/mutation/`.
Chromium writes `artifacts/browser-counter.png`.
CI uploads artifacts even after failures and rejects missing artifact output.
The revision identifies the base checkout; a SHA-256 digest identifies the exact isolated source contents.
The digest includes configuration, lockfile, fixtures, and commands, excluding dependencies and generated artifacts.
Copies without Git metadata report an unavailable revision but retain this source digest.

For diagnosis, run `bunx --no-install vp test run --project node tests/node/runner.test.ts`.
Watch mode uses `bunx --no-install vp test --project node`; IDEs can load `vite.config.ts`.
Direct runner commands do not replace the report-validation gate.
No task-result cache supplies acceptance evidence.

## Measured results and open gates

Execution date: 2026-10-01; base revision: `11a947279e`, plus this issue's reviewed source changes.
The fresh installation ran outside the repository and resolved dependencies from its frozen lockfile.

| Project | Passing assertions | Fresh-install process duration |
| --- | ---: | ---: |
| Node | 6 | 9.56 seconds |
| DOM | 1 | 11.26 seconds |
| Chromium | 1 | 14.45 seconds |
| Storybook | 1 | 18.04 seconds |
| PostgreSQL integration | 1 | 4.03 seconds |
| Secure deployment | 0; blocked | 1.34 seconds |
| Provider | 0; blocked | 3.62 seconds |

Durations include runner startup; these measurements support no speed-improvement claim.
Both Node shards subsequently executed three assertions successfully.
PostgreSQL reported zero remaining compatibility schemas after fixture teardown.

Local execution on macOS arm64 verified ESM aliases, hoisted factories, fake timers, and snapshots.
Nest constructor injection and PostgreSQL persistence/rollback passed with inferred decorator types.
DOM and Chromium checks passed; Chromium also checked extracted CSS and produced an inspected screenshot.
Storybook 10.6.1 executed its interaction story under Vitest 5.0.1.
Stryker 10.0.0 executed its Vitest runner: two killed, zero survived, uncovered, timed-out, or errored mutants.
These are synthetic compatibility results, not production or all-CRM evidence.

The initial UI run failed without a Lingui config and a separate Babel macro transform.
The final configuration supplies both alongside Linaria extraction.
The typed configuration exports its object directly; calling Vite+'s `defineConfig` triggered recursive compiler diagnostics.
Vite+/Vitest currently emits a mocks-interceptor hook warning; the focused mock checks determine behavioral compatibility.

#15 remains incomplete: its baseline recorded 15 blocked and five failed collection lanes.
Existing failures include mixed Vitest browser adapters, missing Storybook prebuilds, E2E environment, and application dependencies.
Secure deployment, hosted providers, and existing server application fixtures remain unverified here.
GitHub execution is configured; only an actual workflow run establishes Linux CI success.
Existing Playwright E2E commands and intentionally separate `bun test` suites remain in their owning packages.
Their inventory and blockers remain in `docs/testing/`; this package does not reconcile their test identities.
