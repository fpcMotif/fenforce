# M1 synthetic sales contract

Status: **mock implementation contract**, authorized by the user on 2026-10-03. Not company evidence, business acceptance, or production approval.
This fills the [discovery contract](m1-contract.md) with a common sales scenario so local implementation can proceed against explicit assumptions. Replace these assumptions through B01–B09 before live provider configuration, real-data migration or pilot entry.
All names, IDs, fields, roles and numbers below are invented. Owner labels denote synthetic acceptance personas, not real signatories. No Salesforce configuration was accessed or sanitized from customer data.

## Sample scope and journeys

The synthetic business sells one-off services. One workspace, `workspace-demo`, has two sellers, one sales manager, and one administrator. `workspace-other` is the isolation fixture. Sellers own accounts; contacts, opportunities and activities inherit account access. No territory or team-sharing model is assumed.

| Journey | Actor, trigger and steps | Sample frequency and outcome | Failure / owner | Disposition and gates |
| --- | --- | --- | --- | --- |
| M1-J01 | Invited employee signs in, enters assigned workspace, signs out; administrator disables membership | 4 sign-ins/user/day; only active members can work | Unknown identity or disabled membership denied; identity administrator | M1 required; AC-02–AC-04 |
| M1-J02 | Seller receives a lead by phone, creates an Account, finds it, updates it, assigns it through manager, trashes/restores it | 10 edits/seller/day; durable owned account | Stale revision rejected; missing name rejected; sales manager | M1 required; AC-01, AC-03–AC-05, AC-07, AC-08 |
| M1-J03 | Seller adds a Contact to an accessible Account and corrects email | 5 edits/seller/day; contact linked to correct account | Foreign account rejected; sales manager | M1 required; AC-01, AC-03, AC-05, AC-08 |
| M1-J04 | Seller creates an Opportunity, moves Prospecting → Qualification → Proposal → Closed Won or Closed Lost | 5 transitions/seller/day; auditable pipeline | Invalid transition or missing close date rejected; sales manager | M1 required; AC-01, AC-03–AC-05, AC-10 |
| M1-J05 | Seller records a call note and creates/completes a follow-up task | 10 activities/seller/day; visible account history | Empty note/title rejected, unauthorized link denied; sales manager | M1 required; AC-03, AC-05, AC-08 |
| M1-J06 | Seller opens own open pipeline; manager groups pipeline by stage and exports permitted fields | 10 views/user/day; reproducible IDs and totals | Restricted rows/fields never enter output; sales manager | M1 required; AC-03, AC-05, AC-10, AC-11 |
| M1-J07 | Seller requests 15% discount on Proposal opportunity; manager approves in native Feishu; Fenforce applies once | 2 requests/day; approved amount with audit | Self-approval, stale version, replay and revoked requester cannot apply; sales manager | M1 required; AC-03, AC-04, AC-06, AC-08, AC-14 |
| M1-J08 | Migration operator imports synthetic snapshot/deltas, reconciles, switches mock writer, writes in target and rolls back | One rehearsal; no acknowledged write lost | Any unexplained difference stops transfer; migration operator | M1 required; AC-05, AC-14, AC-15 |

For this mock only, leads/conversion, quotes, products, custom objects/runtime customization, attachments, Outlook sync, SAP writes and arbitrary automations are `later`: synthetic sales manager assumes manual account entry and fixed fields suffice. History and the selected approval are required. This is not an owner-approved exclusion from actual company scope. Existing tickets cover the sample; no new capability gap is established.

## Identity and permissions

Use a mock OIDC issuer `https://identity.example.test`, tenant `tenant-demo`, and immutable subject values `seller-a`, `seller-b`, `manager-a`, `admin-a`. This selects the local test contract only; no production IdP vendor is selected. Enrollment requires an existing invitation for the exact tenant/subject; there is no automatic email-domain enrollment or account linking by email. Workspace membership is authoritative in Fenforce. Feishu mapping uses `open_id` scoped to mock tenant `tenant-demo` and app `app-demo`; persist the full scoped mapping. Never join identities by display name.

