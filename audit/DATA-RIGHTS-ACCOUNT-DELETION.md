# Data Rights, Account Export & Account Deletion

Date: 2026-09-04
Work packages: WP2 export; WP3 resumable deletion
Verdict: **LOCAL PASS WITH EXTERNAL AND LEGAL CONDITIONS**

This evidence records the product-side implementation only. No production data was read or changed, no Function or Rule was deployed, and no account was deleted during verification.

## 1. Complete user-data map

| Store/path | Purpose | User link | WP2 treatment |
| --- | --- | --- | --- |
| Firebase Auth user | Login identity, providers, verification, Auth metadata | Auth `uid` | Export selected metadata; delete last via Admin Auth |
| `profiles/{uid}` | Display name, nickname, avatar path | document ID/`uid` | Export; delete |
| `profiles/{uid}/avatar.webp` | Profile image | Storage owner prefix | Export reference through profile; delete prefix |
| `newsletterSubscriptions/{uid}` | Consent/status/source/version | document ID/`uid` | Export; delete |
| `newsletterUnsubscribeTokens/*` | One-time unsubscribe security record | `uid` | Export count only; delete matching records; never export token/hash |
| `verificationMailRateLimits/{uid}` | Email abuse/rate state | document ID/`uid` | Export existence only; delete |
| `mail/*` | Queued transactional/marketing email | new `accountUid` field | No email body export; delete account-linked queue records created after WP2 |
| `galleries/{galleryId}` | Published Space manifest and lifecycle | `ownerId` | Full owned manifest export; owned Space immediate purge during account deletion |
| `galleries/{galleryId}/members/*` | Editor/viewer ACL | normalized account email | Owned-Space member roles exported without collaborator email; deleting user's memberships removed |
| `galleryInvites/*` | Pending/accepted invitation state | `ownerId` or account email | Export relationship without other-user target email; delete sent/received relationship records |
| `galleryPublishPermits/*`, `galleryRevisionPermits/*`, `galleryAssetRetirements/*` | Temporary publication/revision authorization and retired-media cleanup | owner/uploader fields | Export operational counts only; claim before deletion; never remove another owner's committed revision media |
| `galleryPublicationQuotas/{uid}` | Publication quota/usage state | document ID/`uid` | Export; delete |
| `accountDeletionJobs/{uid}` | Retry/progress record and short completion tombstone for cross-service deletion | document ID/`uid` | Server-only; retained after Auth deletion with a provisional 24-hour `expiresAt`, then removed asynchronously by TTL |
| `accountMediaUploadLeases/{uid}` | Short server-owned lease for account and Creator avatar/cover writes | document ID/`uid` | Server-only; deletion waits for an active lease, then drains media; stale leases expire through TTL |
| `accountExportJobs/{uid}` and `accountExportJobs/{uid}/accountExportChunks/*` | Private managed-export checkpoint, lease and bounded JSONL parts | authenticated `uid` plus server-issued job ID | Rules deny all client access; callable returns only owner-authorized redacted status/parts; both parent and parts expire through the `expiresAt` TTL field; deletion drains chunks before removing the parent |
| `creatorAccountOwners/{uid}`, `creatorAccounts/{creatorId}`, `creatorProfiles/{creatorId}`, `creatorHandles/*`, `creator-public/{creatorId}/**` | Creator identity, public profile/handle, social root, and public media | owner mapping plus `ownerId` | Export selected account-linked data; delete only while the persisted Creator ID still belongs to the deleting account |
| Creator posts, comments, reactions, follows, blocks, and notifications | Community content and relationships | Creator/account IDs | Export account-linked records; delete in bounded pages; decrement follower/comment/reaction aggregates transactionally and clamp at zero |
| `creatorReports/*`, `moderationCases/*`, and case events | User reports and moderation evidence | reporter/target IDs | Provisionally preserve reports/cases/evidence; remove display identity, move affected report documents to deletion-scoped IDs, rewrite case source-report references, and replace deleting reporter/target fields with pseudonyms pending owner/legal decisions 9–12 |
| `published/{ownerId}/{galleryId}/**` | Cover, current art, immutable revision media | Storage owner/gallery prefix | Export path/type/size/update/revision reference; delete complete owned prefix |
| `galleryArtworks/*` | Legacy schema-v1 image payload | referenced by legacy manifest; newer records may carry `ownerId` | Delete bounded `galleryId` + `ownerId` matches for a claimed owned Space; preserve ownership-ambiguous records for existing expiry cleanup |
| IndexedDB `aura-gallery-editor/projects` | Local drafts/recovery/publication link | optional `publication.accountUid`; legacy owner role/owner ID | Export account-linked records; clear only unambiguously linked records after confirmed server deletion |
| localStorage `aura-gallery-project-v2:*` | IndexedDB fallback | same as above | Same export/delete behavior |
| localStorage `aura-gallery-draft-v1:*` | Legacy anonymous/template fallback | no reliable account owner | Preserved |
| Firebase Auth browser persistence/avatar object URLs | Account session/cache | active `uid` | sign out and revoke matching avatar object URLs after success |
| Provider backups/logs | Infrastructure-level retention | provider-controlled | Outside application deletion; owner/legal policy still required |

