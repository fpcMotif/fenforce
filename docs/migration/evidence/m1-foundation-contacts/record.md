# M1 Account foundation and Contacts candidate

## At a glance

The Account foundation (#3–#11, gated by #13) and the Contacts slice (#46) are ready for independent review.
Both passed every local check and two full browser replays at the exact revisions below.
Production identity (B03), production workload budgets (B05), the Salesforce field inventory (B02), and Chinese interface text remain unverified.

## Revisions and environment

| Candidate | Revision | Closes |
| --- | --- | --- |
| Account foundation | `8e53737df2fe` | #3–#11, #13 |
| Contacts, stacked on the foundation | `df778654c71d` | #46 |

Runtime: Bun 1.4.3, local anonymous Convex, Chrome, and the simulated OIDC provider.
The frontend ran on port 3017 against the same local Convex deployment.
No company provider or customer data was used.
Data was not reset between runs, so the replays passed on accumulated fixtures.

The user authorized simulated identity for this chain on 2026-10-06.
That authorization covers this local acceptance, not production sign-in.

## Executed checks

| Check | Revision | Result |
| --- | --- | --- |
| Backend typecheck, type-aware lint, formatting, Effect diagnostics | `8e53737df2fe` | Pass |
| Backend `bun run test` | `8e53737df2fe` | Pass: 141 tests |
| Frontend `bun run check:convex-preview` | `8e53737df2fe` | Pass: 49 tests, types, lint, formatting, strict message compilation |
| Backend typecheck, lint, formatting, Effect diagnostics, tests | `df778654c71d` | Pass: 183 tests |
| Frontend `bun run check:convex-preview` | `df778654c71d` | Pass: 76 tests |
| Frontend `bunx tsgo -p tsconfig.json --noEmit` | `df778654c71d` | Pass |
| M1 browser suite, `playwright.m1.config.ts`, run 1 | `df778654c71d` | Pass: 30 of 30 |
| M1 browser suite, run 2 | `df778654c71d` | Pass: 30 of 30 |

The full frontend typecheck was not run at `8e53737df2fe`.
That workspace lacked the unrelated SDK and component-renderer builds; the preview typecheck passed there.
The browser suite ran at the Contacts revision, which contains the foundation unchanged below it.

## Browser coverage

| #13 area | Replays |
| --- | --- |
| Identity | Invited sign-in, protected refresh, sign-out; uninvited subject recovers |
| Isolation and revocation | Foreign detail links rejected; revoked employee loses an open record and list; retained token rejected |
| Lifecycle | Trash and restore keep identity, fields, and audit; open views follow; concurrent trash and restore accept exactly one each |
| Queries | 1,000-account benchmark; search, filters, sort, pagination, and saved views match backend traversal; owner filter and shared views by role |
| Realtime | Lost acknowledgement writes once; stale edit rejected; 8-second outage completes a pending edit once |
| Usability | Keyboard-only create, edit, trash, and list controls; zh-CN browser locale without overflow |

Contacts replays cover create, link, edit, and refresh; relation guards through direct backend calls; lost create acknowledgement; stale and concurrent relinks; seller-scoped search; Account trash hiding its Contacts; offboarded attribution; keyboard-only create; and a 3,000-Contact workload.

## Measurements

All values are local measurements on a development deployment, not production budgets.

| Measurement | Run 1 | Run 2 | Target |
| --- | --- | --- | --- |
| Account query warm p95, 1,000 Accounts | 61.8 ms | 24.3 ms | ≤ 500 ms |
| Contact query warm p95, 3,000 Contacts | 27.9 ms | 23.7 ms | Same limits as Accounts |
| Most rows scanned per Account page | 36 | 36 | ≤ 100 |
| Most rows scanned per Contact page | 29 | 29 | ≤ 100 |
| Edit acknowledgement p95, 20 saves | 62.9 ms | 91.1 ms | ≤ 1,000 ms |
| Revocation clears open record and list | 153 ms | 226 ms | ≤ 5,000 ms |

## Known limits

| Limit | Disposition |
| --- | --- |
| Identity uses the simulated OIDC provider | Real provider evidence moves to #55 with B03 |
| Latency comes from a local deployment and 20 edit samples | Production budgets move to #55 with B05 |
| Only an English catalog exists | Chinese and pseudo-locale browser checks move to #14 |
| A socket that dies silently is detected after up to 60 seconds | The session gate fails closed meanwhile; accepted for M1 under #11 |
| No restricted Account field exists in the synthetic contract | Field-level hidden-field tests wait for the B03 access matrix |
| Accounts have no stored source ID | Account import identity moves to #54; Contacts carry an indexed source ID |
| Malformed link handling matches development error text | Production deployments may redact it and show the generic error state |
| Benchmark fixtures keep old Accounts on the local deployment | Only memberships are removed; storage grows per run |

## Review and boundaries

Separate agent reviewers reproduced the checks, probed authorization, and confirmed each finding before its fix.
They found and the candidate fixes a forged-cursor read across sellers and a 50-workspace limit in the workspace gate.
The user is the independent reviewer for #13 and #46; the agent reviews are supporting evidence.

Videos, `results.json`, and run logs are kept outside the repository by the user under `fenforce-evidence/m1-foundation-contacts/2026-10-07/`.
This record covers the Account foundation and Contacts only.
It does not establish production sign-in, Salesforce import, approvals, or pilot readiness.