| Actor | Record access | Field/action restrictions |
| --- | --- | --- |
| Seller A / Seller B | Create accounts owned by self; read/update own accounts and their children; trash/restore own accounts | Cannot reassign owners, edit internal margin, export, approve, or directly edit applied discounts |
| Sales manager | Read/update all workspace sales records; reassign, trash/restore, export permitted fields and approve requests from other users | Cannot approve own requests; only approval application may edit applied discounts |
| Administrator | Manage invitations/memberships and inspect operational audit | No sales-record access by default; administrative status does not imply business access |
| Anonymous, disabled member, other workspace member | No data or metadata access | Deny direct reads/writes, search, reports, subscriptions, exports and approval application |

Only the manager reads/writes internal margin. Server-derived net amount is read-only for everyone. Enforce the same row/field projection on every access path. Unauthorized record IDs yield no existence disclosure. Account reassignment immediately transfers inherited child access. Relinking a contact requires update permission on both accounts; reject if any linked opportunity would then reference a different account.
Trash hides an account and children from active queries but preserves all relationships. Restore restores visibility without changing ownership; block restore when its owner is inactive until a manager reassigns it. Hard deletion is outside mock scope.

Every request checks active membership. Disablement rejects new operations immediately; connected UI/subscriptions must stop displaying cached data within a mock 5-second budget. Queued approvals recheck requester and approver membership before application. Preserve immutable historical actor IDs after offboarding. Mock sessions expire after 1 hour, renew only while membership is active, and logout invalidates the server session and local cache.

## Source-to-target field mapping

Source API names below are synthetic Salesforce-style names, not assertions about a real org. All records use synthetic `Id` → stable record identity, `OwnerId` → owner subject where applicable, `SystemModstamp` → import watermark, and target integer `revision` for optimistic concurrency. Only source changes advance the import watermark; target revisions advance on accepted writes. Labels and source IDs are separate mapping columns and may change without changing the stable identity.

| Object / synthetic API field | Stable target field | Type, default and rules |
| --- | --- | --- |
| Account.Name | account.name | Required trimmed text, 1–200 characters; no default |
| Account.OwnerId | account.owner | Required active workspace seller/manager; create defaults to actor; reassignment manager-only |
| Account.Industry | account.industry | Optional `services` or `manufacturing`; default null |
| Contact.AccountId | contact.account | Required relation to active accessible Account; inherited owner/access |
| Contact.LastName | contact.lastName | Required trimmed text, 1–100 characters |
| Contact.Email | contact.email | Optional email string; blank normalizes to null; invalid nonempty email rejected; duplicates allowed |
| Opportunity.AccountId | opportunity.account | Required active Account; immutable after creation in mock |
| Opportunity.PrimaryContact__c | opportunity.primaryContact | Optional Contact from same Account, default null |
| Opportunity.Name | opportunity.name | Required trimmed text, 1–200 characters |
| Opportunity.StageName | opportunity.stage | Enum Prospecting, Qualification, Proposal, Closed Won, Closed Lost; default Prospecting |
| Opportunity.Amount | opportunity.amountMinor | Required nonnegative integer cents; mock currency AUD only; default 0 |
| Opportunity.CloseDate | opportunity.closeDate | Optional ISO calendar date, null default; required before entering Proposal or Closed Won |
| Opportunity.Discount__c | opportunity.discountBasisPoints | Integer 0–2000; default 0; approval application only |
| Opportunity.NetAmount__c | opportunity.netAmountMinor | Derived: round half up of amountMinor × (10000 − discountBasisPoints) / 10000; never writable |
| Opportunity.InternalMargin__c | opportunity.internalMarginMinor | Nullable nonnegative integer cents; manager-only read/write; default null |
| Task.WhatId | task.account | Required active accessible Account; inherited access |
| Task.Subject | task.title | Required trimmed text, 1–200 characters |
| Task.ActivityDate | task.dueDate | Optional ISO calendar date, default null |
| Task.Status | task.status | `open` or `done`; default open |
| Note.ParentId | note.account | Required active accessible Account; inherited access |
| Note.Body | note.body | Required plain text, 1–10000 characters; immutable after create in mock |

