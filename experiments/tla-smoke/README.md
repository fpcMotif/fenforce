# Native TLA+ smoke checks

**At a glance**

Issue #38 needs bounded model-checking evidence, and the user requires a Java-free implementation.
This experiment pins the Rust `tla-rs` checker and tests completion, counterexamples, model errors, limits, and timeout.
CRM contracts and existing application coverage remain unchanged.

## Tool choice

The user's Java-free instruction replaces #38's original Java/TLC installation requirement for this implementation.
`tla-rs` checks TLA+ specifications directly, supports TLC-style configuration, and publishes checksummed native binaries.
Its structured results distinguish completion from state and depth limits.
These capabilities fit this small readiness experiment.

| Candidate | Fit for this task |
| --- | --- |
| [tla-rs 0.11.1](https://github.com/fabracht/tla-rs/tree/v0.11.1) | Selected: native Rust releases, structured outcomes, explicit exploration limits. |
| [TLA++ 1.2.30](https://github.com/zoratu/tlaplusplus/tree/v1.2.30) | Rust alternative; its release has no prebuilt assets and requires a source build. |
| tla-rs WebAssembly | Same Rust engine; native binaries avoid adding a WASM host integration. |

This does not establish full TLC compatibility or comparative performance.
The checker implements a [documented subset](https://github.com/fabracht/tla-rs/blob/v0.11.1/TLA_SUPPORT.md) of TLA+.
Its default `Nat` and `Int` domains are bounded; this example uses explicit finite integer intervals instead.
No Java runtime, official TLC, or additional formal engine is installed or invoked.

## Clean bootstrap

Prerequisites: Bun 1.4.3, Git, internet access, and macOS arm64/x64 or Linux x64.
CI uses Ubuntu 24.04.

1. Enter `experiments/tla-smoke` from a clean checkout.
2. Run `bun install --frozen-lockfile` for the isolated TypeScript checking dependencies.
3. Run `bun run bootstrap` to download and SHA-256-verify the pinned native checker.
4. Run `bun run typecheck`.
5. Run `bun run test` for all six outcomes.
6. Run `bun run check` to confirm normal completion after the controls.

The binary stays under `.tooling/tla`; bootstrap does not modify shell profiles or system tools.
`toolchain.json` pins version 0.11.1 and each platform's published SHA-256 digest.
Every run verifies the binary digest before execution.
The experiment has its own manifest and lockfile; root dependencies are not required.

## Finite model and assumptions

`Counter.tla` starts `counter` at zero, increments below `Bound`, and resets at the bound.
`Counter.cfg` fixes `Bound = 3`, giving four reachable states and four transitions.
`TypeOK` requires `counter` to remain within `0..Bound`.
There are no state constraints, symmetry reductions, or simulation samples that remove reachable states.
The normal exploration limits are 100 states, depth 10, and 120 seconds.
Reaching a limit is incomplete evidence, never a successful check.

Deadlock checking is explicitly enabled in every configuration.
The reset transition keeps the normal model from deadlocking.
No fairness assumptions or liveness properties are asserted or checked.
The result applies only to this finite synthetic model and the pinned checker's semantics.
It proves neither production behavior nor correspondence between model and application code.

## Commands and outcomes

Run individual cases with `bun check.ts MODE`.
The wrapper preserves the raw checker exit code and maps results to these process exits:

| Mode | Expected exit | Outcome and control |
| --- | --- | --- |
| `positive` | 0 | Completed state space: four states, no invariant violation. |
| `negative` | 2 | `NeverTwo` fails with the trace `0 → 1 → 2`. |
| `model-error` | 3 | A string bound causes an invariant evaluation type error. |
| `resource-limit` | 4 | A two-state exploration budget stops before completion. |
| `depth-limit` | 4 | A depth budget of two stops before completion. |
| `timeout` | 5 | A ten-millisecond process deadline stops a billion-step finite counter. |
| Unexpected process/output failure | 6 | Missing binary, bad checksum, abnormal signal, or unrecognized result. |

`bun run negative` intentionally returns 2.
`bun run test` succeeds only when every case returns its expected result and required evidence.
Resource controls exercise exploration budgets; they do not deliberately exhaust host memory.
Timeout kills only the checker subprocess launched for that run.
An unrelated process failure cannot satisfy the negative-invariant control.

The positive run warns that `NeverTwo` is not selected as an invariant.
This is intentional: only `Negative.cfg` selects the deliberately false predicate.

## Artifacts and verification

Each run writes `artifacts/MODE/report.json`, `stdout.log`, and `stderr.log`.
Reports include exact commands, revision, source hashes, platform, versions, budgets, outcome, and raw exit status.
The negative report retains the structured counterexample with every state and action.
The CI job uploads run artifacts and `bootstrap.log`, including failed runs.
Generated tools and artifacts are ignored; [local evidence](evidence.md) records observed results.

Configured CI is separate from observed hosted execution.
Issue #14's remaining testing layers and CRM journeys are separate work.
