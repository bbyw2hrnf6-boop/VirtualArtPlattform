# LIEUVA WP3 — data, rules, and security lifecycle assurance

**Date:** 2026-09-04  
**Implementation baseline:** `bd35fbb` (`WP1 -2`)  
**Status:** repository implementation locally verified; production promotion
evidence remains open.

No production data, Firebase policy, Function, Hosting release, GitHub setting,
or cloud identity was changed while preparing this work package.

## 1. Outcome

WP3 replaces client-trusted and unbounded paths with explicit trusted boundaries:

- Firestore and Storage authorization has a credential-free emulator matrix and
  an immutable, approval-gated policy artifact/promotion workflow.
- Schema-v3 gallery manifests are written only by trusted Functions after a
  bounded schema check and full decoded-pixel validation.
- Gallery bytes use a server-owned, per-image upload callable. Browser writes to
  `published/**` are denied; final legacy-compatible paths remain unchanged.
- Superseded revision media is recorded durably and drained idempotently by the
  finalizer or scheduled cleanup.
- Historical Storage objects have a guarded bucket-wide token/cache migration
  that includes orphan objects and resumes from a protected two-pass checkpoint.
- Large account exports use private paginated jobs and bounded JSONL parts.
- Account deletion is a page-bounded, leased state machine with Auth last and a
  scheduled recovery path when the browser closes or a response is lost.
- Account and Creator avatars/covers are callable-only behind a server-owned
  lease that deletion waits out before its final media drain.
- Expiry cleanup repeatedly drains page one under item/time budgets, uses
  mutation preconditions, and resumes after partial work.
- Newsletter unsubscribe tokens expire, rotate, and require a confirmation visit
  so mail scanners cannot consume them with a passive GET; the public POST has a
  bounded pre-database per-instance limiter.
- Creator notifications/actions have server-side rate and deduplication controls;
  undo actions do not consume the positive-action allowance.
- Hosting begins CSP in report-only mode with a bounded, privacy-minimizing
  receiver. The exact candidate also passes a local enforcing Chromium/WebGL
  smoke, while production enforcement remains a measured follow-up.
- Functions dependencies were moved to the supported current line and both
  dependency trees are re-audited in the final gate.

## 2. Security and data invariants

### Policy

Clients cannot write trusted manifests, permits, export/deletion checkpoints,
moderation records, retirement records, or maintenance state. Gallery list reads
must prove discoverability, active lifecycle, and future expiry in the query.
Direct legacy schema-v1/v2 reads remain compatible, while new schema-v3 media
reads must match the current manifest path and visibility/ACL decision.

Policy artifacts bind the exact commit, workflow run, tool locks, file hashes,
project, and bucket. The protected promotion re-verifies the artifact, adds
indexes without `--force`, waits for required resources, promotes rules, then
reads production state back. Extra production indexes are retained rather than
silently destroyed. Exact operational detail is in
`audit/WP3-FIREBASE-POLICY-GATE.md`.

### Publication and media

The client obtains a short-lived permit, sends each bounded image to the trusted
upload callable, and submits a manifest containing references only. The server
derives the authenticated actor, owner, slot, final path, expiry and metadata;
persists only non-identifying provenance rather than a raw uploader UID; decodes the
declared raster; creates the object with a generation precondition; and never
creates a Firebase download token. Exact retries accept the same already-created
bytes and reject a conflicting replacement. Finalization inventories all and
only the expected objects, claims a bounded inspection lease, validates decoded
dimensions/aspect, commits the manifest transactionally, then retires old media.

This closes the former interval in which a hostile browser could add a download
token to an uninspected object before finalization. Old token-bearing objects are
handled separately by the guarded migration in `FIREBASE_SETUP.md`.

### Export

The historical immediate endpoint name remains only as an authenticated,
App Check-protected fail-closed migration response; it performs no data query.
The product uses only the managed path. Collaborator email, raw other-Creator
identity, credentials, signed URLs, unsubscribe material, and moderation evidence
are not exported. The managed path owns its cursor and job ID server-side,
creates bounded integrity-hashed JSONL parts transactionally, uses an expiring
lease, and rejects expired or cross-owner reads. Job and part documents expire
independently through Firestore TTL. Exact request replay renews only an expired,
payload-matching lease and never clears a lease owned by a concurrent retry.

This is a resumable traversal, not a global cross-service snapshot. Concurrent
account activity can appear in a later section. The UI states this, names JSONL,
records the server start time, streams verified parts where supported, and caps
the browser Blob fallback at 64 MiB.

### Deletion

Creating the private deletion checkpoint is the mutation fence. Browser rules
and trusted mutations reject new account/Space writes after that point. Each
phase re-fetches page one after deletes, so retry cannot skip shifted records.
Owned galleries are claimed before Storage and nested records are drained;
ownership and the claim are rechecked before the root is removed. Shared records
remove only the deleting account's relationship, by both normalized email and
persisted `acceptedBy` UID. Owner-proven legacy artwork documents use five-item
pages; large export chunks use eight-item pages to stay below transaction limits.
Ownership-ambiguous legacy artwork is preserved for expiry cleanup. Firebase Auth
is deleted last. Persisted legacy Space IDs use the full bounded Firestore
document-segment contract rather than the stricter new-publication parser, so a
hostile historical ID cannot wedge either job.