All mock objects use a single default record type. Omitted optional fields on create use the listed defaults; omitted fields on update remain unchanged. Explicit null clears nullable fields; null for required fields fails. Empty optional strings normalize to null; empty required strings fail. Reject unknown fields and invalid options. Record IDs, created timestamps and audit actors are immutable. Every successful edit, transition, ownership change, lifecycle operation and approval application appends actor, before/after values and timestamp to an authorized audit history; denied/stale writes do not change business state.
Transitions follow the journey's forward sequence; Qualification and Proposal may also become Closed Lost. Closed states are terminal in this mock. Closed Won requires a positive net amount. No exchange rates or currency conversion are in scope. Date-only values never shift zones; timestamps use UTC and display in Australia/Perth. Report date intervals are inclusive start/exclusive end. Parsing rejects invalid calendar dates.

## Deterministic fixture and expectations

Fixture `M1-F01`, version 1: active Seller A, Seller B and manager in `workspace-demo`; administrator there without business role; outsider in `workspace-other`. Accounts `account-a` owned by Seller A and `account-b` owned by Seller B. Contact `contact-a` belongs to `account-a`; its lastName is `Synthetic` and its email is null. All records start at revision 1. All opportunity close dates are `2026-11-01` and discounts are zero unless a case changes them. Required display names equal the synthetic IDs. Optional fields default to null. No tasks or notes initially exist.

| Opportunity | Account | Stage | Amount in AUD cents | Internal margin in cents |
| --- | --- | --- | --- | --- |
| opp-a | account-a | Proposal | 10000 | 2000 |
| opp-b | account-b | Qualification | 25000 | 5000 |
| opp-c | account-a | Closed Won | 5000 | 1000 |

Saved view `open-pipeline`: stage in Prospecting/Qualification/Proposal, sort closeDate ascending then immutable ID ascending, null dates last. Search is case-insensitive substring over allowed names; group report by stage, sum integer amounts and net amounts after authorization. No fuzzy ranking. Default page size 25; fixture checks also use size 1 to prove no duplicates/omissions. Export has the same authorized result set and explicitly selected readable fields.

Independent expected totals: manager open pipeline is `[opp-a, opp-b]`, 10000 + 25000 = 35000 cents; Seller A gets `[opp-a]`, 10000 cents, without internal margin; Seller B gets `[opp-b]`, 25000 cents. Manager grouped results are Proposal=10000 and Qualification=25000. Empty authorized results are `[]`, total 0. No actor from the other workspace can obtain any fixture record or totals.

| Acceptance case | Journey / gates | Operation and expected result |
| --- | --- | --- |
| M1-F01-identity | J01 / AC-02–AC-04 | Unknown subject denied; disable Seller A while connected: new reads denied immediately and visible cached records cleared within 5 seconds; audit retains Seller A identity |
| M1-F01-edit | J02 / AC-04, AC-05, AC-08 | Update account-a revision 1 succeeds at revision 2; second update expecting revision 1 is rejected with no lost acknowledged value |
| M1-F01-relation | J03 / AC-03, AC-05 | Seller A linking contact-a to account-b is denied; submitting empty lastName fails; no relation or revision changes |
| M1-F01-transition | J04 / AC-05, AC-10 | Proposal→Closed Won with positive net succeeds; reopening Closed Won or moving to Proposal with null closeDate fails |
| M1-F01-activity | J05 / AC-03, AC-05 | Seller A adds task title `Call back`, marks it done, and writes note `Synthetic call`; Seller B cannot read either |
| M1-F01-query | J06 / AC-03, AC-05, AC-11 | Compare full IDs/totals above; manager pages of size 1 concatenate to `[opp-a, opp-b]`; seller export denied; administrator gets no sales rows |
| M1-F01-approval | J07 / AC-04, AC-06, AC-08 | Approve 1500 basis points for opp-a revision 1: net=10000 × 8500 / 10000=8500 cents, revision 2, one application audit. Replay yields no further write |
| M1-F01-stale | J07 / AC-04, AC-06 | Edit opp-a after submitting revision 1, then approve: state is approved-but-not-applied with stale-version reason; record unchanged by approval |
| M1-F01-rollback | J08 / AC-05, AC-15 | After transfer, acknowledge account-a name=`Synthetic revised`; rollback replays this write into mock source, reconciles, then reopens source writes; old snapshot alone fails |

