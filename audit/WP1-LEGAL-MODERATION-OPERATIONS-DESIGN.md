# LIEUVA WP1 — legal inputs and moderation operations design

**Date:** 2026-09-02

**Status:** engineering containment and bounded pilot tooling implemented and
deployed on 2026-09-02; owner/legal inputs and public-beta controls remain open.
This is not legal advice or a production-readiness claim.

**Scope:** current legal/data-rights copy, Creator reporting, Space/image uploads, operator workflow

**Production execution record:**

- Before mutation, the complete live gallery, Creator-profile, report, and
  quarantine request/response state was copied to a local mode-`0700` backup.
- At `2026-09-02T13:30:20.981661Z`, ten known fixture Spaces were set to
  `discoverEligible: false`; the known test Creator was set to
  `discoverEligible: false` and `profilePublic: false`. Nothing was deleted.
- Three reviewed-content composite indexes are `READY`. Firestore release
  `projects/virtualartplattform/rulesets/220efd97-efc8-4995-a622-42382d03ff46`
  is active and its source hash matches this repository's `firestore.rules`.
- Hosting, the nine Hosting-pinned public delivery routes, and eleven affected
  callable Functions were deployed with Firebase CLI `15.28.2`. All 20 scoped
  Functions report `ACTIVE`; the production bundle contains the configured
  public App Check site key.
- Post-release smoke checks returned `200` for home, `/creators`, and the public
  directory endpoint; the directory contains zero live Creators and zero live
  Spaces; the sitemap contains only `/` and `/creators`; a quarantined fixture's
  direct URL remains available with `X-Robots-Tag: noindex,follow,noarchive`.
- No content was deleted or approved. Full-Space holds, external notice intake,
  notices/appeals, automated alerting, and trusted upload quarantine/scanning
  remain public-beta blockers.

## 1. Current-state evidence

The product is correctly presented as an early-access preview, but it is not ready
for unrestricted public uploads.

- The public notice explicitly says complete terms, controller details, service
  guarantees, backup retention, rights contact, and privacy policy are unfinished
  (`src/App.tsx:707-712`, `src/App.tsx:810-817`).
- Account export and irreversible deletion are exposed in-product
  (`src/features/account/AccountDialog.tsx:600-660`). The implementation requires
  recent reauthentication and deletes Auth last (`src/services/accountService.ts:354-389`,
  `functions/src/index.ts:1069-1208`).
- `audit/DATA-RIGHTS-ACCOUNT-DELETION.md` calls its inventory complete, but it
  predates the Creator collections now exported/deleted in
  `functions/src/index.ts:990-1005` and `functions/src/index.ts:1102-1155`. It must
  not be treated as the current complete data map.
- The working tree now lets any signed-in account choose one of five bounded
  report reasons and receive a private receipt
  (`src/features/creator/CreatorReportDialog.tsx:4-11`,
  `src/features/creator/CreatorHubPage.tsx:545-558`). Intake still covers Creator
  posts only; there is no Space, artwork, profile, comment, or external
  rights-holder intake.
- Deployed report intake transactionally keeps the legacy deterministic report ID,
  creates/updates a target-scoped `moderationCases` record, appends an intake
  event, and preserves operator-owned status/case fields on repeats
  (`functions/src/index.ts:730-808`, `functions/src/moderationPolicy.ts:65-103`).
  Alerts, notices, appeals, triage assignment, and a durable full-Space hold
  remain absent.
- Firestore denies all client access to reports, cases, and case events
  (`firestore.rules:324-330`), which is a good boundary. The bounded CLI tools in
  section 4 provide local operator access through explicit short-lived Google
  credentials; the repository still has no Admin web UI or deployed operator
  role/alerting evidence.
- Browser image preparation decodes, bounds, and re-encodes normal UI uploads
  (`src/services/imagePreparation.ts:59-130`,
  `src/workers/imageProcessor.worker.ts:5-51`). A custom client can bypass that:
  Storage rules enforce owner, permit, declared MIME, and byte limits, not trusted
  decoding or content inspection (`storage.rules:16-36`, `storage.rules:112-151`).
- `discoverEligible: true` is now the only trusted discovery/index approval;
  false or missing values fail closed, and client creates/revisions must write
  false (`src/services/discoverEligibility.ts`, `firestore.rules`). It does not
  disable a direct public URL. A full Space
  takedown has no durable moderation hold; an owner can reverse an ordinary
  archive through `manageAuraGalleryLifecycle` (`functions/src/index.ts:1304-1379`).

