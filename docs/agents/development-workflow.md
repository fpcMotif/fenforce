# Fenforce development workflow

## At a glance

Fenforce still contains Twenty's Apollo and React Router application; the new stack exists only as an isolated workflow experiment.
Project subagent roles divide investigation, implementation, and independent verification for each bug, feature, or migration slice.
The existing application remains the behavior baseline until each replacement passes its acceptance checks.

## Coordinator and roles

The main chat coordinates work and owns integration.
The project config is `.codex/config.toml`; role instructions live in `.codex/roles/`.
Models inherit the operator's current selection.
The configured concurrency limit is four; nested delegation is disabled.

| Role | Assigned output | Completion evidence |
| --- | --- | --- |
| investigator | Reproduction, callers, affected contracts | Exact paths, inputs, and observed results |
| frontend | One route or UI change | Types, lint, relevant tests, and browser inspection |
| backend_effect | One backend or workflow change | Boundary, authorization, retry, and persistence tests |
| reviewer | Independent verdict on the exact diff | Reproduced checks and actionable findings |

Custom role discovery depends on the Codex host and when it loads project configuration.
If the active spawning tool lacks a role selector, the coordinator passes the role instructions explicitly.
That fallback does not prove native custom-role discovery.
These roles run when assigned; they are not scheduled background workers.

## Work contract

Each assignment names the goal, base revision, checkout, owned paths, exclusions, acceptance checks, and required evidence.
It also identifies the domain types and external inputs before implementation begins.
The coordinator owns package manifests, lockfiles, schemas, generated clients, shared configuration, and integration.
Transfer ownership explicitly when a task needs one of those files.

Read-only investigations may run together.
Concurrent writers use separate managed worktrees or run sequentially in one checkout.
Different file ownership alone does not isolate installs, generated output, or Git operations.
The reviewer checks the integrated revision after the workers finish.
Record concrete decisions and evidence in the task's decision trail.

1. Capture current behavior and define a falsifiable acceptance check.
2. Use the investigator when the cause or affected callers are unknown.
3. Freeze the slice's input, output, failure, and authorization contract.
4. Assign only independent work in parallel.
5. For a bug, observe a failing behavioral test before implementing the fix.
6. Integrate the smallest complete change and run its required checks.
7. Have the reviewer inspect the exact result and independently verify critical claims.
8. Fix findings or record a concrete reason they do not apply.
9. Report the verified outcome and any remaining limitation.

Do not lower quality thresholds to finish a task.
Do not create interfaces, wrappers, or service layers without a concrete caller and a useful boundary.
Do not touch unrelated dirty files or claim a passing test proves an untested deployment.
Deployments require the user's applicable authorization. No role grants itself new external permissions.

## Target stack and runtime ownership

These are migration targets, not claims about the existing Twenty application.

| Concern | Target owner |
| --- | --- |
| Frontend hosting | Cloudflare |
| Routes and navigation | TanStack Router |
| Server data in the UI | TanStack Query with `@convex-dev/react-query` |
| Persistent application data and authorization | Convex |
| Typed domain operations and external service composition | Effect v4 |
| Durable execution experiment | Cloudflare Workflows; no automatic M1 adoption |
| Later comparison experiments | Temporal and Convex Workflow |

The official Convex adapter provides reactive subscriptions and remains documented as beta.
Use Convex's native React hooks when the adapter lacks a required capability.
Test subscription lifecycle, reconnect behavior, pagination, and authentication before migrating a route.
See [Convex's adapter documentation](https://docs.convex.dev/client/tanstack/tanstack-query/).

Effect does not replace Convex's transactions or the durable workflow engine.
Keep pure domain logic separate from framework entry points.
Use Convex validators for registered functions and Effect Schema where external integrations need decoding.
Avoid validating the same trusted internal value repeatedly.
Queries and mutations must respect Convex's deterministic runtime; external network calls belong in actions.
Do not retain a Convex request context in a long-lived Effect service.
Return serializable results at framework boundaries, not Effect values or runtime objects.
See [Convex runtime constraints](https://docs.convex.dev/functions/runtimes).

## Migration sequence

Use the [feature, criteria, and critical-path maps](../migration/README.md) when selecting and reviewing migration slices.
Every assignment names its feature IDs and applicable acceptance gates.
The source coverage checker detects catalog drift; it does not establish runtime parity.

M1 starts with the [Salesforce pilot contract](../migration/m1-contract.md) and [roadmap #1](https://github.com/fpcMotif/fenforce/issues/1). Company identity and Account contracts precede dependent CRM slices; native Feishu owns the selected human approval.
The existing workflow experiment supplies technology evidence only. Its fields, approver policy and engine do not establish production requirements.
The table below is a broader migration reference, not the M1 execution order.

| Unit | Deliverable | Acceptance check |
| --- | --- | --- |
| Baseline | Selected Twenty flow and dependency inventory | Reproducible behavior and screenshots where UI exists |
| Shell | Isolated TanStack route hosted on Cloudflare | Build, direct navigation, refresh, and error states work |
| Data and identity | Convex model, indexes, auth, and reactive query | Unauthorized and cross-workspace access fail; live updates work |
| Approval slice | Submit, view, approve or reject, and audit history | Correct actor and state transitions; duplicate decisions cannot repeat effects |
| Durable integration | Convex decision connected to Cloudflare workflow | Lost acknowledgements, retries, timeouts, and reconciliation are tested |
| Operational gate | Preview, observability, rollback, and data migration rehearsal | Real sign-in and end-to-end run on the intended providers |
| Route migration | One selected Twenty route at a time | Preserved behavior and removal of that route's unused legacy consumers |

Choose an isolated application directory only after inspecting the selected UI dependencies.
Do not mechanically replace every Apollo call or React Router import across Twenty.
Do not delete legacy APIs until their consumers have migrated.
Treat Effect release candidates and adapter upgrades as explicit, tested version changes.

## Existing quality gate

Run `bun run check` inside `experiments/cloudflare-workflows` for the experiment.
That gate combines Varlock, TypeScript, strict type-aware Oxlint, Oxfmt, and Fallow.
It also runs Effect-specific diagnostics and a negative/positive compiler canary.
The experiment uses the native `@effect/tsgo` integration for TypeScript 7 and Effect v4.
Its isolated `fenforce.code-workspace` selects the patched workspace compiler for supported editors.
See [Effect's tooling guide](https://effect.website/docs/v4/getting-started/devtools).
Cyclomatic and cognitive complexity limits are both ten.
Keep the existing Twenty package checks for changes to legacy packages.
Use each package's declared package manager. Changes to the root lockfile belong to its assigned owner.
Live workflow regression uses `bun run verify:remote` and creates synthetic workflow instances.
Passing that experiment does not prove the frontend or Convex migration is complete.