No product Analytics user store was discovered in the current implementation. App Check attestation is authorization infrastructure and is neither exported nor exposed.

## 2. Ownership classification

1. **User-owned personal data:** Auth identity, profile/avatar, newsletter preference, account quota/rate records.
2. **Published content:** owned gallery manifests and every object below the exact owner/gallery Storage prefix.
3. **Shared/collaborative data:** memberships and invitations. Only the deleting account's relationship is removed from other-owned Spaces.
4. **Temporary safe-deletion data:** `accountDeletionJobs/{uid}` records phase/status without exported content and retains only a short, server-only completion tombstone.
5. **Operational/security records:** publication permits, quota, verification rate limits, unsubscribe records, account-linked mail queue documents.
6. **Legal/provider retention:** backup and provider-log behavior is not asserted by the product; a production policy remains open.
7. **Browser-only data:** IndexedDB/fallback projects and account avatar object URLs.
8. **Other-user data:** other owners' manifests/assets and collaborator identities are neither deleted nor exported.

## 3. Export contents

`exportAuraAccountData` remains as an App Check-protected, authenticated compatibility endpoint name, but fails closed before any data query and directs callers to the managed route. The product client has no caller for it and always uses `manageAuraAccountExport`, so every account size follows one bounded, resumable JSONL workflow.

The managed callable pages real Firestore and Storage sections, writes at most 100
records and 600 KiB per JSONL part, and resumes from a server-owned checkpoint.
`start`, `continue`, `status`, and `part` never accept a cursor from the client.
A deadline-bounded transactional lease outlives the callable ceiling by 30 seconds and fences parallel continuation work; chunk creation and
checkpoint advancement share a transaction, making retries idempotent. Public
status omits the account UID and cursor. Other Creators are represented by
per-export opaque relationship references rather than raw Creator IDs or document
paths, and persisted parts are recursively stripped of credential-like fields.

It includes:

- selected Firebase Auth metadata and provider IDs;
- profile and newsletter preference;
- publication usage/quota state;
- all owned Space manifests, including legacy manifest fields;
- current visibility/lifecycle/revision information present in each manifest;
- member role/status/time summaries, excluding collaborator email addresses;
- exact Storage object paths, type, byte size, update time and revision ID;
- editor/viewer relationship summaries for shared Spaces, without the other owner's manifest;
- received/sent invitation relationship metadata, without invitation target email;
- operational record counts/existence rather than security material.

The browser appends only account-linked drafts on that device. Blob/data sources are represented by media-reference kind; Storage and same-origin references retain their path. The export contains no signed URLs, credentials, App Check material, unsubscribe tokens, refresh/access tokens, or other-user email addresses.

The existing per-Space `aura-gallery-export` `.aura.json` implementation in `AccountDialog.tsx` remains unchanged and compatible. Account-wide exports download bounded managed parts plus a separate device-draft record as `lieuva-account-data-YYYY-MM-DD.jsonl`. Supporting browsers write each checksum-verified part directly to a user-chosen file; other browsers buffer only up to an explicit 64 MiB cap and report that larger exports require file-streaming support.

## 4. Deletion lifecycle

