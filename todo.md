# Agent workflow setup

## Feature and criteria maps

- [x] Read the Principles section of the poteto-mode skill.
- [x] Phase A: Frame
- [x] Phase B: Design the workflow
- [x] Phase C: Run the loop
- [x] Inventory frontend, backend, settings, flags, integrations, and verification sources.
- [x] Write source-linked feature maps and acceptance criteria.
- [x] Add a rerunnable coverage and traceability check.
- [x] Phase D: Keep the audit trail
- [x] Phase E: Verify and hand back

Throughput checkpoint: three agents investigated frontend, backend, and verification, then wrote separately owned map files.
The coordinator owns the overview, catalog, checker, and integration; an independent reviewer checks the result.
Done means every entry in five declared enum catalogs has a feature group and inherited acceptance criteria.
The catalogs cover routes, settings, flags, workflow actions, and core objects; grouped maps cover further source areas.
Coverage of source entries does not establish runtime parity; all migrated feature statuses start unverified.
This task produces maps and verification rules, not the application migration.

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
- [x] Phase E: Verify and hand back

## Research fan-out

- [x] Frame
- [x] Fan out
- [x] Aggregate
- [x] Report

Done means project-local agent roles have explicit ownership and checks, and supported Effect tooling produces observed diagnostics.
The migration remains planned until a working vertical slice proves the new stack.
Throughput checkpoint: two read-only researchers inspect agent configuration and Effect tooling independently; the coordinator owns all edits.
