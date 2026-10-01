# S2 sign-in, workspace entry and sign-out (fpcMotif/fenforce#3)

Contracts: S2; BE-08; AC-02, AC-03, AC-07. Scope: email and password only, the method the S0 baseline used (`../s0-company-journey/fixture.json`).
SSO, MFA, other providers, invitations and password changes are not covered.
No catalog entry is marked verified. Nothing here ran against a deployed Convex preview or a browser.

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

Failing run before the fixes: `sessionLifecycle.test.ts` 6 of 7 failed. The assertions that failed: `companies.listDemo` accepted for anonymous; `workspaces.listMine` accepted after sign-out; the same user's second session got `FORBIDDEN`; a forged session id, a subject without a session part, and an expired session were all accepted.
Front test failed first with `Cannot find module '../ClearQueryCacheOnUnmount'`.

## Acceptance criteria

| Criterion | Status | Evidence |
| --- | --- | --- |
| Baseline contract frozen before editing | Partial. The table is read from source, was written after the candidate had already been inspected, and is not backed by a recorded baseline artifact for the session, expiry and sign-out rows. | table above |
| Permitted user signs in, opens workspace, refreshes a protected URL, signs out | Partial. Sign in, workspace entry and sign out are covered in-process (`companyJourney.test.ts`, `sessionLifecycle.test.ts`). Refresh of `/objects/companies` is not run in a browser; by source the router reads `window.location` and the `Authenticated` gate shows the loading page while the stored token is restored. | `raw/convex-check.txt` |
| Anonymous cannot read workspace or company data | Met in-process for every public query and the write mutations that exist | `sessionLifecycle.test.ts` "anonymous callers" |
| Expired or invalid sessions give the recovery state without data | Backend met in-process (expired, forged, no session part). The rendered state is not observed. By source, a rejected query reaches the error boundary ("Unable to load Fenforce", Reload); Reload then fails the token refresh because sign-out and expiry remove the refresh token, and the sign-in form shows. | `sessionLifecycle.test.ts` "invalid and expired sessions" |
| Sign out clears client state and ends later authenticated reads | Backend met in-process after a real `signIn` with an injected identity; not validated by a deployed auth layer. Query cache cleared in a unit test. The sessionStorage and cross-tab behavior of the baseline has no counterpart here and was not checked. | `sessionLifecycle.test.ts` "sign-out", `ClearQueryCacheOnUnmountEffect.test.tsx` |
| Real preview identity boundary, translated errors, accessible controls | Not run. See below. | none |
| Revisions, fixtures, commands, results | This file, `raw/`, commit named in the hand-off | `raw/` |
| Independent review | Not obtained. | none |

## Differences from the baseline that are not accepted by anyone

- No idle timeout. Baseline rejects a session idle past `SESSION_IDLE_TIMEOUT`. Convex Auth expires an inactive session at its next refresh (library default 30 days), not per request. Query-time expiry uses `Date.now()`, which is fixed per execution, so an already-open subscription does not re-run at the expiry moment.
- One sign-in per client replaces that client's previous session (library behavior). Baseline keeps several.
- Failed sign-in shows one generic message for every cause; the baseline's per-cause messages were not compared.
- Errors in the preview are English only (`en`, empty catalogs). Translated errors are not met.

## Not run

- Sign in against a deployed Convex preview. Needs deployment credentials and preview allowlist values that were not used here. The schema rename needs a data decision before deploying: documents written with `tokenIdentifier` or `createdByTokenIdentifier` no longer validate. No data from the existing preview was inspected.
- Any browser step, screenshot, keyboard or screen-reader check (AC-09), and the paired Twenty replay.
- JWT validation by the deployed Convex auth layer, including an invalid or tampered token. The tests inject identities with `withIdentity` after a real in-process `signIn`.
- Sign out while a subscription is open, and two tabs.
- `bun docs/migration/check-map.mjs` (red since S0 for an unrelated dead link, F4).
- The full front jest suite and the rest of the repository's checks.

## Commands and results

`raw/convex-check.txt`: `bun run check` in `deployments/convex`, exit 0, 19 tests.
`raw/front-checks.txt`: preview jest (1 test), oxlint, oxfmt, and the front typecheck. The typecheck still reports the same 8 errors as S0 (7 in legacy settings files, 1 `expectedRevision` in `CompaniesWorkspace.tsx`, S0 finding F5). None is new and none was fixed here; F5 belongs to ticket 7.

Fixtures are synthetic: users and sessions are created per test, emails use `example.test`, the invite code and password are throwaway strings in the test files, and the signing key pair is generated per run.

## Next smallest task

Deploy the renamed schema to a throwaway Convex preview, sign in through the real form with the allowlisted account, and capture the refresh, expired-session and sign-out states with screenshots. That needs the owner's deployment authorization and a decision on existing preview data.