`deleteAuraAccount` is an App Check-protected callable. It requires a non-anonymous account and literal `DELETE` confirmation. A new job also requires an Auth token no older than ten minutes; an existing durable job is loaded before any Admin Auth lookup so an ambiguous retry after `deleteUser` can still finish. The client performs Google popup or password re-authentication before the first call, then loops on the coarse `running`/`complete` response.

The first request atomically creates `accountDeletionJobs/{uid}` and captures the current Creator ownership mapping. The existence of that record is the deletion fence: account-mutating callables reject the actor and affected account, transactionally where the write is transactional, while Firestore/Storage Rules reject direct profile/avatar and publication-upload writes. Account and Creator media writes are callable-only and hold a server-owned lease; deletion waits out an active lease and then drains those exact media prefixes. This prevents new account data from racing behind a destructive page.

Each invocation acquires a ten-minute lease, performs at most four steps under a five-minute function ceiling, and re-fetches page one after deletion rather than persisting a cursor over a shrinking set. Firestore pages contain at most 200 ordinary records; large managed-export chunks use pages of eight and near-limit legacy artwork documents use pages of five. Storage pages contain at most 100 objects. A scheduled worker runs every 15 minutes, selects running jobs oldest `updatedAt` first through the declared composite index, and resumes at most two jobs per run. Lease acquisition refreshes `updatedAt`, so a failing/hot job rotates behind older waiting jobs.

The persisted phase machine performs these operations in order:

1. claim and drain initial/revision permits and asset-retirement work; validate every path, and retain another owner's revision prefix whenever its current manifest references that prefix;
2. claim each owned Space, re-read the owner and deletion claim before every member, invitation, revision-permit, legacy-artwork, Storage, or manifest operation, delete owner-proven legacy artwork records, then delete the exact `published/{uid}/{galleryId}/` prefix;
3. remove shared memberships and invitations by both normalized email and persisted `acceptedBy` UID, then drain managed-export chunks before deleting the export job root;
4. remove Creator follows, comments, reactions, posts, blocks, notifications, handles, and rate-limit state in bounded pages, transactionally reconciling follower/comment/reaction aggregate counts;
5. provisionally pseudonymize, rather than erase, reports submitted by or targeting the deleted Creator/account; move each affected report from its linkable deterministic document ID to a deletion-scoped 64-hex ID and rewrite linked case `sourceReportIds` atomically; linked moderation cases and immutable events remain available, with case target fields pseudonymized where applicable;
6. wait for active account-media leases, then delete account documents, profile/Creator media, and Creator roots only after re-validating the captured ownership mapping;
7. delete Firebase Auth **last**, treating only Admin Auth `user-not-found` as a successful ambiguous retry;
8. mark the same job `complete`, remove temporary identity/lease fields, retain a bounded summary, and set a provisional 24-hour TTL.

Every destructive phase tolerates already-absent records and can restart from its durable state. The scheduler provides forward progress if the browser closes. The UI clears local account-linked drafts, signs out, and reports success only after receiving `complete`.

## 5. Owned vs shared behavior

- **Owner:** the Space, manifest/subcollections and the complete published Storage prefix are deleted. Ownership is never transferred and no live manifest remains with a deleted owner.
- **Editor/viewer:** only the deleting account's membership document is deleted. The other owner's Space, media and ACL for other users remain.
- **Invitations:** records sent by the account or addressed to its normalized current email are removed; duplicate paths are deduplicated.
- **Other users:** collaborator emails are redacted from account export; other-owned manifests and media are not included or deleted.

## 6. Retention and purge behavior

Implemented technical behavior for account deletion is immediate application-level purge after explicit confirmation. It uses a `purging` lifecycle/ownership claim to hide and lock each owned Space before destructive cross-service work, but it does **not** claim or add an account recovery window. The separate seven-day single-Space Trash behavior remains unchanged.

Managed export jobs expire after 24 hours. Authorization rejects an expired job
immediately; Firestore TTL on the top-level job and each chunk independently
removes the server-only checkpoint and stale subcollection data asynchronously.
This narrowly scoped TTL policy covers Firestore-only export artifacts. It does
not replace gallery lifecycle cleanup, which must also remove Storage objects.

