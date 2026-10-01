# Local acceptance evidence

**At a glance**

Issue #38 requires bounded model-checking evidence with failure controls.
The Java-free Rust checker completed the finite example and distinguished five intentionally failing runs.
These checks establish tooling readiness, without claims about CRM behavior or official TLC compatibility.

Observed on 2026-10-01, macOS arm64, with Bun 1.4.3.
The Bun test runner identifies its build as `1.4.3-canary.1 (9f70da074)`.
Base revision: `2652c165d57cdca7988a98eb758d122557ba20c9`, plus this issue's files.
The user's instruction superseded the ticket's Java/TLC runtime choice.

## Commands and results

Executed from `experiments/tla-smoke`:

```sh
bun install
bun run bootstrap
bun run typecheck
bun run test
bun run check
```

Bootstrap started without `.tooling` and reported:

```text
tla 0.11.1
SHA-256 verified: 11fbbca865e030fa0a6e0182ced339d911a9581ebe1f0e092834955b16f34d5a
```

The initial executable tests failed before the runner existed.
The completed runner produced these observed results:

| Case | Wrapper exit | Checker evidence |
| --- | --- | --- |
| Positive | 0 | `ok`; four states, four transitions. |
| Negative | 2 | `invariant_violation`; `NeverTwo`; trace `0 → 1 → 2`. |
| Model error | 3 | `invariant_error`; expected integer, received string. |
| State limit | 4 | `max_states_exceeded`; completion not claimed. |
| Depth limit | 4 | `max_depth_exceeded`; completion not claimed. |
| Timeout | 5 | `ETIMEDOUT`; child terminated with `SIGKILL`. |

All six integration tests passed; TypeScript checking passed.
The final positive run completed after all failure controls.
Type-aware Oxlint checked all three TypeScript files with zero diagnostics.
Independent standards and specification reviews reported zero actionable findings.
The specification reviewer repeated frozen installation, bootstrap, typechecking, all six tests, and final completion in a fresh Git checkout.
The state budget is checked after discovery, so its two-state limit reports three discovered states.
This remains classified as incomplete exploration.

Per-case JSON reports preserve raw exit codes, source hashes, commands, versions, and counterexample states.
They live beside captured stdout and stderr under `artifacts/`.
CI is configured for Ubuntu 24.04; hosted execution has not been observed.
Existing application suites and provider behavior were not tested by this isolated experiment.
