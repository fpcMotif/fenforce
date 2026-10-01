# CRM journey catalog and test baseline

## At a glance

Fenforce's CRM behavior spans routes, services, settings, and several test runners.
This catalog maps user journeys and captures tests before their runner migration.
Existing product contracts remain the baseline; this work adds no ERP stock management.

## What this catalog means

“Inventory” in issue [#15](https://github.com/fpcMotif/fenforce/issues/15) means a catalog of CRM journeys and tests.
It does not describe stock, SKUs, warehouses, or ERP inventory data.

[crm-journeys.json](crm-journeys.json) separates concrete behaviors from declared configuration variants.
Every entry names actors, permissions, inputs, effects, failures, observable outcomes, fixtures, sources, and implementation status.
Entries also identify their implementation ticket, applicable acceptance dimensions, and planned testing tools.
Fixture descriptions are plans; execution must materialize and freeze the actual synthetic fixture.

Source inspection establishes that code or declarations exist.
Listed test paths identify possible test seams; their presence does not establish scenario coverage.
An executed test result also does not establish every journey mapped near that test.
Journey coverage remains unverified until its domain ticket supplies behavior-specific evidence.

The existing Twenty application remains the behavior baseline where Convex replacement functionality is missing.
Candidate implementation status remains separate from test evidence.
Lean and TLA+ remain setup-only tasks in [#37](https://github.com/fpcMotif/fenforce/issues/37) and [#38](https://github.com/fpcMotif/fenforce/issues/38).

## Ownership

| Ticket | Journey area |
| --- | --- |
| [#25](https://github.com/fpcMotif/fenforce/issues/25) | Identity, tenancy, security, and members |
| [#26](https://github.com/fpcMotif/fenforce/issues/26) | Records, relations, merging, and lifecycle |
| [#27](https://github.com/fpcMotif/fenforce/issues/27) | Objects, fields, indexes, and metadata |
| [#28](https://github.com/fpcMotif/fenforce/issues/28) | Routing, navigation, views, search, and pagination |
| [#29](https://github.com/fpcMotif/fenforce/issues/29) | Content, files, imports, exports, and activity |
| [#30](https://github.com/fpcMotif/fenforce/issues/30) | Layouts, dashboards, and charts |
| [#31](https://github.com/fpcMotif/fenforce/issues/31) | Accounts, communications, contacts, and campaigns |
| [#32](https://github.com/fpcMotif/fenforce/issues/32) | APIs, events, webhooks, and external clients |
| [#33](https://github.com/fpcMotif/fenforce/issues/33) | Applications, marketplace, and logic functions |
| [#34](https://github.com/fpcMotif/fenforce/issues/34) | Workflow definitions, actions, and durable execution |
| [#35](https://github.com/fpcMotif/fenforce/issues/35) | AI conversations, tools, and failures |
| [#36](https://github.com/fpcMotif/fenforce/issues/36) | Billing, entitlements, operations, administration, legal, and support |

BE-23 spans search, exports/activity/recordings, and charts.
Each concrete journey has one owner among those three tickets.
Common authorization dimensions remain applicable to every protected boundary.

## Captured evidence

[baseline/2026-10-01](baseline/2026-10-01) contains the observed checkout and test evidence.

| Artifact | Meaning |
| --- | --- |
| `checkout.json` | Revision, branch, tracked-diff digest, dirty paths, lockfile hashes, and runtime versions |
| `source-manifest.json` | Test files, source hashes, static skip markers, snapshots, and Storybook declarations |
| `suite-registry.json` | Test lanes, commands, configurations, runtime versions, and external fixture requirements |
| `configuration-sources.json` | Configuration source snapshots, original hashes, and redacted credential values |
| `package-commands.json` | Existing package commands, including separate Node and Bun test purposes |
| `results.json` | Collection identities, runtime counts, report references, snapshots, diagnostics, and durations |
| `*-report.json` | Exact JSON assertion identities, statuses, failure messages, and suite errors |
| `summary.json` | Counts, classified failures, missing prerequisites, and collection limitations |
| `timings.json` | Matched representative cold and warm runs with commands and result totals |
| `provenance.json` and `captures/` | Latest observed context and immutable descriptors referenced by refreshed lanes |
| `preparation.json` | Dependency preparation, preserved manifest hashes, and unavailable build prerequisites |

Jest collection returns file identities; execution supplies individual test identities and statuses.
Vitest's discovery output can differ from executed assertions, especially for dynamic helper calls.
Playwright and Storybook retain separate browser lanes.
Static skip markers and Storybook exports are source observations, not executed test identities.
Overlapping configuration aliases must not inflate unique test counts.

This capture includes existing uncommitted changes.
The revision alone cannot recreate those changes.
The tracked-diff digest excludes this documentation deliverable and identifies other tracked changes.
It is not a saved checkout archive.
Replays must match the captured source, configuration, dependency, and fixture prerequisites.
The artifact records missing prerequisites and existing failures without claiming a clean repository pass.
Initial results lack immutable per-lane provenance; their current checkout metadata cannot establish exact replay.
Refreshed results reference their own capture descriptor.
The observed Node 26 runtime differs from several declared Node 24 engine ranges.

## Procedure

1. Inspect the checkout, versions, lane definitions, and captured failures before comparing a migration.
2. Validate the catalog and its failing controls.

   ```sh
   bun docs/testing/check-journeys.mts --self-test
   ```

3. Capture a new baseline into a separate output directory.

   ```sh
   bun docs/testing/capture-baseline.mts --output .cache/testing-baseline
   ```

4. Execute the available local suites without cached task success.

   ```sh
   bun docs/testing/capture-baseline.mts --output .cache/testing-baseline --execute
   ```

5. Prepare disposable fixtures before selecting an external lane.

   ```sh
   bun docs/testing/capture-baseline.mts --output .cache/testing-baseline --execute --external --only=LANE_ID
   ```

6. Use `--refresh` when changed code, fixtures, or unresolved capture errors justify repeating a lane.
7. Compare collected files, assertions, skips, snapshots, thresholds, failure categories, and required artifacts.
8. Measure the representative utilities suite with matched identities and results.

   ```sh
   bun docs/testing/measure-timings.mts .cache/testing-baseline/timings.json
   ```

9. Generate the summary after capture finishes.

   ```sh
   bun docs/testing/summarize-baseline.mts .cache/testing-baseline
   ```

Run one capture process per output directory.
`--execute` resumes completed lanes unless `--refresh` is supplied.
External execution requires isolated server, browser, or provider fixtures; it otherwise records a blocked result.
Vitest integration discovery can run service setup and also requires those fixtures.
Changed capture contexts require a new output directory or an explicit refresh.
The capture never resets databases or starts hosted campaigns.
It keeps credential values out of committed artifacts.

Validate redaction separately with `bun docs/testing/evidence-redaction.mts --self-test`.
Strict tooling checks use the installed compiler and Node types in `packages/twenty-front`.

```sh
cd packages/twenty-front
bunx --no-install tsgo --ignoreConfig --strict --noEmit --skipLibCheck --module nodenext --target es2023 --typeRoots node_modules/@types --types node ../../docs/testing/*.mts
```

## Completion boundary

This change supplies the CRM catalog and observed pre-migration testing baseline.
Issue #15 remains open while required collections lack their isolated fixtures or dependencies.
Runner migration, generated properties, mutation assessment, fuzz workloads, and provider verification belong to their child tickets.
The catalog validator checks structural traceability and rejects unsupported pass states.
Its success does not prove behavioral coverage, deployment parity, or formal verification.

Every unexplained missing test and unsupported required boundary remains visible for subsequent implementation.
Issue [#39](https://github.com/fpcMotif/fenforce/issues/39) owns final evidence reconciliation against [#14](https://github.com/fpcMotif/fenforce/issues/14).