The successful deletion job is not immediately removed: it becomes an
Auth-UID-keyed, server-only completion tombstone with temporary identity and
lease fields erased and a provisional 24-hour `expiresAt`. Firestore TTL removes
it asynchronously. This duration is an engineering minimization default, not an
approved legal receipt policy. Reports, moderation cases, and case events are
currently preserved with deleting reporter/target identities pseudonymized;
their retention and export treatment remain blocked on WP1 owner/legal answers
9–12. Existing moderation-case document IDs remain stable for operator tooling;
because those legacy IDs are target-derived, their retention is part of the same
unresolved legal/evidence policy and is not represented as full anonymization.

Configurable/product-policy boundary:

- a future approved account grace policy would require a different account-deactivation state and scheduled worker before Auth deletion;
- no such period is presented or promised today;
- provider backup/system-log retention is outside application-level deletion and must be defined with legal/owner input before production claims are made.

Technically verifiable deletion is represented by the callable summary, the short-lived completion tombstone, and absence of owned gallery/profile/newsletter/ACL/social documents and exact Storage prefixes. No permanent deletion certificate is retained or promised.

## 7. Local-data behavior

New publication edit targets record optional device-local `accountUid`; legacy owner drafts are identified by owner role plus owner ID. After server-confirmed account deletion only these account-linked records are removed from IndexedDB/localStorage. Shared editor drafts created after WP2 are also linked correctly. Unlinked anonymous drafts, legacy template drafts and drafts linked to another account remain.

Avatar object URLs for the deleted `uid` are revoked, Firebase Auth is signed out, account session state is cleared and the UI returns to the public home route. Local cleanup never runs after a failed callable.

Legacy editor drafts created before `accountUid` existed cannot be safely attributed and therefore are preserved rather than risking deletion of another device user's work.

## 8. Security model

- Export/deletion derive identity only from callable Auth context; no client owner ID is accepted.
- Both data-rights callables enforce App Check.
- Deletion requires recent re-authentication and explicit typed confirmation.
- Firestore `accountDeletionJobs` is denied to all clients; Admin Functions coordinate it.
- Firestore `accountMediaUploadLeases` is denied to clients; direct avatar writes are denied by Storage Rules and trusted media callables hold the lease.
- Existing job presence is also a write fence. Account-mutating callables check it, and Firestore/Storage Rules reject direct profile/avatar and permit-bound media writes once deletion starts.
- Export projection redacts collaborator/invite target identities and recursively removes known sensitive keys.
- Media export uses paths/metadata only, never signed URLs.
- Exported personal data is not logged. Failure records contain only phase and bounded error code.
- Membership collection-group lookup uses the `members.email` and `members.acceptedBy` collection-group indexes.
- Auth deletion occurs only after data cleanup; retries are idempotent against already-absent resources, and a scheduled worker can recover without a browser session.

## 9. Tests performed

Automated locally on 2026-09-04:

| Command | Result |
| --- | --- |
| `npm --prefix functions run check` | PASS — 24 Vitest files / 158 tests; 7 script tests; test typecheck; 22 production-only JavaScript files |
| `npm run check` | PASS — lint; 52 Vitest files / 299 tests; 43 script/lock tests; production build and performance ceilings |
| `npm --prefix functions run manifest:release` | PASS — exact 42-endpoint manifest |
| `npm run test:firebase-rules` | PASS — 2 files / 27 Firestore and Storage emulator tests |
| `npm run test:browser-smoke` | PASS — 2 Chromium tests, including exact candidate CSP enforced through a visible WebGL sample |
| root and Functions `npm audit --audit-level=high` | PASS — zero vulnerabilities in both dependency trees |
| root and Functions `npm ls --all --json` | PASS — both dependency trees resolve without invalid/extraneous packages |
| `git diff --check` | PASS |

Focused coverage includes a 5,201-record page-one drain and interrupted retry,
phase persistence, stale/expired lease behavior, Auth-not-found completion,
cross-owner committed-revision protection, persisted-ID ownership rechecks,
active upload-lease exclusion, malformed retirement/follow liveness,
transactional aggregate reconciliation, export-chunk ordering, report/case
preservation with report-ID migration, invitation/deletion race fencing,
oldest-first scheduler/index/manifest wiring, completion TTL, mutation-callable
source fences, direct profile/avatar Rules fences, and the client continuation
loop.