## 2. Facts the owner/legal reviewer must supply

Do not replace these with guesses. Record the approved answer, owner, date, and
jurisdictions before changing public copy.

### Operator and scope

1. What is the exact registered operator/controller name, entity type,
   registration number, registered/postal address, and country?
2. Which launch countries and languages are in scope? Is the pilot B2B, B2C, or
   both? Are users outside those countries accepted?
3. What minimum user age applies? Are minors prohibited, permitted, or handled
   through a verified guardian/institution?
4. Who owns privacy, moderation, security incidents, and customer support? Name a
   primary and backup person for each role.
5. What public addresses will be monitored for privacy rights, support,
   moderation/illegal-content notices, copyright/rights claims, and security?
6. What staffed coverage hours and timezone can the operator actually sustain?

### Privacy and data rights

7. For every current processing purpose, what lawful basis has counsel approved?
   Cover Auth/account delivery, publication/hosting, collaboration invitations,
   Creator/community activity, operational telemetry, optional analytics,
   newsletter consent, fraud/security, moderation, and legal claims.
8. Which Firebase/Google services, region choices, email provider, and other
   subprocessors are approved? What transfer mechanism and public subprocessor
   list are required for each launch country?
9. Approve exact retention periods for: Auth/profile; active/expired/trashed
   Spaces; immutable revisions; invitations; posts/comments/reactions/follows;
   notifications; reports/cases/appeals/evidence; newsletter and unsubscribe
   records; queued/delivered mail; quota/rate-limit records; failed deletion jobs;
   telemetry/Cloud logs; security logs; backups; and quarantined/rejected files.
10. Is account deletion immediate, or should there be a deactivation/grace
    period? What may be retained after deletion for fraud, legal claims, or
    moderation, and under what approved basis?
11. Should a deletion/export request include reports submitted by the user,
    reports about the user, case decisions, or neither? How will reporter identity
    and third-party rights be protected?
12. Must LIEUVA issue a deletion receipt or retain a non-content audit record?
    For how long?
13. What verified manual process handles access, correction, restriction,
    objection, portability, and deletion requests that the self-service controls
    cannot complete? Define identity checks and escalation, without requesting
    unnecessary identity documents.
14. What precise provider backup and log-deletion limitations may be stated
    publicly? Engineering cannot infer this from application deletion.

### Terms, content, and moderation

15. Does the creator retain all ownership? What narrow licence does LIEUVA need
    to host, transform/re-encode, cache, make thumbnails/cards, publicly display,
    and deliver uploaded work? When does that licence end?
16. Which content is prohibited? Counsel/product must decide at least rights
    infringement, privacy violations, impersonation, harassment, threats,
    sexual/minor safety, illegal goods/activity, malware, spam, deceptive content,
    and attempts to evade enforcement.
17. Which moderation grounds are Terms violations, which are alleged illegality,
    and who is qualified to decide each? Operators must not invent legal grounds.
18. Which notice-and-action, statement-of-reasons, appeal, out-of-court redress,
    law-enforcement, trusted-flagger, and transparency-reporting duties apply to
    the chosen entity, service classification, size, and territories? Obtain
    counsel's written applicability decision.
19. Can anyone submit a sufficiently detailed illegal-content/rights notice, or
    only account holders? What contact details and good-faith declaration are
    required, and when may a reporter remain anonymous?
20. What sanctions are approved: discovery demotion, content hold, removal,
    account restriction, suspension, termination, or referral? Define duration,
    territorial scope, repeat-offender rules, and restoration criteria.
21. What appeal window, reviewer independence, evidence retention, and response
    target can the team support? Who decides permanent deletion after appeal?
22. What must be communicated to the reporter and affected creator? Confirm that
    reporter identity is not disclosed except where counsel requires it.
23. What emergency categories require immediate containment and a pre-agreed
    external escalation? Record jurisdiction-specific instructions; operators
    must not improvise or circulate harmful material.

### Commercial and service promises

24. Is this still a free controlled pilot? What availability/support commitment,
    if any, is safe to promise? Current copy promises no moderation SLA or
    confidential-data service.
25. Approve warranty, liability, indemnity, termination, governing-law,
    jurisdiction, and change-notice language. These are legal decisions, not
    engineering copy.
26. Confirm the legal sender name/address, monitored reply-to, and marketing
    consent/withdrawal wording before recurring email.

## 3. Controlled-pilot moderation runbook