The callable and scheduled recovery worker share one lease longer than their
maximum execution window. Scheduled selection is bounded and fair so one failing
job cannot permanently hide later work. Completion state is temporary and TTL
eligible; it contains counts rather than exported payload or email.

Report/case/evidence retention is a WP1 legal-policy dependency. Until questions
9–11 in `audit/WP1-LEGAL-MODERATION-OPERATIONS-DESIGN.md` are answered, deletion
must preserve moderation evidence while pseudonymizing the deleting reporter or
target identity. It must not silently erase an open case or disclose reporter
identity in export.

### Cleanup and expiry

The cleanup worker has explicit item and wall-clock budgets, bounded concurrency,
page-one destructive drains, update-time preconditions, and durable claim state.
Destructive expiry waits five minutes beyond the logical deadline so in-flight
trusted writes settle; precondition conflicts are not counted as successful
deletes. Structurally invalid retirement records are quarantined rather than
poisoning every later cleanup page.
It covers expired/trashed galleries, abandoned initial/revision permits and
their media, superseded assets, invitations, unsubscribe tokens, and legacy
artwork expiry. A cap or transient failure leaves a query-visible root/claim so
the next scheduled or manual invocation resumes.

### CSP telemetry

Static Hosting and dynamic documents share one report-only policy. The receiver
accepts only the CSP/Reporting API media types and a small request/report count,
normalizes directives, reduces URLs to origins, excludes arbitrary fields, and
rate-limits duplicate logs. Invalid attacker-controlled URLs are recorded only
as `invalid`. The exact candidate—including WebAssembly evaluation and Blob
worker connections required by the renderer—passes a local enforcing Chromium
smoke through the home, Create, sample, and visible WebGL canvas paths. This is
still pilot evidence, not production observation; enforcement requires the real
browser matrix recorded in `FIREBASE_SETUP.md`.

## 3. Required rollout sequence

1. Keep the controlled-pilot/open-registration restriction and pause publishing.
2. Produce the immutable application and policy artifacts from the same reviewed
   successful-main revision.
3. Promote Functions/Hosting with server-owned upload support first and smoke an
   initial publication plus revision.
4. Promote the compatible Firestore/Storage/index/TTL policy artifact; verify a
   hostile direct Storage write is denied and normal publication still works.
5. Run the complete read-only historical Storage plan, the leased two-pass apply,
   and a complete zero-change verification plan. Record counts and checkpoint.
6. Run isolated owner/editor/viewer export and irreversible deletion fixtures,
   including forced mid-job failure and scheduled takeover.
7. Record exact active Function revisions, rule-source hashes, index/TTL state,
   App Check rejection, and policy artifact/run/approval references.
8. Observe CSP reports through the documented product/browser matrix. Enforce in
   a later reviewed release only after unexplained violations are resolved.

Rollback must use retained immutable artifacts. Do not restore browser writes to
`published/**`, delete production indexes with `--force`, remove lifecycle
checkpoints, or delete data as a rollback technique.

## 4. Local verification evidence

Executed locally on 2026-09-04 with Node `22.23.2` and Temurin OpenJDK
`21.0.12.1+1`:

| Gate | Result |
| --- | --- |
| `npm run check` | PASS — lint; 52 Vitest files / 299 tests; 43 script/lock tests; production build and release performance ceilings |
| `npm --prefix functions run check` | PASS — 24 Vitest files / 158 tests; 7 script tests; test typecheck; 22 production-only JavaScript files |
| `npm run test:firebase-rules` | PASS — 2 files / 27 Firestore and Storage emulator tests |
| `npm run test:browser-smoke` | PASS — 2 Chromium tests, including exact candidate CSP enforced through Create/sample/visible WebGL |
| root and Functions `npm audit --audit-level=high` | PASS — zero vulnerabilities |
| root and Functions `npm ls --all --json` | PASS — resolved dependency trees are valid |
| `npm --prefix functions run manifest:release` | PASS — 42 exact release endpoints |
| `git diff --check` | PASS |

This is repository evidence only; it is not production parity. The bounded tests
exercise export/deletion retries and limits, but no real GCS/emulator race replay
or literal 4,096-part, 24-hour export was run.

## 5. External conditions and retained questions

WP3 cannot honestly be marked production-complete until these are recorded:

1. WP2 App Check key, public URL, reply-to, legal footer, WIF variables,
   environment review/protection, and branch protection inputs.
2. WP1 controller, privacy/retention and moderation answers—especially the exact
   report/case/evidence export, pseudonymization, hold, and deletion policy.
3. Protected production promotion plus read-back parity for Functions, rules,
   indexes and TTL resources.
4. Named, least-privilege authority for the historical Storage migration and its
   complete plan/apply/zero-change evidence.
5. Isolated real-project App Check/Auth/Firestore/Storage export and deletion
   tests, including destructive cleanup of only named fixtures.
6. A representative CSP report-only observation window and approved telemetry
   retention before enforcement.
7. A policy or ownership migration for legacy `galleryArtworks` records whose
   owner cannot be proven safely from their stored shape.

## 6. Verdict

The repository-side objective is met: the full local gate is green and no direct
client gallery-media write path remains. Overall WP3 is **LOCAL PASS WITH EXTERNAL
AND LEGAL CONDITIONS** until production parity, destructive fixture evidence,
CSP observation, and the dependent WP1 decisions are supplied.