Tests used Node `22.23.2` and Temurin OpenJDK `21.0.12.1+1`. No production
fixture or account was created or deleted. Real Firebase/App Check/Scheduler
behavior remains an external gate below.

## 10. Defects found and fixed

1. There was no account-wide export; only a single-Space `.aura.json` export existed. Added a separate authorization-safe export.
2. There was no server-authoritative account deletion lifecycle. Added ordered cross-service cleanup with Auth last and retry phase state.
3. Other-user collaborator emails would be easy to over-export from ACL/invite documents. Added explicit redacted projections.
4. Account deletion could not distinguish account-linked local drafts from anonymous/other-account work. Added optional device-local `accountUid` and conservative legacy handling.
5. Mail queue documents had no user identifier suitable for deterministic future deletion. New verification/welcome queue writes include server-derived `accountUid`.
6. The data notice had no path to export/delete controls. Added factual behavior and direct Account entry.
7. The one-shot deletion path held a bounded inventory in memory and stopped at 5,000 records. Replaced it with a durable, page-one phase machine and scheduled recovery.
8. Account mutations could race a deletion page. Added a durable job fence to mutating callables and direct profile/avatar/upload Rules paths, including the existing-recipient invitation race.
9. Deleting report/case evidence would silently choose an unresolved legal policy, while retaining the old deterministic report key remained linkable. Reports and cases are now preserved provisionally; affected report documents move atomically to deletion-scoped IDs and case references/identity fields are pseudonymized.
10. Social relationship deletion could leave follower/comment/reaction totals stale. Aggregate reconciliation now shares the destructive relation transaction and clamps at zero.
11. Direct avatar writes could finish after the deletion fence and recreate media. Account and Creator media are now callable-only behind a bounded server lease that deletion waits out before its final drain.
12. UID-based accepted invitations/memberships could survive when the account email changed. Deletion now drains both normalized-email and persisted-UID relationships.
13. A legacy Space ID outside the modern publication format could permanently wedge an export cursor or deletion checkpoint. Persisted legacy IDs now use a separate direct-Firestore-segment validator, while new publication IDs remain strict.

## 11. Files changed

- `functions/src/accountDataRights.ts`
- `functions/src/accountDataRights.test.ts`
- `functions/src/accountDeletionJobs.ts`
- `functions/src/accountDeletionJobs.test.ts`
- `functions/src/accountDeletionIntegration.test.ts`
- `functions/src/accountExportJobs.ts`
- `functions/src/accountExportJobs.test.ts`
- `functions/src/accountExportLease.ts`
- `functions/src/accountExportLease.test.ts`
- `functions/src/accountExportProjection.ts`
- `functions/src/accountExportProjection.test.ts`
- `functions/src/index.ts`
- `functions/scripts/generate-manifest.mjs`
- `functions/scripts/generate-manifest.node-test.mjs`
- `FIREBASE_SETUP.md`
- `firestore.indexes.json`
- `firestore.rules`
- `storage.rules`
- `tests/firebase-rules/firestore.rules.test.ts`
- `tests/firebase-rules/storage.rules.test.ts`
- `src/services/accountDeletionClient.ts`
- `src/services/accountDeletionClient.test.ts`
- `src/services/accountExportDownload.ts`
- `src/services/accountExportDownload.test.ts`
- `src/services/accountService.ts`
- `src/services/draftStorage.ts`
- `src/services/draftStorage.test.ts`
- `src/services/galleryAccess.ts`
- `src/services/firebaseGalleryRepository.ts`
- `src/features/account/AccountDialog.tsx`
- `src/features/account/accountDialog.css`
- `src/App.tsx`
- `audit/DATA-RIGHTS-ACCOUNT-DELETION.md`

## 12. External/legal decisions still required

Owner/legal decisions:

1. named data controller/operator and postal address;
2. privacy/data-rights support inbox;
3. production Privacy Policy and Terms;
4. account grace/deactivation policy, if any (current preview is immediate and irreversible);
5. Firebase/provider backup and security-log retention wording;
6. exact retention/export treatment for reports, cases, appeals and evidence, including whether stable legacy case IDs may remain after identity-field pseudonymization (WP1 questions 9–11);
7. deletion/audit receipt retention, if legally required (WP1 question 12; current 24 hours is provisional);
8. treatment/migration of ownership-ambiguous legacy `galleryArtworks` before its existing expiry cleanup.

