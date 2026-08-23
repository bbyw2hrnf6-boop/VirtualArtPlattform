# Data Rights, Account Export & Account Deletion

Date: 2026-08-23  
Work package: WP2  
Verdict: **PASS WITH CONDITIONS**

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
| `galleryPublishPermits/*` | Temporary publication authorization | `ownerId` | Export count only; delete |
| `galleryPublicationQuotas/{uid}` | Publication quota/usage state | document ID/`uid` | Export; delete |
| `accountDeletionJobs/{uid}` | Retry/progress record for cross-service deletion | document ID/`uid` | Server-only temporary state; deleted on success; may remain as non-public retry evidence after failure |
| `published/{ownerId}/{galleryId}/**` | Cover, current art, immutable revision media | Storage owner/gallery prefix | Export path/type/size/update/revision reference; delete complete owned prefix |
| `galleryArtworks/*` | Legacy schema-v1 image payload | referenced by legacy manifest, no reliable owner field | Legacy reference remains exportable through manifest; not account-deleted because ownership cannot be proven; existing expiry cleanup remains authoritative |
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
4. **Temporary safe-deletion data:** `accountDeletionJobs/{uid}` records phase/status without exported content.
5. **Operational/security records:** publication permits, quota, verification rate limits, unsubscribe records, account-linked mail queue documents.
6. **Legal/provider retention:** backup and provider-log behavior is not asserted by the product; a production policy remains open.
7. **Browser-only data:** IndexedDB/fallback projects and account avatar object URLs.
8. **Other-user data:** other owners' manifests/assets and collaborator identities are neither deleted nor exported.

## 3. Export contents

`exportAuraAccountData` is an App Check-protected, authenticated callable in `functions/src/index.ts`. The server derives the `uid` from verified Firebase context and produces `aura-account-export` schema version 1.

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

The existing per-Space `aura-gallery-export` `.aura.json` implementation in `AccountDialog.tsx` remains unchanged and compatible. The account export downloads separately as `aura-account-data-YYYY-MM-DD.json`.

## 4. Deletion lifecycle

`deleteAuraAccount` is an App Check-protected callable. It requires a non-anonymous account, literal `DELETE` confirmation and an Auth token no older than ten minutes. The client performs Google popup or password re-authentication immediately before calling it.

The server creates/updates a private job record, inventories resources from the authenticated identity, then runs the ordered idempotent plan in `accountDataRights.ts`:

1. mark owned Spaces `trashed` with an immediate purge timestamp so they are not publicly active;
2. delete each exact `published/{uid}/{galleryId}/` prefix, including all revisions;
3. recursively delete each owned gallery manifest and member subcollection;
4. remove the account's membership from other-owned Spaces;
5. remove sent and received invitation relationships;
6. delete the profile avatar prefix and linked Firestore operational/profile/newsletter records;
7. delete Firebase Auth **last**;
8. clear the temporary job record best-effort and return a deletion summary.

Every phase is safe when documents/objects are already absent. If a pre-Auth phase fails, the function records a non-sensitive phase/error code, returns failure, leaves Auth available and can be retried. The UI never clears local data or claims success on callable failure.

## 5. Owned vs shared behavior

- **Owner:** the Space, manifest/subcollections and the complete published Storage prefix are deleted. Ownership is never transferred and no live manifest remains with a deleted owner.
- **Editor/viewer:** only the deleting account's membership document is deleted. The other owner's Space, media and ACL for other users remain.
- **Invitations:** records sent by the account or addressed to its normalized current email are removed; duplicate paths are deduplicated.
- **Other users:** collaborator emails are redacted from account export; other-owned manifests and media are not included or deleted.

## 6. Retention and purge behavior

Implemented technical behavior for account deletion is immediate application-level purge after explicit confirmation. It reuses the existing gallery lifecycle shape to hide content before destructive cross-service work, but it does **not** claim or add an account recovery window. The separate seven-day single-Space Trash behavior remains unchanged.

Configurable/product-policy boundary:

- a future approved account grace policy would require a different account-deactivation state and scheduled worker before Auth deletion;
- no such period is presented or promised today;
- provider backup/system-log retention is outside application-level deletion and must be defined with legal/owner input before production claims are made.

Technically verifiable deletion is represented by the callable summary and absence of owned gallery/profile/newsletter/ACL documents and exact Storage prefixes. No long-lived deletion certificate is currently retained.

## 7. Local-data behavior

New publication edit targets record optional device-local `accountUid`; legacy owner drafts are identified by owner role plus owner ID. After server-confirmed account deletion only these account-linked records are removed from IndexedDB/localStorage. Shared editor drafts created after WP2 are also linked correctly. Unlinked anonymous drafts, legacy template drafts and drafts linked to another account remain.

Avatar object URLs for the deleted `uid` are revoked, Firebase Auth is signed out, account session state is cleared and the UI returns to the public home route. Local cleanup never runs after a failed callable.

