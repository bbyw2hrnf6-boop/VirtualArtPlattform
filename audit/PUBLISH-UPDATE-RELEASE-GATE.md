# Publish / Update / Access Release Gate

**Date:** 23 August 2026  
**Scope:** Work Package 1 only  
**Verdict:** **PASS WITH CONDITIONS**  
**Production data changed:** none  
**Deploy/commit/push performed:** none

## 1. What was traced

The current implementation remains one publishing system with two intentional trust paths:

1. **Initial publication** — `Studio.publish()` in `src/App.tsx` runs shared publish review, calls `GalleryRepository.publish()`, obtains a short-lived permit from `beginAuraGalleryPublication`, uploads immutable cover/artwork objects, then creates `galleries/{galleryId}`.
2. **Published revision** — the same Studio calls `GalleryRepository.updatePublished()` with a `GalleryEditTarget`. It reads the current manifest, verifies owner/editor role and expected revision, uploads a new immutable revision folder, then writes the new manifest in a Firestore transaction.

The following existing systems were reused and exercised:

- validation: `src/services/galleryValidation.ts` and `src/features/gallery/editor/publishReview.ts`;
- stable identity and share link: `GalleryEditTarget`, `galleryShareUrl()` and `publishedGalleryProjectId()`;
- local recovery: `src/services/draftStorage.ts`;
- publish UI state: `src/features/gallery/editor/publishState.ts`;
- media conversion: `src/services/imageBlob.ts`;
- Storage contract: `src/services/galleryStoragePaths.ts`;
- Firebase repository: `src/services/firebaseGalleryRepository.ts`;
- callable policy: `functions/src/index.ts` and `functions/src/galleryPolicy.ts`;
- ACL/visibility enforcement: `firestore.rules` and `storage.rules`.

No parallel publisher, new schema, collection, Storage root or route was introduced.

## 2. Test environment and safety

### Executed environment

- Local Node/Vitest integration harness.
- The real `FirebaseGalleryRepository` was exercised against deterministic in-memory Auth, Firestore, Storage and callable adapters.
- Browser primitives required by the real media path (`Image`, canvas capture, `FileReader`, object URLs) were bounded test doubles.
- Existing IndexedDB recovery tests ran with `fake-indexeddb`.
- No Firebase project, live account, production document, Storage object, rule, Function or App Check setting was touched.

### Why no Firebase emulator run was claimed

The Firebase CLI is available, but this machine has no Java runtime. Firestore/Storage emulators therefore cannot start. No isolated external test accounts or dedicated Firebase test project were supplied, so using production automatically would violate the repository and task safety rules.

### Fixture strategy

Local fixtures use identifiers such as:

- owner: `wp1-owner`;
- editor: `wp1-editor`;
- viewer: `wp1-viewer`;
- local recovery project: `published-wp1-release-gate-room`;
- generated room titles/IDs start from `WP1 release gate` / `wp1-release-gate` semantics.

These are in-memory only and disappear at process exit. No secrets or real email addresses are stored; `.example.test` identities are used.

## 3. Release matrix

| Scenario | Deterministic coverage | Result |
|---|---|---|
| New Public Space | permit → cover/artwork upload → manifest → anonymous visitor hydration → Discover | PASS |
| JPG/PNG/WebP | all three formats publish and hydrate through the real normalization/repository path | PASS |
| New Unlisted Space | direct anonymous read works; Discover excludes it | PASS |
| New Private Space | anonymous read fails before manifest/media hydration; accepted viewer succeeds | PASS |
| Stable update | owner/editor update keeps ID, owner, publication time, visibility, retention and access version; revision increments | PASS |
| Immutable media | revision uses a new revision Storage prefix; previous objects remain intact; new media hydrates | PASS |
| Existing Storage-backed edit | `editableDraft()` hydrates stored objects into editable sources, then revision upload succeeds | PASS |
| Local recovery | failed cloud attempt does not remove working draft or publication linkage | PASS |
| Owner | publishes and updates | PASS |
| Editor | accepted editor opens private Space and updates in place | PASS |
| Viewer | accepted viewer visits private Space but cannot obtain editable draft | PASS |
| Unauthorized | private manifest read is rejected and no media path is returned | PASS |
| Invitation | create → list → accept → member access | PASS |
| Revocation | owner revokes; former editor loses private manifest access | PASS |
| Stale revision | stale target rejects before upload; current revision/title/media remain valid | PASS |
| Storage upload failure | partial upload cleanup runs; no manifest created; retry succeeds | PASS |
| Initial Firestore failure | all uploaded fixtures are removed; no manifest remains | PASS |
| Revision transaction failure | new revision fixtures are removed; previous live revision/media remain; retry succeeds | PASS |
| Callable/App Check-shaped failure | actionable recoverable error; no manifest/media; retry succeeds | PASS |
| Publish UI state | success, invalid transitions, error and retry transitions | PASS |
| Publish validation | blocking geometry/content contract and warning behavior | PASS |

## 4. Defect reproduced

### WP1-01 — prefixed callable errors were not consistently normalized

**Type:** confirmed failure-handling defect  
**Evidence:** `normalizeGalleryPublishingError()` handled some bare Firebase codes and selected `functions/*` codes, but not `functions/unauthenticated`, `functions/permission-denied`, `functions/resource-exhausted`, `functions/unavailable` or `functions/deadline-exceeded`.