Until the target controls in sections 4-6 exist, keep publishing invite-only.
The following is an internal operating design, not a public SLA.

### Roles

- **Duty operator:** acknowledges, triages, contains, and records evidence.
- **Decision owner:** approves Terms-based removal and account restrictions.
- **Legal/safety escalation:** decides alleged illegality and external reporting.
- **Appeal reviewer:** a different person where staffing permits.
- **Engineering on-call:** handles compromised accounts, malware, or broken
  enforcement; it does not decide content legality.

No operator should moderate their own content, a close associate, or a dispute
where they are the reporter.

### State flow

`received -> triaged -> investigating -> no_action | actioned -> notices_sent -> closed`

An appeal adds `appeal_submitted -> appeal_review -> upheld | reversed | modified`
without overwriting the original decision or event history.

### Procedure

1. **Receipt:** create an immutable intake event, return a receipt ID, and send an
   immediate acknowledgement when contact information is available.
2. **Validate:** confirm exact target, URL/IDs, category, and enough information to
   assess it. Request missing facts; do not reject solely for choosing the wrong
   category.
3. **Triage:** assign severity, owner, due time, conflict check, and whether the
   claim is Terms-based or needs legal review.
4. **Preserve minimum evidence:** record target IDs, timestamps, hashes, and only
   the minimum content snapshot required for review. Restrict evidence access and
   never copy it into general logs, Slack, or tickets.
5. **Contain:** use the least restrictive reversible action that stops the harm.
   For current Creator posts, set `moderationStatus: removed`. For a quality/spam
   Space demotion, set `discoverEligible: false`. Neither is a complete solution
   for all illegal-content cases.
6. **Urgent Space hold in the current pilot:** archive the Space, disable/revoke
   the owner's Auth session if reactivation risk is material, and verify its HTML,
   card, Firestore, and Storage responses. This affects the whole account and
   therefore requires decision-owner approval. Do not claim durable per-Space
   holds until section 4 is implemented.
7. **Decide:** record policy/legal basis code, facts relied on, action, scope,
   duration, reviewer, and whether automation was used. Require two-person
   approval for irreversible purge or account termination.
8. **Notify:** tell the reporter the outcome and available redress; tell the
   affected user the restriction, scope/duration, specific reason, policy/legal
   basis, and appeal route. Never expose the reporter by default.
9. **Appeal:** preserve the original decision, assign a different reviewer where
   possible, accept new evidence, and record uphold/reverse/modify with reasons.
10. **Close and reconcile:** verify the intended public/private behavior, record
    notice delivery, set retention/destruction dates, and count the case in
    aggregate transparency metrics.

### Draft internal response targets

These become commitments only after the owner supplies coverage and accepts them.

| Priority | Example | Triage target | Containment/decision target |
| --- | --- | ---: | ---: |
| P0 | credible imminent danger; material requiring emergency legal/safety handling | page immediately | reversible containment within 1 staffed hour; follow the approved emergency path |
| P1 | doxxing/privacy exposure, credible rights notice, targeted threats or severe harassment | 4 staffed hours | provisional decision within 24 hours |
| P2 | impersonation, repeated harassment, coordinated/repeat spam | 1 business day | decision within 3 business days |
| P3 | ordinary spam, quality, or other policy complaint | 2 business days | decision within 5 business days |

Appeals: acknowledge immediately; target a human decision within five business
days. Pause irreversible purge while a timely appeal is open unless the approved
legal/safety procedure says otherwise.

## 4. Firebase-compatible case design

Do not rename existing AURA/Firebase contracts. Evolve them additively.

### Intake record

Keep `creatorReports/{reportId}` and its current fields for compatibility. Add
server-written fields:

```text
targetKind: "creator-post"
firstReportedAt, lastReportedAt
reportCount
caseId
intakeChannel: "in-product"
schemaVersion: 2
```

Create/update it transactionally. A repeat report may increment `reportCount`
and `lastReportedAt`, but must never reset status, decision, assignee, or case ID.

### Protected case and event ledger

Add deny-by-default `moderationCases/{caseId}`:

```text
targetKind: creator-post | creator-profile | creator-comment | space | artwork
target: bounded IDs only (never an arbitrary document path)
sourceReportIds: bounded list
status, priority, assignedOperatorId
basisType: terms | alleged-illegality | safety | security
basisCode, decisionCode
actionKind, actionScope, actionStartsAt, actionEndsAt
openedAt, dueAt, updatedAt, closedAt
appealStatus
version, schemaVersion
```

