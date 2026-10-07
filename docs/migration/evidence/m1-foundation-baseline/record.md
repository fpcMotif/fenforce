# M1 Account foundation baseline

## At a glance

The candidate supports company editing, but lacks the synthetic M1 identity and Account policies.
This replay identifies working behavior and implementation gaps before the foundation changes.
The legacy application and production providers remain unchanged.

## Revisions and environment

Candidate: `b184c0905c21a0f87e8830c42d41a23c7f5c18ca`.
Backend workspace: `fenforce.m1-baseline`, based on that exact revision.
Frontend build: the primary checkout at the same revision, before integration.
Runtime: Bun 1.4.3, local anonymous Convex, Chromium, and synthetic credentials.
The local backend used ports 3210 and 3211. The built frontend used port 3018.
No company provider or customer data was used.

The user authorized realistic simulated identity for this prerequisite chain on 2026-10-06.
That authorization replaces live-provider evidence for this local exercise, not production acceptance.

## Executed checks

| Check | Observed result |
| --- | --- |
| `bun docs/migration/check-map.mjs` | Pass: 204 mapped declarations; zero runtime-verification claims |
| Backend `bun run check` | Pass: 78 tests across seven files, types, Effect diagnostics, lint, formatting |
| Frontend `bun run check:convex-preview` | Pass: four tests, types, type-aware lint, formatting, message compilation |
| `bunx vite-plus run --no-cache twenty-shared#build` | Pass |
| `bunx vite-plus run --no-cache twenty-ui#build` | Pass |
| Frontend `bun run build:convex` with the local backend URL | Pass |
| Local Convex function push | Pass, including workflow components |
| Browser enrollment and workspace entry | Pass through the existing password provider |
| Browser create, edit, protected refresh | Pass; revised name persisted after refresh |
| Browser logout and protected deep link | Pass; sign-in displayed without record content |

The browser result and video accompany this record.
The backend tests exercise registered functions through `convex-test`.
The browser separately exercises deployed token validation and persisted records.

## Failures and disposition

| Finding | Evidence | Disposition |
| --- | --- | --- |
| Fresh workspaces lacked dependencies | Initial TS2688 missing Node types | Resolved by frozen dependency installation; no source defect |
| Development entry rendered a blank page | Vite could not load `/src/convex.tsx` under its `convex` root | Repair in #3; production build worked |
| Local token discovery used the system proxy | `AuthProviderDiscoveryFailed`, proxy returned 503 for loopback discovery | Restart local backend without proxy variables; authentication then passed |
| Password invitation differs from selected subject invitation | Existing auth validates email and invitation code | #3 adds simulated OIDC and exact tenant/subject enrollment |
| Workspace selection is local component state | Existing `WorkspaceGate` has no route-bound workspace selection | #4 |
| Historical attribution depends on membership records | Company projections read creator and owner memberships | #5 must preserve inactive actors |
| Nullable owner, 255-character name, absent industry | Existing schema, normalizer, and create operation | #7 |
| Any workspace member can read every company | Existing list and get only check membership | #8 |
| Soft delete has no restore operation | Existing registered operation exports | #9 |
| List supports only name ordering | Existing workspace/deleted/name index | #10 |
| Stale revision rejection already works | Registered two-writer test retains the acknowledged edit | Preserve in #11 |
| Create has no replay identity | Existing create arguments | #11 |

## Retained Twenty comparison

The previous Twenty browser baseline is retained under `../s0-company-journey/`.
Its source and session comparison is recorded in `../s2-sign-in-journey/record.md`.
The fresh legacy attempt used isolated Compose project `fenforce-m1-baseline` on 2026-10-06.
PostgreSQL 16 and Redis 7 started and passed their health checks.
The uncached `twenty-server#build` and `database:init:command` completed successfully.
The synthetic development seed then failed before browser enrollment.
It requires `dist/assets/engine/core-modules/application/application-package/constants/seed-dependencies/yarn.lock`, which the build did not provide.
`workspace:seed:dev` logged `ENOENT` despite exiting zero; that exit code is not a passing seed.
Legacy source matches the baseline revision; later integration changed only the isolated Convex surface and its evidence.
No legacy application fix was made during this verification-only baseline.
This establishes fresh Convex behavior and a reproducible legacy startup defect, not a fresh paired legacy journey.
The synthetic M1 contract governs intended identity, ownership, lifecycle, and field changes.

## Review and boundaries

A separate investigator reproduced the backend checks and verified the candidate ancestry.
The coordinator exercised and visually inspected the browser journey.
Independent integrated acceptance remains #13.
This baseline does not establish production sign-in, authorization parity, or pilot readiness.
