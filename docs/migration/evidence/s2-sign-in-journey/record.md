# S2 sign-in, workspace entry and sign-out (fpcMotif/fenforce#3)

Contracts: S2; BE-08; AC-02, AC-03, AC-07. Scope: email and password only, the method the S0 baseline used (`../s0-company-journey/fixture.json`).
SSO, MFA, other providers, invitations and password changes are not covered.
No catalog entry is marked verified. Full baseline parity remains incomplete.

## At a glance

Route errors bypassed the recovery screen, retained protected query data, and hid sign-out.
The preview now clears that cache, offers session recovery, and submits the company revision captured when editing began.
Existing deployments and unrelated working-tree changes remain untouched.

The October 1 follow-up starts from `1790e94c7f5313b4ce4d71b4c00e176f8b56fe59`; frontend fixes remain uncommitted.
The user selected a new empty disposable preview instead of migrating existing records.
Convex created `resilient-bulldog-351`, with reference `franklin-fan:fenforce:preview/s2-session-review-20261001` and a three-day expiry.
`convex data` confirmed no tables before deployment.
The schema and functions deployed successfully without touching the original preview.
The browser ran the local frontend at `http://127.0.0.1:3017` against that deployed backend.

## Frozen baseline contract (Twenty, upstream `a431f9afb6`, fork `1bf3ec682f`)

Read from source, not re-run in this ticket. S0 ran the sign-in step against a live Twenty (`../s0-company-journey/raw/twenty-baseline.json`).

| Step | Baseline behavior | Source |
| --- | --- | --- |
| Sign in | `getLoginTokenFromCredentials(email, password)` returns a login token (15 min), then `getAuthTokensFromLoginToken` returns access (30 min) and refresh (60 d) tokens and starts a stored user session. | `twenty-config/config-variables.ts` (`*_EXPIRES_IN`), `useAuth.ts` `handleCredentialsSignInInWorkspace` |
| Each request | The session is looked up on every request. A revoked, expired or idle-timed-out session is rejected as unauthenticated. | `access-token.service.ts` `validateSessionToken`, `user-session.service.ts` `resolveSession`, `isSessionActive` |
| Sign out | `signOut` revokes the session (reason `UserSignOut`) and the presented refresh token. Revocation is immediate for later requests. | `auth.resolver.ts` `signOut`, `user-session.service.ts` `signOut` |
| Client after sign out | The client clears session storage, auth state, current user and workspace, then navigates to `/welcome`. A failed server call is swallowed and the client still clears. Other tabs are told. | `useAuth.ts` `clearSession`, `handleSignOut` |
| Anonymous | No token or cookie is rejected before any workspace data is read. | `access-token.service.ts` `validateTokenByRequest` |

## Findings on the candidate and their fixes

| ID | Finding (observed by a failing test before the fix) | Fix |
| --- | --- | --- |
| G1 | `companies.listDemo` returned demo company rows to an anonymous caller. | Requires a session. |
| G2 | A token kept working after sign-out. Convex Auth tokens are stateless and `signOut` only deletes the stored session, so reads and writes with the old token were accepted. | `requireSession` loads the stored session on every call and rejects a missing, mismatched or expired one with `UNAUTHENTICATED`. |
| G3 | Workspace membership was keyed by `tokenIdentifier`, which contains the session id. A user who signed in again got a new session, lost their workspace, and the old session's membership stayed behind. Found because the same-user second-session test returned `FORBIDDEN`. The S0 journey never read back across two sessions. | Membership and workspace creator are keyed by the stable `users` id. Schema fields and indexes were renamed (`userId`, `by_userId`, `by_workspaceId_and_userId`, `createdByUserId`). |
| G4 | The query cache is a module singleton and survived sign-out. A different user on the same tab could see the previous user's cached results before the subscription refreshed. | `ClearQueryCacheOnUnmountEffect` clears it when the signed-in tree unmounts, which covers sign-out and a session that ends elsewhere. |
| G5 | TanStack catches route errors internally. Its default fallback hides recovery, while the cache-clearing sibling remains mounted. | `PreviewRouter` uses `PreviewError`, which clears the cache and offers sign-out. Authentication errors show session-specific recovery. The outer boundary sits inside `Authenticated`, keeping sign-in reachable. |
| G6 | Company edits omit required `expectedRevision` and fail validation. | The editor captures the revision when editing starts and submits it unchanged after subscription updates. |

Failing run before the fixes: `sessionLifecycle.test.ts` 6 of 7 failed. The assertions that failed: `companies.listDemo` accepted for anonymous; `workspaces.listMine` accepted after sign-out; the same user's second session got `FORBIDDEN`; a forged session id, a subject without a session part, and an expired session were all accepted.
Front test failed first with `Cannot find module '../ClearQueryCacheOnUnmount'`.

