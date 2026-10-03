# M1 Salesforce pilot contract

Status: **blocked company discovery draft**, with a separate [user-authorized mock implementation contract](m1-mock-contract.md). Neither is production approval.
Ticket: [M1-00 #45](https://github.com/fpcMotif/fenforce/issues/45).
Execution plan: [M1 roadmap #1](https://github.com/fpcMotif/fenforce/issues/1).
Prepared on 2026-10-03 against `3e9a7bd278cdb330f3182e86ac21091c3b540876`.
The committed revision containing this file identifies this draft; acceptance must name an exact revision.

## Evidence boundary

The ticket and roadmap establish the intended scope and architecture constraints. They do not establish company Salesforce configuration or approve a real journey.
The user authorized a common-use mock on 2026-10-03; the linked mock supplies explicit synthetic choices and expected results for local work. It does not resolve company-evidence blockers below.
No authorized Salesforce configuration, usage samples, business-owner decisions, identity-provider configuration, Feishu namespace, or measured workloads were supplied with the ticket. Its comments were empty when inspected.
No additional systems were accessed. Repository source and the existing maps are implementation references only.
Raw exports, credentials, customer identifiers, screenshots and directory records belong in approved private storage. Public evidence must use sanitized references and synthetic fixtures; review references themselves for sensitive names or URLs.

For every evidence reference record: opaque reference ID, evidence type, source/configuration version and capture date, authorized collector, private custodian/access procedure, sanitization reviewer, and the requirements it supports. Do not publish private access tokens or raw hashes of customer identifiers.
Unavailable evidence stays `missing`; a proposed fixture cannot replace observed usage.

## Scope and architecture decisions

Salesforce usage defines M1 requirements. Twenty provides reusable behavior, field/view concepts, UI and regression fixtures. Full-platform Twenty parity is a separate program.
Use React/Vite+/TanStack/Convex, Twenty UI/Base UI and Lingui. Retain existing styling; StyleX, another router or test runner, and a universal runtime object engine are not M1 prerequisites.
Code-defined storage must share field semantics across forms, filters, queries, validation and exports. A stable field identity is independent of its display label and Salesforce/Feishu provider IDs; preserve explicit mappings through renames and imports.
The exact field identities and mappings remain blocked on source evidence. Do not infer them from Twenty field names.

Feishu owns routing of the selected native human approval. Fenforce owns request authorization, immutable submitted values and the final CRM operation. SAP remains authoritative for ERP data.
Salesforce remains the business-data writer until a separately authorized transfer of a selected scope. A sandbox or technology experiment does not grant production write authority.

## Journey register

These are **candidate journey IDs**, not approved company workflows or a new capability catalog. Existing FE/BE and AC identifiers retain their meanings in the [maps](README.md).
All rows have missing source evidence, unassigned business owner, unapproved examples, and blocked acceptance. “Candidate” is a discovery state, not a scope disposition.

| Journey ID | Hypothesis to validate | Existing capability references | Acceptance gates | Downstream tickets |
| --- | --- | --- | --- | --- |
| M1-J01 | Employee enters the correct workspace; offboarding revokes all access and preserves attribution | BE-06, BE-07, BE-08, FE-21, FE-22 | AC-02, AC-03, AC-04 | #3, #4, #5 |
| M1-J02 | Salesperson creates, finds, edits, assigns, trashes and restores an Account | BE-02, BE-03, BE-05, FE-02, FE-04, FE-06, FE-07, FE-12 | AC-01, AC-03, AC-04, AC-05, AC-07, AC-08 | #7–#11, #13 |
| M1-J03 | Salesperson manages contacts and their account relationships | BE-02, BE-03, FE-02, FE-06 | AC-01, AC-03, AC-05, AC-08 | #46 |
| M1-J04 | Salesperson advances an opportunity through company stages | BE-03, FE-02, FE-06 | AC-01, AC-03, AC-04, AC-05, AC-10 | #47 |
| M1-J05 | Employee records follow-up tasks, notes, activities and required file or communication links | BE-12, BE-13, BE-14, BE-20, BE-23, FE-09, FE-24 | AC-03, AC-05, AC-06, AC-08 | #48 |
| M1-J06 | Employee uses saved views, search, reports and permitted exports | BE-03, BE-23, FE-04, FE-11, FE-12 | AC-03, AC-05, AC-10, AC-11 | #10, #49 |
| M1-J07 | Requester submits a real business change for native Feishu approval; Fenforce applies the verified result | BE-06, BE-07, BE-18, FE-30 as reuse references only | AC-03, AC-04, AC-06, AC-08, AC-14 | #50–#53 |
| M1-J08 | Migration operator imports the selected scope and rehearses recovery after target writes | BE-02, BE-03, BE-20, FE-10 | AC-05, AC-14, AC-15 | #54, #55 |

For each actual journey record actor, trigger, ordered steps, measured frequency, business outcome, failure/recovery path, named owner, source evidence, target behavior, synthetic fixture and expected result, acceptance IDs, and implementation ticket. Split hypotheses when evidence reveals distinct journeys; retain traceable IDs.
Classify each discovered requirement as `M1 required`, `later`, or `excluded with owner approval`, recording named owner, rationale, decision date and evidence. Unknown items cannot be silently classified as later or excluded.

Investigate leads/conversion, quotes, products, custom objects, attachments/history, reports, automations and all external consumers. For each, record usage evidence or an owner-approved non-use decision. Runtime customization is currently later (#6, #12), subject to promotion if required company usage is discovered.
For a required gap, create a bounded ticket with input/output, permissions, failure cases, acceptance IDs, owner and dependencies before pilot approval. Do not manufacture implementation tickets for hypothetical usage. No new required gap has yet been established; no downstream ticket is made ready by this draft.

## Required contract records

These records are the collection and acceptance schema. They are intentionally not populated with invented company configuration.

| Record | Required contents | Evidence / decision blocker |
| --- | --- | --- |
| Field mapping, one row per used field | Source object and record type, field ID/API name, target stable identity, separate label and provider IDs, type, options/order, default, absent/null/empty semantics, relation/cardinality/deletion behavior, requiredness, validations, formulas/dependencies, read/write authority, disposition, owner, evidence and fixture | B02 |
| Identity contract | Selected employee IdP and tenant, issuer/subject mapping, enrollment/invitation policy, workspace membership authority, session renewal/logout, Feishu namespace and tenant/app scope, linking/relinking and collision rules, inactive/deleted users, named owner and evidence | B03 |
| Access matrix, one row per actor/action/resource/field | Workspace, role and row predicate; read/create/update/delete/restore/assign/export/approve; allowed fields and redaction; UI, direct API, subscriptions, search, report/export and file paths; expected allow/deny, evidence, owner and fixture | B03 |
| Revocation contract | Offboarding source and timestamp, membership changes, active sessions/subscriptions/caches, outstanding exports/files and queued approvals, ownership reassignment versus historical attribution, allowed propagation budget and tests | B03, B05 |
| View/report contract | Source ID and usage evidence, filters and null rules, sorting with stable tie-breaker, grouping, search behavior, complete expected IDs/counts/totals, formulas, authorized projections, pagination, currency/date rules, independent calculation and reviewer | B04 |
| Money/date contract | Currency code, precision, scale, rounding stage/mode, conversion source/rate date; date-only versus instant, storage/display zone, DST and inclusive/exclusive boundaries; null and invalid-input behavior | B02, B04 |
| Integration contract | Consumer, required/optional disposition, dataset and fields, authoritative writer by phase, direction, trigger, identity, delivery/retry/deduplication, outage and reconciliation behavior, owner and approved sandbox | B06 |
| Native approval contract | One real operation, target and relevant version, requester and approver eligibility, submitted fields/immutable snapshot, Feishu definition/version and user-ID namespace, cancellation/rejection/expiry, stale target and revoked actor rules, callback verification, lost acknowledgement/replay recovery, resulting change and audit | B07 |
| Pilot/recovery contract | Named users and owner, records/objects/date scope, source snapshot and delta boundaries, history/files, ID mapping, reconciliation, write freeze/transfer, RPO/RTO, stop conditions, target-write journal/replay, rollback authority and rehearsal | B08 |

## Writer and transition contract

| Dataset | Discovery / current phase | Rehearsal | Controlled pilot / rollback |
| --- | --- | --- | --- |
| Selected CRM business data | Salesforce remains authoritative | Isolated synthetic/import copies; no live write authority transferred | Transfer exactly named scope to Fenforce only after approval; freeze the competing writer. Reverse transfer only after reconciling acknowledged target writes |
| ERP-owned data | SAP remains authoritative | Read-only or explicitly approved sandbox boundary | SAP remains writer; enumerate any requested boundary operations separately |
| Native approval routing/state | Feishu owns the selected native flow; actual definition missing | Approved Feishu sandbox required by #50 | Feishu remains authority for approval status; Fenforce verifies it before a permitted CRM change |
| Submitted snapshots and application audit | Fenforce is intended owner; implementation unverified | Immutable synthetic requests and replay evidence | Fenforce owns request/application history; approval success alone is not proof of applied business change |
| Employee identity/directory | Production IdP and Feishu mapping unresolved | No inferred mapping by display name or email | Freeze authority, namespace and revocation contract before enrollment |
| Outlook and other consumers | Usage, datasets and writers unresolved | No inferred provider sync | Required/optional and writer per dataset must be decided before activation |

Snapshot/delta import must define a stable watermark, resumable batches, deletions, ordering, and repeat-run behavior. Reconcile complete canonical record/field/relation sets and file hashes, not only counts or samples. Explain every difference.
Before target writes, freeze the source scope and record transfer authority. After target writes, rollback must preserve an acknowledged-write journal, reconcile/replay it into the chosen authority, verify effects and audit, then reopen writes. Restoring an old Salesforce snapshot alone is not an acceptable rollback.
Stop pilot entry for unresolved required evidence, unexplained reconciliation differences, unauthorized access, duplicate business effects, or failed recovery rehearsal. Numeric RPO/RTO and operational stop thresholds require owner agreement from measured workloads; they remain unset.

## Fixtures and workload acceptance

No business fixture is approved or executable from this draft. For each accepted journey, provide a versioned synthetic fixture with actors/workspaces, source and target field mappings, initial state, operation sequence, independently computed expected records/fields/side-effect counts, denial/recovery results, and AC links. Record fixture checksum, candidate revision, evaluator, result and independent review.

Include same-workspace success and cross-workspace denial, field-restricted export/report, session revocation during active work, null/default/formula boundaries, equal-sort-key pagination, stale approval, duplicate callback, lost acknowledgement, and rollback after an acknowledged target write where applicable. A case is a proposed check until the business owner accepts its expected behavior.
For money/report checks, calculate expected totals independently of application aggregation code; retain the arithmetic and rate/rounding inputs. For date checks, include the selected zone's boundaries and DST where applicable. Do not choose company currencies, stages, time zones or thresholds from these examples.

Measure representative row counts, field widths, relationship fan-out, file sizes, query selectivity, page depth, report groups, concurrency, event frequency and delta volumes. For each workload record provenance, cold/warm repeats, result equality, p50/p95/p99 latency, scanned/read/written work, provider quotas and cost units. Attach owner-approved latency, cost, revocation, RPO and RTO budgets before AC-11/AC-15 evaluation. Empty budget cells are blockers, never zero or unlimited defaults.

## Blockers and acceptance handoff

All named decision owners are **unassigned**; role names below identify who must resolve a blocker, not an invented approval.

| ID | Missing evidence or decision | Required decision role | Blocks |
| --- | --- | --- | --- |
| B01 | Actual journeys, frequency, owners, dispositions and approved examples | Business owner / sales operations | Entire M1 scope; all journeys |
| B02 | Salesforce object/record-type/field/rule inventory and target mapping | Salesforce administrator + business owner | #7, #46–#48, #54; M1-J02–J05, J08 |
| B03 | Production identity, Feishu namespace, enrollment, access matrix and revocation | Identity/security owner | #3–#5, #8, #50; every authorized journey |
| B04 | Used views/reports, independently calculated results and money/date semantics | Reporting/finance owner | #10, #47, #49; M1-J04, J06 |
| B05 | Representative workloads and approved query/cost/revocation/recovery budgets | Operations owner + business owner | #5, #10, #49, #54, #55 |
| B06 | Required consumers and dataset writer assignments, including Outlook/SAP | Integration owners | #48, #50, #54; M1-J05, J07, J08 |
| B07 | Real native Feishu operation, approvers, version and cancellation/application policy | Business process owner + Feishu administrator | #50–#53; M1-J07 |
| B08 | Pilot users/data, snapshot/deltas, history/files, recovery and stop conditions | Migration owner + business owner | #54, #55; M1-J08 |
| B09 | Contract acceptance at an exact revision | Named business owner + independent technical reviewer | Downstream readiness and pilot approval |

Resolve blockers with sanitized evidence references and explicit decisions, then bind each M1 requirement to owner, source, target behavior, approved synthetic fixture, acceptance ID and ticket. Recheck required gaps against the roadmap and add bounded dependencies before claiming readiness.
Business acceptance: **pending**. Independent technical acceptance of the business contract: **pending**. A code/document review may assess this draft's consistency, but cannot supply missing business approval.
Handoff today: this company-discovery blocker register plus the user-authorized mock contract. Local mock work can consume its assumptions while respecting other dependencies; no approved company contract, production fixtures, live-provider readiness or production authorization is claimed.