Append every transition to
`moderationCases/{caseId}/events/{eventId}` with actor ID, old/new state, reason
code, timestamps, and content/evidence hashes. Store raw evidence only in a
separate private prefix with an approved retention date. Never expose reporter
identity in creator-facing notices.

### Enforcement fields

- **Creator post:** retain existing `moderationStatus: published | removed`; add
  server-only decision reference and timestamp.
- **Space discovery demotion:** retain `discoverEligible: false`.
- **Full Space hold/removal:** add a server-owned moderation state checked by
  client reads, Storage reads, public delivery, lifecycle actions, renewals, and
  edits. Owner/editor writes must preserve it. This is required because ordinary
  archive/visibility changes are owner-reversible.
- **Account restriction:** use an explicit server-owned enforcement record and,
  for emergency/full suspension, Firebase Auth disable plus token revocation.
  Record and test reversal.

### Operator tools

Pilot volume does not justify a public admin web app. Build narrow Admin tools:

- `scripts/moderation-queue.mjs`: read-only by default; list overdue/open case IDs
  and bounded metadata; content requires a separate explicit flag.
- `scripts/moderation-action.mjs`: dry-run by default; require exact case ID,
  expected version, allow-listed action and reason code; `--execute` performs one
  transaction and appends one event.
- `scripts/moderation-reconcile.mjs`: read-only verification that case state,
  post/Space enforcement, public delivery, and notices agree.

Use Workload Identity/ADC and a dedicated least-privilege operator role. Do not
accept arbitrary Firestore paths, raw service-account JSON on the command line,
or bulk action without a reviewed input file and second-person approval.

### Implemented bounded tooling

The repository now provides the narrow first version:

```bash
npm run review:public-content -- --kind spaces --limit 25
npm run review:public-content -- --kind creators --limit 25
npm run review:public-content -- --kind posts --limit 25
npm run review:public-content:decision -- --help
npm run moderation:queue -- --status new --limit 25
npm run moderation:action -- --help
```

All commands require an explicit `FIREBASE_PROJECT_ID` and a short-lived
`GOOGLE_OAUTH_ACCESS_TOKEN`. Write actions also require an opaque
`MODERATION_OPERATOR_ID`.

The review and queue commands are read-only, page at no more than 100 records,
return an opaque project-bound cursor, and omit public text unless
`--include-content` is explicit. The case queue returns no reporter identity.
New intake sets `newReportPending: true`, including on an actioned/closed case;
the default queue therefore surfaces repeat reports without erasing or reopening
the recorded decision. A completed operator action clears that flag atomically.

`review:public-content:decision` is the only operator tool that can set the
trusted approval bit to true. It binds one Space/Creator decision to the exact
document update time and SHA-256 content fingerprint emitted by the read-only
review command; Spaces also require the exact revision. It writes the gate,
`publicContentReviews` ledger, and immutable event atomically. It is dry-run by
default and requires exact project confirmation to execute.

`moderation:action` reads and validates one exact target, then prints a dry-run
plan. Report actions use the report's persisted target-scoped case ID and reject
a caller-supplied mismatch or missing case. Every action requires the exact case
version shown by the queue. It sends no commit unless `--execute` and an exact
`--confirm-project "$FIREBASE_PROJECT_ID"` are both present. Every changed
existing document uses its Firestore update-time precondition. One atomic commit
can:

- close one report without action;
- remove or restore one Creator post;
- demote one Space in public discovery using only the existing
  `discoverEligible` compatibility field (restoration must pass the exact
  public-content decision gate); and
- write/update one protected case plus one immutable event.

The action tool cannot purge/delete content, change a Space identity/path,
change visibility/lifecycle, disable an account, accept an arbitrary Firestore
path, or perform a bulk action. Full Space takedown, notification delivery,
appeal intake, upload quarantine, and automated alerts remain unimplemented
public-beta gates. Do not use `--execute` until operator identity, policy basis,
retention, and approval authority are assigned.

## 5. Upload-safety design

### Controlled pilot now

- Keep verified-account, App Check, permit, quota, owner/path, MIME, and size
  controls already present.
- Keep public listing curated. Manually review new pilot publishers and use
  `discoverEligible: false` for uncertain content.
- Treat client-side decode/re-encode as usability and risk reduction, not a trust
  boundary.

### Public-beta gate

