# Lean smoke checks

**At a glance**

Formal tooling needs an executable readiness check before future proof work.
This isolated example pins Lean and Lake, checks a complete proof, and rejects two negative controls.
CRM behavior and existing application test suites remain unchanged.

## Bootstrap and check

Prerequisites: Bun 1.4.3, Git, tar, internet access, and macOS arm64 or Ubuntu Linux x64.
No root dependency installation is required.

1. Enter `experiments/lean-smoke` from a clean checkout.
2. Run `bun run bootstrap` to install isolated Elan 4.1.2 and Lean 4.19.0 with its bundled Lake.
3. Run `bun run test` to rebuild, inspect axioms, reject negative controls, and finish with a passing build.
4. Inspect `artifacts/report.json` and the individual command logs.

Bootstrap verifies the pinned Elan archive's SHA-256 before extraction.
Elan installs beneath `.tooling/elan`, without changing shell profiles or the user's default toolchain.
Lean's exact release is selected by `lean-toolchain`; Lake ships with that release.
Each bootstrap subprocess has a ten-minute limit; each checking subprocess has a two-minute limit.
The CI job has a fifteen-minute limit and starts without toolchain or build caches.

## Proof and controls

`Smoke.appendEmpty` states that appending an empty list preserves a finite list of natural numbers.
Its universally quantified input has no additional hypotheses.
The proof uses structural induction and equality congruence; no external proof library is installed.
`Assumptions.lean` prints its transitive axioms, and the runner requires an empty axiom set.
Lean's kernel and the downloaded toolchain remain trusted components.

`fixtures/Broken.lean` incorrectly proves zero equals one using reflexivity.
The runner requires a nonzero exit and the expected failed-reflexivity diagnostic.
`fixtures/Admitted.lean` uses `sorry`; warnings-as-errors must reject it.
Process errors, signals, timeouts, and unrelated compiler errors do not satisfy a negative control.
The fixtures are outside the normal Lake build target.
The final normal build must succeed after both controls fail as expected.

## Evidence boundary

`artifacts/report.json` records the revision, platform, Bun version, toolchain, commands, exit codes, and overall result.
Logs include Lean and Lake versions, the axiom report, and both negative diagnostics.
GitHub Actions uploads these files and the bootstrap log as `lean-smoke`, including failed runs.
Generated toolchains, build output, and run artifacts are ignored.

This checks tooling readiness and a synthetic list theorem only.
It establishes no CRM theorem, model-to-code correspondence, browser behavior, or provider guarantee.
Issue #14's remaining test layers and all-journey gates are separate work.

Lake's configuration and bundled distribution follow the [official Lake reference](https://lean-lang.org/doc/reference/latest/Build-Tools-and-Distribution/Lake/).
