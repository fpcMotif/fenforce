# Agent workflow setup

- [x] Read the Principles section of the poteto-mode skill.
- [x] Phase A: Frame
- [x] Phase B: Design the workflow
- [x] Phase C: Run the loop
- [x] Configure project subagent roles and migration handoffs.
- [x] Verify Effect v4 compiler and standalone LSP diagnostics.
- [ ] Verify activation in an editor client.
  skip: editor settings are saved, but no editor client was launched. LSP diagnostics passed; shutdown lifecycle remains inconclusive.
- [x] Verify discovery, configuration, and existing quality checks.
- [x] Phase D: Keep the audit trail
- [ ] Phase E: Verify and hand back

## Research fan-out

- [x] Frame
- [x] Fan out
- [x] Aggregate
- [ ] Report

Done means project-local agent roles have explicit ownership and checks, and supported Effect tooling produces observed diagnostics.
The migration remains planned until a working vertical slice proves the new stack.
Throughput checkpoint: two read-only researchers inspect agent configuration and Effect tooling independently; the coordinator owns all edits.