Legacy editor drafts created before `accountUid` existed cannot be safely attributed and therefore are preserved rather than risking deletion of another device user's work.

## 8. Security model

- Export/deletion derive identity only from callable Auth context; no client owner ID is accepted.
- Both data-rights callables enforce App Check.
- Deletion requires recent re-authentication and explicit typed confirmation.
- Firestore `accountDeletionJobs` is denied to all clients; Admin Functions coordinate it.
- Existing Firestore/Storage rules were not weakened. A deny-only job rule was added.
- Export projection redacts collaborator/invite target identities and recursively removes known sensitive keys.
- Media export uses paths/metadata only, never signed URLs.
- Exported personal data is not logged. Failure records contain only phase and bounded error code.
- Membership collection-group lookup uses the existing `members.email` collection-group index.
- Auth deletion occurs only after data cleanup; retries are idempotent against already-absent resources.

## 9. Tests performed

Automated on 2026-08-23:

| Command | Result |
| --- | --- |
| `npm run test:release-gate` | PASS — 8 files, 71 tests |
| `npm run check` | PASS — lint; 25 files, 171 tests; TypeScript/Vite production build |
| `npm run check:functions` | PASS — 3 files, 20 tests; Functions TypeScript build |
| `git diff --check` | PASS |

New deterministic coverage includes authenticated vs unauthenticated account access, owned export projection, shared-data redaction, secret removal, malformed values, legacy manifests, owner/no-Space deletion, exact owned Space/Storage order, editor/viewer membership-only removal, invitations, profile/newsletter/avatar cleanup, Storage failure, Firestore failure, Auth failure, recent-auth requirement, retry/idempotency, and account-linked vs anonymous/other-account local drafts.

Existing WP1 publish/update, ACL, failure/recovery and media tests remain green. No production fixtures were created, so cleanup was not applicable.

Browser UI verification was attempted against the local Vite build, but no connected Browser/Chrome instance was available in this session. This is an external condition below, not an automated-test failure.

## 10. Defects found and fixed

1. There was no account-wide export; only a single-Space `.aura.json` export existed. Added a separate authorization-safe export.
2. There was no server-authoritative account deletion lifecycle. Added ordered cross-service cleanup with Auth last and retry phase state.
3. Other-user collaborator emails would be easy to over-export from ACL/invite documents. Added explicit redacted projections.
4. Account deletion could not distinguish account-linked local drafts from anonymous/other-account work. Added optional device-local `accountUid` and conservative legacy handling.
5. Mail queue documents had no user identifier suitable for deterministic future deletion. New verification/welcome queue writes include server-derived `accountUid`.
6. The data notice had no path to export/delete controls. Added factual behavior and direct Account entry.

## 11. Files changed

- `functions/src/accountDataRights.ts`
- `functions/src/accountDataRights.test.ts`
- `functions/src/index.ts`
- `firestore.rules`
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
6. deletion/audit receipt retention, if legally required;
7. treatment/migration of ownership-ambiguous legacy `galleryArtworks` before its existing expiry cleanup.

External technical verification:

1. deploy the two new core Functions (`exportAuraAccountData`, `deleteAuraAccount`) without renaming them;
2. publish the updated `firestore.rules` manually, consistent with the repository's established workflow;
3. verify App Check valid/rejected requests in the configured Firebase project;
4. use isolated owner/editor/viewer test accounts and `wp2-release-gate-*` Spaces to test export and deletion in the real Firebase project;
5. confirm Storage prefixes, memberships, invites, profile/avatar/newsletter documents and Auth user absence after deletion;
6. visually verify Account → Data & rights at 1440×1000 and 390×844 in a connected browser;
7. clean only `wp2-release-gate-*` fixtures if an external run fails before account deletion completes.

## 13. Remaining risks

- Cross-service deletion cannot be globally atomic. The ordered phase record and Auth-last design make pre-Auth failures retryable, but already purged content is not restored after an explicit irreversible request.
- An ambiguous network failure exactly while Admin Auth deletion succeeds may leave a private job record; it contains no exported payload/email and is inaccessible to clients. A future scheduled orphan-job cleanup is advisable.
- Old mail documents created before `accountUid` cannot be deterministically linked without comparing email content and are intentionally not mass-deleted. Provider/extension delivery logs also need a retention decision.
- Legacy `galleryArtworks` has no reliable owner field. Deleting it by reference could affect another record, so existing expiry cleanup remains the safe path.
- Legacy editor drafts created before `accountUid` are preserved conservatively.
- Real App Check, Auth, Firestore, Storage and visual browser behavior remain to be verified after deployment in isolated accounts.

## 14. Verdict

**PASS WITH CONDITIONS.** WP2 is locally implemented and all deterministic repository/Functions tests and builds pass. Production completion requires deploying the two Functions, publishing the deny-only Firestore rule addition, running the isolated external Firebase/App Check matrix, and completing browser visual verification. The repository is structurally ready for WP3, but WP3 should not begin until those external WP2 conditions are accepted or completed.