External technical verification:

1. deploy the exact reviewed Functions manifest, including `deleteAuraAccount` and `resumeAuraAccountDeletions`, without renaming endpoints;
2. enable `cloudscheduler.googleapis.com`, grant the deploy identity reviewed Scheduler job-management access, retain `roles/cloudscheduler.serviceAgent` only on the Google-managed service agent, and verify the 15-minute job invokes successfully;
3. promote the updated Firestore/Storage Rules plus the scheduler composite index and deletion/export TTL overrides through the protected policy workflow; wait for index `READY` and TTL `ACTIVE`;
4. rerun the Firestore/Storage emulator matrix in protected CI and retain its artifact with the promoted revision;
5. verify App Check valid/rejected requests in the configured Firebase project;
6. use isolated owner/editor/viewer accounts to exercise deletion above 5,000 records, interruption/resume, browser-close recovery, concurrent invite/upload/mutation fences, cross-owner committed revisions, aggregate totals, Auth response loss, export-chunk removal, and 24-hour tombstone expiry;
7. confirm exact owned Storage prefixes, memberships, invites, account/Creator/social documents and Auth user absence while retained reports/cases remain pseudonymous and usable by operator tooling;
8. visually verify Account → Data & rights at 1440×1000 and 390×844 in a connected browser, then remove only isolated test fixtures through their documented path.

## 13. Remaining risks

- Cross-service deletion cannot be globally atomic. The ordered phase record and Auth-last design make pre-Auth failures retryable, but already purged content is not restored after an explicit irreversible request.
- Scheduled recovery is bounded to two jobs and four steps per job every 15 minutes. Oldest-first rotation prevents a hot first page from permanent starvation, but a sustained queue needs alerting/capacity review and can delay completion.
- A structurally invalid checkpoint is removed from the running queue with `status: invalid`; it then requires operator reconciliation. There is not yet an alerting/SLA policy for this state.
- A successful deletion tombstone is logically limited to 24 hours, but Firestore TTL is asynchronous and must be activated in production. The duration and any longer audit receipt remain owner/legal decisions.
- Reports/cases/events are provisionally retained, not erased. Identity fields and report document IDs are pseudonymized, but stable legacy moderation-case IDs remain target-derived; final retention, access/export, appeal and evidence rules await WP1 answers 9–12.
- Active trusted-upload leases deliberately delay permit deletion until the 120-second lease expires. A missing Scheduler deployment would therefore leave an abandoned job fenced until the client retries or operations intervene.
- Old mail documents created before `accountUid` cannot be deterministically linked without comparing email content and are intentionally not mass-deleted. Provider/extension delivery logs also need a retention decision.
- Ownership-proven legacy `galleryArtworks` are deleted; older records without a trustworthy `ownerId` remain for existing expiry cleanup because deleting by reference could affect another record.
- Legacy editor drafts created before `accountUid` are preserved conservatively.
- Managed paging is deterministic and retryable but is not one cross-service,
  point-in-time snapshot; writes during a run can affect later pages.
- Supporting browsers stream checksum-verified parts directly to disk. The Blob
  fallback is explicitly capped at 64 MiB and tells users to retry in a browser
  with file-streaming support when the account export is larger.
- Firestore TTL deletion is asynchronous. Expiry is enforced by the callable
  before physical deletion, and production TTL/index readiness still needs the
  protected live parity check and staging query exercise.
- Real App Check, Auth, Firestore, Storage and visual browser behavior remain to be verified after deployment in isolated accounts.

## 14. Verdict

**LOCAL PASS WITH EXTERNAL AND LEGAL CONDITIONS.** Managed export and resumable deletion are implemented with bounded work, durable recovery, mutation fencing, Auth-last completion, a short TTL tombstone, and focused deterministic coverage. This is not a production-completion claim: the new index/TTL/Scheduler contract has not been promoted or exercised live, and WP1 owner/legal answers 9–12 still govern moderation-evidence and receipt retention.