1. Upload originals/prepared images to a private temporary quarantine prefix.
2. Trigger trusted processing on object finalization.
3. Verify magic bytes against declared type; fully decode with bounded memory,
   dimensions, pixels, frames, and time; reject malformed/polyglot/decompression
   bomb inputs.
4. Strip metadata and re-encode a new image. Optionally scan with an approved
   malware engine; record engine/version/result without logging content.
5. Only trusted code copies approved bytes into the existing canonical
   `published/{ownerId}/{galleryId}/...` paths. Those compatibility paths do not
   change.
6. Finalize a new manifest only after every required asset is approved. For an
   edit, the current revision stays live until the new revision passes.
7. Delete rejected/quarantine objects on the approved short retention and expose
   a safe retry/error to the creator.
8. Alert on scanner failure/backlog; fail closed for public activation, while
   preserving the user's local draft.

Firebase supports Storage-finalization triggers, and Google documents an
unscanned-bucket -> event -> scanner -> clean-bucket pattern. The exact scanner,
cost, regions, and retention still require owner/security approval.

## 6. Remaining files and tests after WP1 containment

### Policy/documentation after owner answers

- Replace the preview notice with reviewed public Privacy and Data Rights text.
- Add reviewed Terms, Content/Acceptable Use Policy, Notice-and-Action page, and
  appeal instructions.
- Update `audit/DATA-RIGHTS-ACCOUNT-DELETION.md` with every Creator, report,
  moderation, evidence, and quarantine store plus approved retention.
- Add an internal on-call roster, emergency contacts, evidence handling, and
  credential-recovery annex outside the public repository if it contains names
  or secrets.

### Product/backend implementation

- Extend the deployed Creator-post intake into a complete moderation state
  machine with assignment, notices, appeals, reconciliation, and alerts.
- Add `functions/src/uploadInspection.ts` and tests for bounded decoding,
  re-encode, inspection result, and idempotent finalize/cleanup.
- Add external rights/illegal-content intake and exact-target reporting for
  Spaces, profiles, artwork, and comments; keep reporter identity private.
- Add a durable full-Space hold checked by every data, HTML, card, media,
  lifecycle, and owner/editor mutation path.
- Add Firestore/Storage emulator matrices and automated deployed-parity checks.

### Required regression matrix

1. Re-report never reopens or erases an actioned case.
2. Reporter cannot read the queue, evidence, assignee, or target notices.
3. Affected creator never receives reporter identity.
4. Removed post disappears from feed/profile and rejects new interactions.
5. Discovery demotion preserves direct URL; full hold denies HTML/data/card/media
   and cannot be reversed by owner/editor/lifecycle callables.
6. Appeal reversal restores only the exact approved content and records a new
   event; IDs and paths remain unchanged.
7. Account export/deletion obeys the approved report/evidence retention and
   third-party-redaction policy.
8. MIME mismatch, corrupt images, oversized dimensions/pixels, animated payloads,
   decoder timeout, scanner failure, and duplicate finalize events fail closed.
9. Rejected edit leaves the prior revision live; failed cleanup is retryable and
   produces an alert without losing the local draft.
10. Queue-age alerts and aggregate metrics contain no raw content, email, URL,
    Storage path, or reporter identity.

## 7. Go/no-go gate

Unrestricted public uploads remain **NO-GO** until all are true:

- sections 2 and 3 are approved with named, staffed owners;
- public policy/contact pages match real operator facts;
- every report creates an operator-visible, alerted, auditable case;
- takedown and appeal are tested end to end and cannot be undone by the uploader;
- trusted upload inspection/finalization and failure cleanup are proven;
- retention, deletion/export, evidence, and backup wording agree;
- an isolated drill measures the proposed response targets; and
- legal counsel records which jurisdiction-specific duties apply.

## 8. Official references for review

- [EU Digital Services Act, Articles 16-17 and related provisions](https://eur-lex.europa.eu/eli/reg/2022/2065/oj/eng)
- [European Commission DSA notice-and-action overview](https://digital-strategy.ec.europa.eu/en/policies/dsa-notice-and-action-mechanism)
- [Firebase Cloud Storage event triggers](https://firebase.google.com/docs/functions/gcp-storage-events)
- [Google Cloud reference architecture for automated malware scanning](https://cloud.google.com/architecture/automate-malware-scanning-for-documents-uploaded-to-cloud-storage)

Counsel must determine legal applicability. The references explain why the design
preserves receipts, exact targets, reasons, redress, and moderation metrics; they
do not supply LIEUVA's missing operator facts or policy decisions.
