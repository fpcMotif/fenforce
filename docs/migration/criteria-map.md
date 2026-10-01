# Migration acceptance criteria

## At a glance

The replacement must preserve accepted Twenty behavior, data, permissions, integrations, and recovery before taking ownership.
These criteria are proposed and unrun; source inspection establishes neither passing tests nor runtime parity.
The inspected baseline is `1bf3ec682fcc7b768d1ea895d1a39ec917299b5c`; every release needs evidence from its actual candidate revision.

## Evidence and decisions

Create one evidence record per feature contract and applicable acceptance criterion.
Use stable feature identifiers from the feature map and the acceptance identifiers below.
Record an explicit reason when a criterion does not apply.
An unknown requirement remains open; a missing test does not establish absence of behavior.

| Field | Required content |
| --- | --- |
| Identity | Feature ID, acceptance ID, owner, source paths, and contract version. |
| Baseline | Twenty revision, deployment, executable scenario, raw outputs, persisted state, screenshots where relevant, and timing samples. |
| Candidate | Replacement revision, dependency versions, deployment, identical scenario, outputs, state, screenshots, and timing samples. |
| Fixture | Workspace, actor, records, schema, flags, entitlements, locale, provider mode, and fixture checksum. |
| Comparison | Expected result, actual difference, allowed normalization, side-effect counts, and pass/fail reason. |
| Independent review | Reviewer, exact revisions inspected, checks reproduced, artifacts inspected, verdict, and unresolved findings. |
| Decision | Accepted behavior, intentional improvement, blocker, or explicitly approved scope exclusion. |

Normalize only documented nondeterminism, such as generated identifiers through a verified mapping.
Do not normalize away missing fields, authorization differences, ordering guarantees, duplicate effects, or data loss.
Keep observed behavior distinct from intended requirements.
Record baseline defects as correction requirements rather than reproducing them accidentally.

“Equal” requires all applicable criteria to pass without unexplained differences.
“Better” additionally requires a measured improvement against a frozen metric or an accepted correction of a baseline defect.
Examples include lower p95 latency, fewer task steps, improved accessibility, or recovery from an identified failure.
An improvement cannot compensate for lost functionality, weakened permissions, or unrecoverable data.
Freeze workloads, budgets, normalization rules, and accepted behavior before judging the candidate.

## Acceptance gates

Stable anchors are listed here for feature-map references.

<a id="ac-01"></a>
<a id="ac-02"></a>
<a id="ac-03"></a>
<a id="ac-04"></a>
<a id="ac-05"></a>
<a id="ac-06"></a>
<a id="ac-07"></a>
<a id="ac-08"></a>
<a id="ac-09"></a>
<a id="ac-10"></a>
<a id="ac-11"></a>
<a id="ac-12"></a>
<a id="ac-13"></a>
<a id="ac-14"></a>
<a id="ac-15"></a>
<a id="ac-16"></a>
<a id="ac-17"></a>