## Acceptance criteria

| Criterion | Status | Evidence |
| --- | --- | --- |
| Baseline contract frozen before editing | Partial. The table is read from source, was written after the candidate had already been inspected, and is not backed by a recorded baseline artifact for the session, expiry and sign-out rows. | table above |
| Permitted user signs in, opens workspace, refreshes a protected URL, signs out | Observed through the real form against the disposable backend. Protected list refresh and company editing succeeded. | `raw/follow-up-live.json`, `raw/workspace.jpg`, `raw/company.jpg`, `raw/signed-out.jpg` |
| Anonymous cannot read workspace or company data | All public queries and existing mutations covered in-process. Deployed anonymous workspace and demo-company queries rejected. | `sessionLifecycle.test.ts`, `raw/follow-up-live.json` |
| Expired or invalid sessions give the recovery state without data | Deployed tampered JWT rejected. Importing expired synthetic sessions invalidated open subscriptions. The browser hid company data and showed session recovery. Keyboard activation returned to sign-in. This does not test passive clock expiry. | `raw/expired.jpg`, `PreviewRouter.test.tsx`, `raw/follow-up-live.json` |
| Sign out clears client state and ends later authenticated reads | Retained JWT rejected by the deployed guard after sign-out. Another session remained usable. Two browser tabs returned to sign-in after one tab signed out. Cache clearing verified through the real router in Jest. | `raw/follow-up-live.json`, `PreviewRouter.test.tsx`, `ClearQueryCacheOnUnmountEffect.test.tsx` |
| Real preview identity boundary, translated errors, accessible controls | Real identity boundary verified. English keyboard sign-in and recovery exercised. Translation parity and full accessibility review remain incomplete. | `raw/follow-up-live.json`, browser observations |
| Revisions, fixtures, commands, results | This file, `raw/`, commit named in the hand-off | `raw/` |
| Independent review | A separate read-only reviewer reproduced the backend and frontend checks and reviewed the final changes. Model-diverse or human review remains unverified. | `raw/follow-up-review.txt` |

## Differences from the baseline that are not accepted by anyone

- No idle timeout. Baseline rejects a session idle past `SESSION_IDLE_TIMEOUT`. Convex Auth expires an inactive session at its next refresh (library default 30 days), not per request. Query-time expiry uses `Date.now()`, which is fixed per execution, so an already-open subscription does not re-run at the expiry moment.
- One sign-in per client replaces that client's previous session (library behavior). Baseline keeps several.
- Failed sign-in shows one generic message for every cause; the baseline's per-cause messages were not compared.
- Errors in the preview are English only (`en`, empty catalogs). Translated errors are not met.
- Convex Auth supplies cross-tab token synchronization through localStorage events. Two-tab sign-out was observed; baseline sessionStorage parity remains unverified.

## Not run

- Migration of existing preview documents. The renamed schema still rejects legacy fields; the selected empty preview avoids that migration.
- Paired Twenty replay, screen-reader testing, complete keyboard navigation, and translated-error checks.
- Passive clock expiry of an already-open subscription and per-request idle-timeout parity.
- The full front jest suite and the rest of the repository's checks.

## Commands and results

`raw/convex-check.txt`: `bun run check` in `deployments/convex`, exit 0, 19 tests.
`raw/front-checks.txt` records the original run, before the follow-up fixes.
Current preview Jest: three suites and three tests pass, including route recovery and revision retention.
Preview type-aware Oxlint and Oxfmt pass.
Direct frontend typechecking still fails with seven legacy settings errors; the preview's missing-revision error is fixed.
`bun docs/migration/check-map.mjs` fails because `criteria-map.md` links to removed `packages/twenty-ui/project.json`.
That file belongs to the unrelated build-tool changes already present in this checkout.

Regression evidence: the edit test failed because `expectedRevision` was absent.
Removing the router's recovery component made its test fail on the original "Something went wrong!" screen.
Restoring the fix passed both tests.

Deployment used `bun run typecheck`, then `convex deploy --codegen disable --typecheck disable` with a deployment-specific credential file.
Convex's built-in check expects `convex/tsconfig.json`, absent here; the package's root TypeScript check passed separately.
The initial JWKS upload contained escaped JSON. Publishing the raw JSON fixed discovery before live validation.
No deployment key, signing key, password, or token is included in evidence.

Fixtures are synthetic: users and sessions are created per test, emails use `example.test`, the invite code and password are throwaway strings in the test files, and the signing key pair is generated per run.

## Next smallest task

Resolve session-duration and idle-timeout parity, then verify translations and accessibility against a paired Twenty replay.
Issue #3 remains open. The disposable backend and local-browser checks do not establish production cutover readiness.