**Impact:** App Check/session rejection, callable quota exhaustion or transient callable outages could reach the publish dialog as raw/inconsistent errors. The draft remained locally recoverable, but retry guidance and state communication were unreliable.

**Root cause:** client error normalization assumed several Firestore-style bare codes while callable SDK errors use a `functions/` prefix.

**Fix:** extend the existing error mapper—without changing publishing architecture—to classify:

- callable authentication/App Check-shaped rejection as `app-check` with reload/sign-in/retry guidance;
- callable resource exhaustion as `quota`;
- callable unavailable/deadline errors as `unavailable`.

**Regression:** table-driven mapper tests and a repository-level callable failure/retry scenario.

## 5. Files changed

- `src/services/firebaseGalleryRepository.releaseGate.test.ts` — deterministic repository integration/release matrix.
- `src/services/firebaseGalleryRepository.ts` — exports the existing repository class for isolated construction in tests; runtime singleton is unchanged.
- `src/services/galleryPublishingError.ts` — callable/App Check/quota/unavailable normalization fix.
- `src/services/galleryPublishingError.test.ts` — regression cases for prefixed callable codes.
- `src/services/draftStorage.test.ts` — failed-update recovery/publication-link regression.
- `package.json` — `npm run test:release-gate` command.
- `audit/PUBLISH-UPDATE-RELEASE-GATE.md` — this evidence.

No runtime Firestore schema, rules, Storage path, Function name, route or technical AURA identifier changed.

## 6. Verification results

### Release-gate suite

Command:

```text
npm run test:release-gate
```

Result: **8 test files, 70 tests passed**.

### Complete root verification

Command:

```text
npm run check
```

Result:

- ESLint: PASS;
- Vitest: **23 test files, 142 tests passed**;
- TypeScript production build: PASS;
- Vite production build: PASS.

### Functions verification

Command:

```text
npm run check:functions
```

Result:

- Functions Vitest: **2 test files, 6 tests passed**;
- Functions TypeScript build: PASS.

## 7. Exact external verification still required

The local gate proves repository orchestration and failure invariants. It does **not** prove deployed Firebase parity. Before changing the verdict to unconditional PASS, run this matrix in a dedicated Firebase test project or explicitly authorized isolated production fixtures:

1. Create two verified accounts: owner and collaborator. Use a third signed-out/private browser context for unauthorized checks.
2. Confirm reCAPTCHA Enterprise App Check registers `lieuva.com`; verify valid requests succeed and an invalid/missing token is rejected for each protected callable.
3. Publish one uniquely prefixed Public, Unlisted and Private fixture.
4. Load every visitor URL in a signed-out browser; confirm only Public appears in Discover.
5. Invite collaborator as Viewer, accept, verify visit/no edit; change/reinvite as Editor, verify in-place update.
6. Revoke and verify private access disappears after token refresh/reload.
7. Open the same Space in two editor sessions; publish A, then attempt stale B; confirm B fails and recovers locally.
8. Use browser network blocking once for Storage and once for Functions; retry and verify no stuck review modal or contradictory status.
9. Verify all artwork and cover objects load after initial publish and update.
10. Check Firestore/Storage/Functions logs for denied requests, orphan objects and unexpected internal errors.

### External fixture prefix

Use exactly:

```text
wp1-release-gate-YYYYMMDD-HHMM-<8-char-random>
```

Record every generated gallery ID and invite ID before cleanup.

### Safe cleanup procedure

Cleanup must be performed only in the authorized test environment and only from the recorded fixture manifest:

1. Stop if any gallery title/ID does not contain the run prefix.
2. For each exact recorded gallery ID, list and verify `published/{ownerUid}/{galleryId}/` before deletion.
3. Delete only that exact Storage prefix.
4. Delete only invites whose recorded `galleryId` equals the fixture gallery ID.
5. Delete only `galleryPublishPermits/{galleryId}` for recorded fixture IDs.
6. Recursively delete only `galleries/{galleryId}` for recorded fixture IDs, including `members`.
7. Do not delete shared quota documents unless the entire account/project is a disposable dedicated test environment.
8. Re-query each exact ID/prefix and attach zero-result evidence to this report.

**Cleanup result for this run:** no external fixtures existed; in-memory fixtures were destroyed with the Vitest process.

## 8. Remaining risks

- Firestore and Storage Rules were inspected but not executed in an emulator because Java is unavailable.
- Deployed rules, indexes, Functions, App Check and this checkout may differ.
- No fresh real-browser UI run was possible without isolated accounts/browser authorization.
- Network throttling and token-expiry behavior still require the external matrix.
- The update path intentionally uses client Storage + Firestore transaction rather than a callable; its deployed Rules are therefore part of the release binary and must be verified together.

## 9. Final decision

**PASS WITH CONDITIONS.** All locally executable Work Package 1 scenarios pass, the only reproduced code defect was fixed with regression coverage, and failure paths preserve recoverable work and live identity. The repository implementation is ready to proceed to Work Package 2, but public-launch confidence remains conditional on the exact external Firebase/App Check/browser matrix above.