| ID | Contract | Pass condition |
| --- | --- | --- |
| AC-01 | Coverage and behavior | Every inventoried contract has baseline, candidate, and independent review evidence. No required contract remains unclassified. |
| AC-02 | Identity and sessions | Supported login, invitations, OAuth, SSO, TOTP, renewal, sign-out, and revoked-session scenarios satisfy their accepted contracts. |
| AC-03 | Authorization | Zero unauthorized reads, writes, subscriptions, exports, file access, or metadata disclosure across tested principals and workspaces. |
| AC-04 | Revocation and concurrency | Permission changes affect active clients and queued work within the frozen contract. Concurrent operations preserve declared invariants. |
| AC-05 | Data integrity | Complete canonical sets reconcile with zero unexplained differences in records, metadata, relations, timestamps, audit data, and file hashes. |
| AC-06 | Side effects and retries | Duplicates, crashes, reordered events, and lost acknowledgements produce permitted effect counts and converge to the accepted state. |
| AC-07 | Realtime and navigation | Direct URLs, refresh, history, subscriptions, pagination, multiple clients, and reconnect converge within frozen budgets. |
| AC-08 | Errors and recovery | Validation, partial success, retry affordances, cancellation, and persisted failure states satisfy the accepted contract. |
| AC-09 | Accessibility and presentation | No new serious or critical automated violations. Keyboard, focus, zoom, contrast, and screen-reader journeys pass. |
| AC-10 | Localization | Declared locales preserve messages, formatting, parsing, time zones, DST, RTL, and text visibility in covered flows. |
| AC-11 | Performance and cost | Matched repeated workloads satisfy frozen latency, resource, throughput, and cost budgets with equal result and error totals. |
| AC-12 | External consumers | Supported REST, GraphQL, SDK, application, CLI, Zapier, and companion consumers pass their contract scenarios. |
| AC-13 | Flags and entitlements | Enabled, disabled, expired, revoked, and quota-limited states preserve accepted behavior, including transitions during active work. |
| AC-14 | Operations | Intended deployments pass real sign-in, provider operations, alerting, reconciliation, and recovery drills with correlated evidence. |
| AC-15 | Migration and rollback | Rehearsed cutover and rollback preserve acknowledged writes within agreed RPO and restore service within agreed RTO. |
| AC-16 | Administrative controls | Authorized operators can inspect health and apply configured controls. Nonoperators cannot invoke equivalent backend operations. |
| AC-17 | Legal and support | DPA previews, signed copies, template versions, dates, downloads, support identity, and localized documentation links preserve accepted behavior. |

Declare supported browsers, devices, deployment regions, dataset sizes, concurrency, and provider versions in the evidence fixture.
Do not select a universal performance threshold before collecting the baseline.
Compare repeated samples and report variance, cold and warm behavior, and p50/p95/p99 latency where applicable.
Confirm required deployment regions before freezing regional budgets.

## Differential test matrix

Use risk-based combinations, with full combinations for authorization boundaries and irreversible effects.
Record the combinations exercised; these dimensions do not promise exhaustive behavioral coverage.

| Dimension | Required examples |
| --- | --- |
| Actor | Anonymous, invitee, member, admin, custom role, restricted row/field role, API key, OAuth application, provider. |
| Tenancy | Same workspace, different workspace, suspended workspace, deleted member, expired invitation, revoked session. |
| Data | Empty and large datasets, supported field types, null versus missing, Unicode, RTL, relations, deletion/restoration, attachments. |
| Schema | Field and object changes, unique constraints, junctions, installed application metadata, upgrades. |
| Concurrency | Two editors, duplicate submissions, deletion versus update, revocation versus read, retry versus cancellation. |
| Provider | Success, 401/403, 429, timeout, malformed payload, duplicate/reordered event, expired token/cursor, lost acknowledgement. |
| Client | Cold navigation, refresh, history, stale cache, offline/reconnect, multiple tabs, pagination, subscriptions. |
| Access configuration | Flag and entitlement transitions, expiration, revocation, and exhausted quotas. |

## Contracts beyond frontend features