Each case starts from a fresh fixture. These are specified expected results, not executed test evidence. Implement fixtures/tests at each ticket's public behavioral boundary; attach exact revision and independent review before marking verified.

## Approval, integrations and recovery

The mock operation is an Opportunity discount from 0 through 20% in increments of one basis point, available only at Proposal. Seller submits target ID/revision, requested discount, reason, current amount and currency as an immutable snapshot. One active request per target revision; an idempotency key identifies submission. Manager must differ from requester. Revalidate both memberships, the requester’s seller permission, the approver’s current manager/approval permission, separation of requester and approver, target access, Proposal stage and exact revision before application. Revoking either role after the human decision blocks application.
Feishu is authority for human approval; Fenforce stores `pending`, `approved`, `rejected`, `cancelled`, or `expired` approval outcome separately from application state `not-applied`, `applied`, or `blocked`. Pending requester cancellation and 7-day expiration prevent application; cancel/approve races reconcile authoritative state and never apply a locally cancelled request. Lost submission acknowledgement remains uncertain until lookup/reconciliation, never blind resubmission. Authenticated duplicate/reordered events trigger authoritative reconciliation; application and its audit commit atomically once. A stale target requires a new request, never mutation of the submitted snapshot. #50 must prove actual Feishu definition/event capabilities in a separately authorized sandbox.

Outlook is optional/later, SAP has no mock write path, and no other consumer is required. Salesforce mock remains writer before transfer; Fenforce owns selected CRM records after transfer; Feishu owns approval routing throughout and SAP retains any ERP authority. Mock write freezes prevent dual writers. The synthetic migration includes all fields, relations and audit history; no files exist in this fixture.

Sample load profile, **assumed not measured**: 10 users, 1000 accounts, 3000 contacts, 2000 opportunities, 10000 tasks/notes, 5 concurrent active users, 20 updates/minute, 2 approvals/day. Mock engineering targets: warm p95 view/query ≤500 ms, p95 edit acknowledgement ≤1 second, page query ≤500 records examined and ≤100 KB returned, per-workspace daily database reads ≤100000, active-client revocation ≤5 seconds. Record cold behavior separately; these targets require measurement and business approval before production. No monetary cost promise is made without provider prices and measured usage.

Mock recovery targets: zero lost acknowledged target writes and service restored within 30 minutes. Import resumable batches keyed by source object/ID and snapshot watermark; apply deltas in watermark/ID order, including deletion tombstones, with idempotent replay. Freeze source, drain deltas, compare canonical records/relations/audit, and switch mock authority only with zero unexplained differences. Keep the acknowledged target-write journal outside the restored snapshot. Rollback freezes target, replays/reconciles that journal to mock source, verifies complete equality and only then changes authority. Stop on any unauthorized access, duplicate application, unexplained difference, missed acknowledged write, or failed recovery target.

## Handoff

Local mock implementation may use this revision for existing tickets #3–#11 and #46–#54, while respecting their other dependencies. M1-F01 supplies synthetic expectations; it does not satisfy baseline #2, live provider #50, or release #55 evidence. Business owner and independent technical acceptance of the real contract remain pending. Replace assumed budgets with measured agreed budgets and all mock identity/field/provider choices with approved company evidence before a pilot.
