# Local acceptance evidence

**At a glance**

Issue #37 needs executed proof-tooling checks before future formal work.
A fresh isolated toolchain built the example and rejected both negative controls on macOS arm64.
Production contracts and other testing layers remain outside this evidence.

Observed on 2026-10-01, with Bun 1.4.3.
Base revision: `e27af5f54404d92e4f7958c3b89a083b905251f5`, plus this issue's files.
The checkout also contained unrelated changes, excluded from this commit.

Commands, from `experiments/lean-smoke`:

```sh
bun run bootstrap
bun run test
```

Bootstrap started without `.tooling` or `.lake` directories and downloaded the pinned release.
The full isolated smoke suite produced:

```text
Lake version 5.0.0-6caaee8 (Lean version 4.19.0)
Lean (version 4.19.0, arm64-apple-darwin23.6.0, commit 6caaee842e94, Release)
Build completed successfully.
'Smoke.appendEmpty' does not depend on any axioms
fixtures/Broken.lean:2:2: error: tactic 'rfl' failed, the left-hand side
fixtures/Admitted.lean:1:8: error: declaration uses 'sorry'
Build completed successfully.
```

Both controls returned exit code 1; the suite returned exit code 0.
Earlier development builds exposed an incorrect theorem invocation and a library theorem's `propext` dependency.
The final example uses direct induction, and its empty axiom report was verified.

An independent reviewer repeated bootstrap and the full suite in a fresh temporary copy.
Both standards and specification reviews reported zero actionable findings.
`ELAN_TOOLCHAIN=deliberately-invalid bun run test` also passed, confirming the project pin overrides inherited settings.

Raw outputs live in `artifacts/*.log`; `artifacts/report.json` includes source hashes and each command's exit code.
CI is configured for a fresh Ubuntu 24.04 runner; hosted execution has not been observed.
The unrelated application suites were not run for this isolated tooling change.
