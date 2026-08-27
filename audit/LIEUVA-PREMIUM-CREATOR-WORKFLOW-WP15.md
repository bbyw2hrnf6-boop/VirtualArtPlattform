# LIEUVA Premium Creator Workflow — WP15

Date: 2026-08-27  
Verdict: **PASS WITH CONDITIONS**

## Scope and evidence

WP15 was implemented as a compatibility-preserving extension of the existing draft, publication, account, and recovery architecture. No Firebase collection, Storage path, route identity, published Space ID, callable Function, or legacy AURA compatibility identifier was renamed. No production data was changed and nothing was deployed.

Evidence used:

- repository implementation and existing audit documents;
- deterministic unit and release-gate suites;
- production build and Functions build;
- local browser QA at `http://127.0.0.1:5177` without signing in or publishing live data.

## Project and Space model

The existing model remains authoritative:

- a local Project is a recoverable `StoredGalleryDraft`;
- a published Space is linked through `publishedGalleryId` and keeps its stable share identity;
- updates continue through the existing publication repository and revision lifecycle;
- local drafts and live Spaces are deliberately not merged into a new parallel system.

`src/features/account/projectWorkspace.ts` adds a presentation-layer state model only. It classifies a linked Project as `published`, `changes`, or `conflict` from existing draft and live records. It does not alter persistence schemas beyond one optional, backward-compatible draft field.

## Creator home and status clarity

The account Project list now communicates:

- live revision;
- local changes that are not live;
- a conflict when the live revision is newer than the linked local Project;
- a purposeful empty state with a direct Create a Space action.

The Studio header now distinguishes `Draft · Not live`, `Changes · Not live`, and `Published · rN`. Walk Preview visibly states `Draft preview` and `Changes are not live` so preview cannot be mistaken for publication.

## Draft, autosave, and recovery

`StoredGalleryDraft` now accepts the optional `publishedDraftSignature`. The signature is computed from stable authored content and intentionally excludes temporary media URLs. Autosave preserves the last published baseline through localStorage and IndexedDB fallback. Legacy drafts without this field remain readable and are treated conservatively.

Failed publish/update behavior remains non-destructive. Actionable Firebase errors explicitly state that the draft remains saved. Existing release-gate tests continue to prove recovery, retries, stable IDs, media continuity, ACL preservation, and stale-revision safety.

## Conflict handling

The previous silent replacement path for a stale linked local Project was removed. When live revision and local work diverge, the account UI now presents an explicit conflict:

1. **Keep local work** — opens the creator's local state against the current live Space.
2. **Open latest live** — opens the newest published revision.

Before either choice, LIEUVA writes a standalone safety recovery copy. No silent overwrite occurs, and the existing stable published Space identity remains linked.

## Publish, update, preview, and access

The existing review, validation, publish/update state machine, visibility controls, ACL, invitations, media upload, and stable share URL systems were reused. WP15 improves creator-facing state and error clarity without replacing these systems. No destructive or live Firebase QA was performed in this package.

## Mobile, visual quality, accessibility, and performance

- Status language uses text, not color alone.
- Conflict controls are semantic buttons inside a labelled alert-dialog region.
- The empty state and conflict actions remain usable at existing account breakpoints.
- Walk Preview retains existing keyboard/touch controls and now adds a compact non-blocking status overlay.
- No new browser console warnings or errors were observed during local desktop QA.
- Production build passes. The existing CSS budget reports a non-blocking 437-byte gzip overage (`37,437` versus `37,000`); this is recorded as a remaining performance condition rather than hidden by weakening the budget.

## Tests and verification

New regression coverage:

- `src/features/account/projectWorkspace.test.ts`
  - ignores temporary media URLs in the draft signature;
  - detects unchanged published state;
  - detects local unpublished changes;
  - detects stale live/local conflicts;
  - handles legacy drafts conservatively.
- `src/services/draftStorage.test.ts`
  - proves the published baseline survives subsequent autosaves.

Results:

- targeted WP15 tests: **15 passed**;
- `npm run check`: **274 tests passed**, lint passed, production build passed;
- `npm run check:functions`: **45 tests passed**, Functions TypeScript build passed;
- `npm run test:release-gate`: **72 tests passed**;
- local browser QA: landing, new Studio Project, Arrange → Walk Preview, draft/live status, and console log inspection passed;
- browser console: **0 errors, 0 warnings** in the tested flow.

## Remaining conditions

1. Run authenticated production QA with isolated owner/editor/viewer accounts for account Project cards, conflict choices, update, visibility, and ACL; do not use unrelated user data.
2. Confirm the account conflict panel and Studio status at 390 × 844 on a physical or emulated touch device.
3. Reduce the small CSS gzip budget overage in a dedicated, measured performance pass.
4. Keep SMTP/legal sender placeholders out of production email until configured; this is outside WP15.

## Completion

WP15 is complete for repository implementation and deterministic verification. The package is ready for WP16 **with the external authenticated/mobile QA conditions above explicitly open**.