| Contract | Source | Required comparison |
| --- | --- | --- |
| Commercial entitlements | [Entitlement keys](../../packages/twenty-server/src/engine/core-modules/billing/enums/billing-entitlement-key.enum.ts) | SSO, custom domains, RLS, record sharing, audit logs, and usage limits. |
| Enterprise lifecycle | [Enterprise plan service](../../packages/twenty-server/src/engine/core-modules/enterprise/services/enterprise-plan.service.ts) | Validity, expiration, revocation, server binding, and unavailable validation service. |
| Entitlement synchronization | [Entitlement synchronization](../../packages/twenty-server/src/engine/core-modules/billing-webhook/services/billing-entitlement-sync.service.ts) | Duplicate, delayed, and reversed grants/revocations cannot leave stale access. |
| Feature flags | [Flag keys](../../packages/twenty-shared/src/types/FeatureFlagKey.ts) | Capture each deployed workspace's state; compare enabled and disabled behavior separately. |
| Client SDK | [Client exports](../../packages/twenty-client-sdk/package.json) | Core, metadata, REST, and generation contracts for supported consumer versions. |
| Application SDK and CLI | [SDK exports](../../packages/twenty-sdk/package.json) | Definitions, billing, functions, components, rendering, generation, installation, upgrades, and CLI behavior. |
| Zapier | [Authentication](../../packages/twenty-zapier/src/authentication.ts), [trigger tests](../../packages/twenty-zapier/src/triggers/__tests__) | Authentication, dynamic metadata, pagination, deduplication, triggers, actions, and errors. |
| Desktop companion | [Client](../../packages/twenty-companion/src/main/services/TwentyClient.ts), [recording controller](../../packages/twenty-companion/src/main/services/RecordingController.ts) | Backend requests, authentication, uploads, permission failures, and recovery. |
| Installed applications | [Companion application](../../packages/twenty-apps/public/companion), [application CI](../../.github/workflows/ci-twenty-apps.yaml) | Manifests, identifiers, roles, triggers, assets, secret references, and upgrade behavior. |
| Administrative controls | [Admin panel](../../packages/twenty-front/src/modules/settings/admin-panel), [health service](../../packages/twenty-server/src/engine/core-modules/admin-panel/admin-panel-health.service.ts) | Operator authorization, flag changes, configuration, health visibility, failures, and recovery. Apply AC-16 and common gates. |
| Legal and support | [DPA page](../../packages/twenty-front/src/pages/settings/legal/SettingsLegalDpa.tsx), [support integration](../../packages/twenty-front/src/modules/support/hooks/useInstantiateSupportChat.ts), [documentation URLs](../../packages/twenty-front/src/modules/support/utils/getDocumentationUrl.ts) | Workspace-bound agreements, generation, historical copies, error states, support identity, locale fallback, and valid links. Apply AC-17 and common gates. |

Flagged behavior includes async CSV export, unique indexes, configurable search, JSON filters, campaigns, and junction relations.
It also includes REST metadata formats, record/chat sharing, deferred migrations, execution quotas, and record creation forms.
Source presence does not establish production availability or current customer entitlement.
Inventory deployed consumers before removing their APIs.

## Migration and rollback rehearsal

1. Freeze source revision, schema, enabled capabilities, supported consumers, and ownership of each mutable dataset.
2. Define RPO, RTO, stop conditions, and how acknowledged target writes survive rollback.
3. Export a consistent snapshot containing records, metadata, identities, timestamps, relations, files, and audit history.
4. Define reversible identifier mappings and explicit handling for nonportable credentials and provider cursors.
5. Import into a disposable target and reconcile complete canonical sets, relationship integrity, and file hashes.
6. Replay changes after the snapshot checkpoint, including deletions, permission changes, and provider events.
7. Stop competing writers or prove ordered reconciliation before transferring authority.
8. Inject crashes at import, checkpoint, attachment, external-effect, and cutover boundaries.
9. Repeat interrupted steps and verify identical final state without duplicated effects.
10. Rehearse rollback after target writes, including demonstrated reverse synchronization or another write-preserving mechanism.
11. Compare recovered state, pending jobs, credentials, provider subscriptions, and audit evidence against the agreed recovery contract.
12. Retire legacy APIs only after supported callers migrate or receive an explicitly accepted compatibility contract.

Record counts alone cannot establish data preservation.
An existing Twenty upgrade's `down` method does not establish a working Convex rollback.
Unknown reverse mappings, unreconciled writes, or untested provider effects block cutover.

## Existing checks and their limits

These are inspected source facts, not test results.

| Evidence | Existing capability or gap |
| --- | --- |
| [Server integration configuration](../../packages/twenty-server/jest-integration.config.ts) | Billing requires `IS_BILLING_ENABLED=true`; audit requires `CLICKHOUSE_URL`. Default integration excludes secure-deployment tests. |
| [Secure configuration](../../packages/twenty-server/jest-integration-secure.config.ts), [cookie tests](../../packages/twenty-server/test/integration/secure-deployment/suites/secure-session-cookie.integration-spec.ts) | Separate tests cover secure cookies, CSRF, downgrade rejection, authentication, and sign-out. |
| [Record permissions](../../packages/twenty-server/test/integration/graphql/suites/object-records-permissions), [settings permissions](../../packages/twenty-server/test/integration/graphql/suites/settings-permissions) | Existing tests cover fine-grained, relationship, inherited, sharing, bulk, destructive, and settings authorization. |
| [REST permissions](../../packages/twenty-server/test/integration/rest/suites/field-permissions.integration-spec.ts) | Externally consumed permissions need separate verification from UI behavior. |
| [Microsoft renewal tests](../../packages/twenty-server/test/integration/microsoft/webhook/renewal-auth-failure.integration-spec.ts) | Unusable refresh tokens expire channels and stop repeated cron selection in the declared scenarios. |
| [Browser configuration](../../packages/twenty-e2e-testing/playwright.config.ts), [journeys](../../packages/twenty-e2e-testing/tests) | Desktop Chrome is enabled. WebKit and mobile projects are commented. |
| [Frontend CI](../../.github/workflows/ci-front.yaml) | Unit, build, translation, and Storybook checks exist. Coverage aggregation and enforcement are commented. |
| [UI CI](../../.github/workflows/ci-ui.yaml), [UI targets](../../packages/twenty-ui/package.json) | Package exports, generated tokens, unit tests, Storybook, and size checks exist. |
| [Accessibility parameters](../../packages/twenty-ui/src/testing/a11yParameters.ts) | The contrast-deferral preset disables contrast checks; it cannot establish complete accessibility. |
| [Locales](../../packages/twenty-shared/src/translations/constants/AppLocales.ts) | Preserve declared locales, including pseudo-locale, Chinese variants, Arabic, and Hebrew. |
| [Upgrade contract](../../packages/twenty-server/docs/UPGRADE_COMMANDS.md), [cross-version CI](../../.github/workflows/ci-cross-version-upgrade.yaml) | Twenty upgrades distinguish instance/workspace and fast/slow changes. They do not verify PostgreSQL-to-Convex migration. |
| [Health controller](../../packages/twenty-server/src/engine/core-modules/health/controllers/health.controller.ts) | `health.check([])` does not demonstrate downstream readiness. |
| [Installation performance test](../../packages/twenty-server/test/integration/metadata/suites/application/logic-function-install-performance.integration-spec.ts) | A focused performance check exists. This inspection established no general migrated-product latency baseline. |
| [Workflow experiment](../../experiments/cloudflare-workflows/package.json), [development workflow](../agents/development-workflow.md) | Experiment checks do not establish production frontend or Convex migration parity. |

## Scoped verification commands

Run these only after preparing the required package dependencies and fixtures.
All commands below are proposed and unrun for this criteria map.
Replace `<test-path>` with the specific contract's test file.

```bash
# Repository root. Refresh generated shared output after branch or shared-source changes.
bunx vite-plus run twenty-shared#build --no-cache

# Repository root. Run the selected legacy test.
bunx jest <test-path> --config=packages/twenty-server/jest.config.mjs
bun run --cwd packages/twenty-front test:command <test-path>
bunx vitest run --root packages/twenty-ui --project unit <test-path>

# Affected package directory. Bypass cached typecheck results.
bunx tsgo -p tsconfig.json --noEmit

# packages/twenty-server. Requires the built repository lint plugin.
bunx oxlint --type-aware -c .oxlintrc.json src/ test/
bunx oxfmt --check src/ test/

# packages/twenty-front. Requires the built repository lint plugin.
bunx oxlint --type-aware -c .oxlintrc.json src/
bunx oxfmt --check src/

# Repository root. Use a disposable configured integration environment.
bunx vite-plus run twenty-server#test:integration
bunx vite-plus run twenty-server#test:integration:secure

# packages/twenty-e2e-testing. Requires .env and the running application.
bunx playwright test --project=chrome

# experiments/cloudflare-workflows.
bun run check
```

Integration setup and test actions mutate data; use an isolated disposable environment.
The experiment's `bun run verify:remote` creates synthetic Cloudflare workflow instances and requires applicable provider authorization.
Inspect package scripts before running them if they invoke external package runners.
The direct lint and browser commands above avoid those wrappers.
Do not claim a command works merely because its target exists.

## Release blockers

Unexplained data differences, authorization leaks, broken supported consumers, and missing provider recovery block release.
Missing baseline artifacts, unresolved required contracts, and absent independent review also block release.
Untested rollback after target writes blocks cutover.
Passing compilation, a health endpoint, legacy upgrade tests, or the isolated workflow experiment cannot waive these blockers.
