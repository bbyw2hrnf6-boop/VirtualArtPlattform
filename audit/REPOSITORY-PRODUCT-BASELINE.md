# Repository & Product Baseline — AURA / future LIEUVA

**Snapshot:** 23 August 2026  
**Scope:** Step 1 investigation only. No runtime code, branding, Firebase state, routes, controls, UI, or deployed infrastructure were changed.  
**Source of truth:** the checked-out repository at this snapshot. Documentation is treated as supporting evidence only.

## Evidence legend

- **Confirmed fact** — directly demonstrated by current code, configuration, rules, tests, or tracked assets.
- **Architectural observation** — a conclusion drawn from confirmed relationships in the implementation.
- **Likely issue — verify** — evidence indicates a risk, but browser, production, or external-service verification is still required.
- **Future recommendation** — a possible later action; not part of this investigation and not implemented.

## 1. Executive Baseline

### Current product in one sentence

**Confirmed fact:** AURA is a React/Vite single-page application that lets a visitor choose one of three procedural exhibition templates, upload and arrange images and decor, preview the result in a Three.js Walk or Overview experience, recover local drafts, authenticate with Firebase, publish versioned public/unlisted/private rooms to Firestore and Storage, share a stable hash URL, discover public rooms, and reopen an owned or editor-access room for in-place revision.

### Current technical baseline

| Area | Current implementation | Evidence |
|---|---|---|
| Front end | React 19, TypeScript, Vite, hash routing | `package.json:19-23`; `src/App.tsx:242-269` |
| 3D | Three.js procedural builder/viewer plus authored Danny GLBs | `src/features/gallery/GalleryScene.tsx:3366`, `:5672`; `README.md:163` |
| Local persistence | IndexedDB schema v2 with localStorage fallback and legacy migration | `src/services/draftStorage.ts:4-10`, `:70-110`, `:151-189` |
| Cloud persistence | Firebase Auth, Firestore, Storage, Functions in `europe-west1` | `src/services/firebase.ts:8-35` |
| Publication | Trusted permit for first publication; immutable Storage objects; transactional document update for revisions | `functions/src/index.ts:105-190`; `src/services/firebaseGalleryRepository.ts:341-625` |
| Access | Public, unlisted, private; owner/editor/viewer ACL; invitations | `src/services/galleryAccess.ts`; `functions/src/index.ts:286-388` |
| Lifecycle | Renew, visibility, archive, restore, trash, purge | `src/services/galleryRepository.ts:73-78`; `functions/src/index.ts:192-284` |
| Email | Verification, newsletter preference, welcome issue, unsubscribe functions/templates | `functions/src/index.ts:390-540`; `functions/src/emailTemplates.ts` |
| App integrity | Optional client App Check initialization; core callable Functions require App Check | `src/services/firebase.ts:24-35`; `functions/src/index.ts:105-106`, `:164-165`, `:192-193`, `:260-261`, `:286-287`, `:329-330`, `:370-371` |
| Analytics | No product analytics/RUM implementation found | repository search for `gtag`, analytics SDKs, PostHog, Sentry, Web Vitals |
| Hosting/SEO | Static GitHub Pages-compatible build, hash routes, static metadata; canonical domain is already `lieuva.com` | `vite.config.ts:4-15`; `index.html:9-36` |

### Verification performed for this baseline

**Confirmed fact:** the following repository checks passed without code edits:

- `npm run lint`
- `npm test`: 22 test files, 126 tests passed
- `npm run build`
- `npm run check:functions`: 2 test files, 6 tests passed, Functions TypeScript build passed

The production build currently emits large but below-configured-warning chunks, notably Firebase (~615 kB raw), the Three/Danny chunk (~680 kB raw), the main chunk (~328 kB raw), and GalleryScene (~133 kB raw). This is bundle evidence, not a measured user-device performance result.

### Structural summary

1. **Confirmed fact:** most product orchestration, landing, routing, builder, publish review, success, and published viewer UI live in one `src/App.tsx` file (3,931 lines).
2. **Confirmed fact:** both the procedural renderer and Danny renderer live in one `src/features/gallery/GalleryScene.tsx` file (7,257 lines).
3. **Architectural observation:** persistence has a useful lazy `GalleryRepository` boundary, but UI state and 3D runtime responsibilities remain concentrated in two very large modules.
4. **Confirmed fact:** Builder Walk Preview and published procedural rooms share the same `GallerySceneRenderer`; Danny shares several low-level primitives and the visitor control surface, but retains a separate authored-scene runtime.
5. **Confirmed fact:** Emil Scroll is a third, independent Three.js runtime. It reuses Danny assets and keyboard constants but not the main scene runtime.
6. **Confirmed fact:** the requested E look-down control is already the single canonical binding; R is unbound and covered by tests.
7. **Confirmed fact:** the product is already hosted/canonicalized on the future brand domain, while nearly all visible and technical brand terminology remains AURA. This makes the later change a controlled brand migration, not a domain acquisition task.

## 2. Repository Architecture

### Runtime entry and composition

| Layer | Files | Responsibility |
|---|---|---|
| Boot | `src/main.tsx` | React root, strict mode, global error boundary, global CSS order |
| Application shell | `src/App.tsx` | Hash router, landing, picker, Studio, Danny page, published viewer, data notice, publish flow |
| Account | `src/features/account/AccountDialog.tsx`, `AuthActionPage.tsx`, `GalleryAccessManager.tsx` | Login/create/verification, profile, room management, invite/member UI |
| Landing story | `src/features/landing/ScrollGalleryStory.tsx`, `scrollStoryModel.ts`, `PitchSections.tsx` | Emil scroll 3D sequence, positioning copy, plan/FAQ |
| 3D product | `src/features/gallery/GalleryScene.tsx`, `VisitorControls.tsx`, `scene/*` | Procedural rooms, Danny GLB, camera/control/tour/render runtimes |
| Editor domain | `src/features/gallery/editor/*` | defaults, demo data, undo/redo, shared placement validator, publish review/state |
| Persistence boundary | `src/services/galleryRepository.ts` | Lazy interface between React product and Firebase implementation |
| Firebase implementation | `src/services/firebase*.ts`, `accountService.ts`, `galleryValidation.ts`, `galleryStoragePaths.ts` | SDK setup, auth, storage, Firestore mapping/validation, callables |
| Local persistence | `src/services/draftStorage.ts` | projects, autosave storage, recovery, publication linkage |
| Media pipeline | `src/services/imagePreparation.ts`, `imageBlob.ts`, `src/workers/imageProcessor.worker.ts` | browser decode/resize/WebP preparation and blob handling |
| Backend | `functions/src/index.ts`, `emailTemplates.ts`, `galleryPolicy.ts` | publication permits, lifecycle, purge, ACL, verification/newsletter |
| Security/data contract | `firestore.rules`, `storage.rules`, `firestore.indexes.json` | schema/access validation and query indexes |
| Operations | `.github/workflows/deploy.yml`, `cleanup.yml`, `scripts/*` | Pages deployment, expiry cleanup, migration, preview capture, GLB validation |
| Asset contract | `public/assets/*`, `blender/EXPORT_CONTRACT.md`, `ASSET_LICENSES.md` | runtime assets, Danny models, future authored-template contract/provenance |

### Build and loading boundaries

- **Confirmed fact:** Firebase is lazy-loaded behind `galleryRepository`; it is not required merely to render the initial landing shell (`src/services/galleryRepository.ts:81-112`).
- **Confirmed fact:** `GalleryScene`, `DannyDemoScene`, `ScrollGalleryStory`, and `AuthActionPage` are lazy imports (`src/App.tsx:81-96`).
- **Confirmed fact:** the production base is relative for GitHub Pages portability (`vite.config.ts:4-8`).
- **Architectural observation:** this improves entry loading, but the two major feature chunks remain internally monolithic, limiting finer lazy loading and ownership clarity.

### Documentation and audit assets

`audit/` contains point-in-time audits, browser evidence, access matrices, and implementation reports. They are not runtime dependencies. `blender/` contains source/contract infrastructure; the three builder rooms are not currently loaded from its GLBs. `public/` contains shipped runtime assets and license material.

## 3. Product Architecture

### Primary product surfaces

1. **Acquisition and proof:** Landing → Emil Scroll → template showcase → Danny case → feature/plan copy → Discover.
2. **Creation:** Template picker → Studio → upload → arrange/customize → Walk Preview/Overview → review.
3. **Identity gate:** a guest may create and preview; first publication requires a verified Email/Password or Google account (`src/App.tsx:1553-1560`).
4. **Publication:** publish or update → immutable media upload → Firestore manifest → local publication linkage → share-success surface.
5. **Consumption:** `#/g/{id}` reads the manifest first and progressively hydrates artwork blobs (`src/App.tsx:3655-3687`).
6. **Discovery:** public active rooms appear on the landing; Danny remains the permanent reference fallback (`src/App.tsx:309-530`).
7. **Retention/management:** `#/account` loads owned/shared rooms and invitations; owners manage lifecycle/access, owners/editors reopen the same room for revision (`src/features/account/AccountDialog.tsx:20-178`).

### Product boundaries that are genuinely shared

- `GalleryDraft` is the core editable content model (`src/features/gallery/types.ts:91-101`).
- `GalleryRecord` extends it with publication/access/lifecycle fields (`src/services/galleryRepository.ts:14-30`).
- `GalleryRepository` is the React-facing cloud boundary (`src/services/galleryRepository.ts:46-79`).
- Placement validation is shared by editor input mechanisms and publish review through `editor/placementValidation.ts` and `editor/publishReview.ts`.
- Visitor control UI is shared through `VisitorControls.tsx`.
- Keyboard semantics are shared through `visitorKeyboard.ts`.

### Product boundaries that remain page-local

- Studio owns draft, selection, publish, account prompt, tool-sheet, save, curation, and review states in component-local React state (`src/App.tsx:966-1059`).
- Published viewer owns its own loading/access/artwork hydration state (`src/App.tsx:3628-3705`).
- Danny and procedural renderers each own their own camera/tour state inside `GalleryScene.tsx`.
- Emil Scroll owns another model/renderer/camera/control lifecycle inside `ScrollGalleryStory.tsx`.

## 4. Route Map

The router is a synchronous hash parser, not React Router (`src/App.tsx:242-269`). `?mode=` takes precedence for Firebase auth actions.

| Actual route | Resolved page/component | State/persistence notes | Status |
|---|---|---|---|
| `#/` | `Landing` | Mostly local UI; Discover lazily contacts Firebase | Confirmed |
| `#/create` | `TemplatePicker` | Reads local saved projects | Confirmed |
| `#/create/{template}` | `Studio` with `legacy-{template}` | Backward-compatible local project key | Confirmed |
| `#/create/{template}/demo` | `Studio`, demo collection | Uses `demo-{template}` project ID | Confirmed |
| `#/create/{template}/{projectId}` | `Studio` | Local project, including `published-{galleryId}` | Confirmed |
| `#/demo` | `Demo` / `DannyDemoScene` | Authored Danny GLB and fixed metadata | Confirmed |
| `#/g/{galleryId}` | `PublishedGallery` | Firestore manifest + Storage artwork hydration | Confirmed |
| `#/account` | `AccountPage` | Auth/profile/rooms/invites/lifecycle/access | Confirmed |
| `#/data` | `MvpDataNotice` | Product notice, not a complete legal suite | Confirmed |
| `?mode=verifyEmail`, `resetPassword`, etc. | lazy `AuthActionPage` | Firebase action code flow; query wins over hash | Confirmed |
| Unknown hash | `Landing` | No dedicated 404 or invalid-route state | Confirmed |

**Architectural observation:** `galleryShareUrl()` deliberately keeps the current origin and pathname and changes only the hash (`src/services/galleryShareUrl.ts`). This preserves current Pages deployment compatibility but prevents per-room server-rendered HTML metadata.

## 5. Customer Journey Map

| Stage | Route and primary components | State owner | Persistence/Firebase | Coupling, incompleteness, or legacy |
|---|---|---|---|---|
| Landing | `#/`; `Landing`, `Header`, `DeferredScrollStory`, `RoomShowcase`, `PitchSections`, `DiscoverGalleries` | Local component state | Discover → `GalleryRepository` | Emil is a separate renderer; Discover is coupled to gallery terminology |
| Create choice | `#/create`; `TemplatePicker`, `TEMPLATES` | picker local state | `listGalleryDrafts()` | Legacy project routes remain supported; three fixed art-space templates |
| Start/build | `#/create/{template}/{project}`; `Studio` | `useDraftHistory` + many local states | IndexedDB/localStorage autosave | Large component owns most flow orchestration |
| Upload | Studio artwork panel | Studio state; worker result | local draft until publish | Image is semantically an `Artwork`; title derived from filename |
| Arrange | `GallerySceneRenderer` in editor mode | React draft + imperative runtime sync | draft autosave | Shared validator; walls and gallery-specific units are first-class |
| Walk Preview | same mounted renderer, editor mode=`walk` | GalleryScene local state | none beyond draft | compact UI collapses tool sheet (`App.tsx:1076-1088`) |
| Overview | same renderer with OrbitControls/cutaway | GalleryScene local state | none | mode-specific camera logic inside renderer |
| Review | Studio publish dialog | Studio publish reducer/local review state | capture remains local | shared geometry review blocks invalid publication |
| Account gate | account dialog | `AccountDialog` + account service | Firebase Auth/Profile | guest draft is preserved; verified account required to publish |
| Publish | Studio `publish()` | `publishStatusReducer` | Functions permit → Storage → Firestore | initial visibility chosen here; update keeps existing visibility |
| Success/share | Studio success page | `published` local state | stable `#/g/{id}` | copy URL, enter, Discover link, access management for owner |
| Visit | `#/g/{id}`; `PublishedGallery`, `GalleryScene` | viewer load/mode/directory states | manifest then Storage blobs | private viewer prompts auth; non-WebGL directory fallback |
| Discover | Landing `DiscoverGalleries` | local pagination/status | public active query | fallback Danny card is not a Firestore gallery |
| Return/manage | `#/account`; `AccountRooms` | account page local state | mine/invites/lifecycle callables | room management is still implemented inside `AccountDialog.tsx` |
| Edit published | account Edit → Studio `published-{id}` | local draft + `GalleryEditTarget` | fetch/hydrate live revision, then local autosave | stale local draft is copied to a new local project before current live revision replaces it (`AccountDialog.tsx:54-85`) |
| Update published | Studio `updatePublished()` | same publish state | revision Storage paths + Firestore transaction | same ID/share URL; stale revision rejected |

### Important journey facts

- **Confirmed fact:** the real current loop is not the README's short “Choose gallery → … → Share” only; account verification, lifecycle, invitations, local recovery, re-edit, and progressive viewer loading are now material parts of the experience.
- **Confirmed fact:** first publication and later update share the same review/success UI, but call distinct repository methods (`src/App.tsx:1588-1600`).
- **Confirmed fact:** public/unlisted/private choice is exposed on first publish. Visibility changes after publication happen in account lifecycle controls, not the update review.
- **Likely issue — verify:** no repository test covers this entire cross-route browser journey end to end. Unit tests validate subcontracts, not the complete identity → publish → view → edit → update loop.

## 6. State Management Map

### React/application state

| State | Owner | Propagation |
|---|---|---|
| Current route | `App` `useState(routeFromHash)` | `hashchange`; page selected with `useMemo` (`App.tsx:3852-3908`) |
| Editable draft/history | `Studio` via `useDraftHistory` | draft passed into GalleryScene and panels; imperative ref retains latest value |
| Selection | `Studio` artwork/decor IDs | scene callbacks and sidebar |
| Save/recovery | `Studio` | timers + `draftStorage`; save status shown in header |
| Publish | `Studio` + `publishStatusReducer` | review modal, account gate, repository, success page |
| Account session | account service subscription and local consumers | `AccountDialog`, `AccountButton`, Studio, viewer retry |
| Published viewer load | `PublishedGallery` | manifest state updated progressively as blobs arrive |
| 3D camera/runtime | imperative Three.js objects inside scene effects | React receives selected/mode/tour summaries and callbacks |
| Guided tour UI state | React `VisitorTourState` in each renderer | renderer publishes progress into shared `VisitorControls` |
| Emil progress | DOM scroll target + smoothed render playhead | CSS variables, camera, mesh reveal, final interaction |

### Local draft state

- **Confirmed fact:** IndexedDB database `aura-gallery-editor`, version 2, store `projects`, schema 2 (`draftStorage.ts:4-10`).
- **Confirmed fact:** the localStorage fallback keys are `aura-gallery-project-v2:`; legacy `aura-gallery-draft-v1:` data is still read and migrated (`draftStorage.ts:151-189`).
- **Confirmed fact:** each record stores `projectId`, `templateId`, monotonically checked local revision, `savedAt`, `draft`, and optional `publication` link (`draftStorage.ts:12-20`, `:267-322`).
- **Confirmed fact:** publication links hold immutable identity plus current revision/role, allowing update rather than copy (`draftStorage.ts:29-44`).
- **Architectural observation:** rebranding local keys would be a data migration, not a cosmetic rename. Keeping old keys while changing visible copy is the safer default.

### No global state library

**Confirmed fact:** no Redux/Zustand/Context-based product store is present. Component state, hooks, repository calls, and imperative scene runtimes form the current state architecture. This is viable for the MVP but contributes to orchestration concentration in `App.tsx` and duplicated renderer state machines.

## 7. Firebase & Persistence Map

### SDK and project coupling

`src/services/firebase.ts:8-35` hardcodes the public Firebase Web configuration for project `virtualartplattform`, initializes Auth/Firestore/Storage, connects Functions to `europe-west1`, and conditionally enables reCAPTCHA Enterprise App Check using `VITE_FIREBASE_APPCHECK_SITE_KEY`.

### Firestore collections and use

| Path | Purpose | Client/server authority | Rename risk |
|---|---|---|---|
| `galleries/{galleryId}` | Published manifest, draft layout, asset paths, owner, access, revision, lifecycle | client create/update constrained by rules; server lifecycle/purge | **Critical persistent identifier** |
| `galleries/{galleryId}/members/{email}` | viewer/editor membership by normalized email | Functions write; rules read | **Critical ACL identifier** |
| `galleryInvites/{inviteId}` | pending invitation and expiry | Functions | High; indexed/query contract |
| `galleryPublishPermits/{galleryId}` | short-lived trusted publication permit | Functions/rules only | High; Storage/Firestore cross-rule dependency |
| `galleryPublicationQuotas/{uid}` | active/daily publication quota state | Functions only | High; enforcement state |
| `profiles/{uid}` | display name, nickname, avatar metadata | signed-in user constrained by rules | High; account data |
| `newsletterSubscriptions/{uid}` | opt-in/state | Functions write; owner read | High; consent/lifecycle record |
| `mail/{mailId}` | Firebase Trigger Email queue | Functions only | High; external extension contract |
| `verificationMailRateLimits/{uid}` | verification mail throttling | Functions only | High |
| `newsletterUnsubscribeTokens/{hash}` | one-click unsubscribe | Functions only | High |
| `galleryArtworks/{assetId}` | legacy schema-v1/v2 asset document | legacy read only | **Must remain for backward compatibility** |

Relevant rules are in `firestore.rules:219-292`; new gallery shape/permit validation is in `firestore.rules:72-190`.

### Storage paths

| Path | Purpose | Rule evidence |
|---|---|---|
| `published/{ownerId}/{galleryId}/cover.webp` | initial cover | `storage.rules:112-119` |
| `published/{ownerId}/{galleryId}/artworks/{1..14}.webp` | initial art media | `storage.rules:122-131` |
| `published/{ownerId}/{galleryId}/revisions/{revisionId}/cover.webp` | immutable revision cover | `storage.rules:134-141` |
| `published/{ownerId}/{galleryId}/revisions/{revisionId}/artworks/{1..14}.webp` | immutable revision art | `storage.rules:144-153` |
| `profiles/{uid}/avatar.webp` | private account avatar | `storage.rules:162-173` |

Path construction and validation are centralized in `src/services/galleryStoragePaths.ts:1-53`.

### Publication sequence

#### New room

1. Studio requires verified Firebase account and passes shared publish review (`App.tsx:1553-1566`).
2. `beginAuraGalleryPublication` validates identity/visibility, enforces active-room/daily quotas, and writes a permit (`functions/src/index.ts:105-163`).
3. Client prepares cover/art blobs and uploads immutable objects under the owner/gallery root (`firebaseGalleryRepository.ts:341-470`).
4. Client creates the schema-v3 gallery document; Firestore rules validate the permit and exact asset paths (`firestore.rules:133-170`).
5. On failure, client calls abort; backend deletes the partial prefix and releases the permit/quota state (`functions/src/index.ts:164-190`).

#### Update existing room

1. Local `GalleryEditTarget` supplies stable ID, owner, visibility, access version, role, and expected revision.
2. Client uploads to a new immutable revision path.
3. A Firestore transaction requires current revision equality and preserves identity/owner/template/publishedAt/expiry/visibility/retention/access version while incrementing revision (`firebaseGalleryRepository.ts:471-625`; `firestore.rules:172-217`).
4. The same share URL remains valid.

**Architectural observation:** the first-publication trust boundary is Function-issued; content revisions remain a client + rules + Firestore transaction path. This distinction must be preserved or consciously redesigned—never hidden by a cosmetic function rename.

### Read/query behavior

- `findManifest()` validates Firestore data and can return before all images are fetched.
- `PublishedGallery` then progressively calls `hydrateGalleryArtworks()` and updates progress (`App.tsx:3655-3687`).
- `discover()` queries active public galleries; `mine()` combines owned and membership queries in the Firebase repository.
- Composite indexes are declared in `firestore.indexes.json`; production index existence is an external deployment fact, not provable from the repository alone.

### Auth and accounts

- Anonymous, Email/Password, and Google flows are implemented (`accountService.ts:225-347`).
- Anonymous state can be upgraded/linked during account creation.
- Verified identity is required for publication and ACL functions.
- Profile and newsletter are separate Firestore records.
- **Confirmed fact:** no complete user-facing account deletion/data-erasure or account-wide export workflow was found. Gallery export in `AccountDialog.tsx:117-136` exports one room revision as `.aura.json`.

### Cleanup and operations

- `.github/workflows/cleanup.yml` executes `scripts/cleanup-expired.mjs` using the GitHub secret `FIREBASE_SERVICE_ACCOUNT`.
- The worker removes expired/purge-ready gallery data and Storage assets according to the documented lifecycle.
- **Important unknown:** repository inspection cannot confirm the current validity of the GitHub secret, most recent Action result, or production schedule execution.

## 8. 3D Architecture

### Procedural room renderer

`GallerySceneRenderer` begins at `src/features/gallery/GalleryScene.tsx:3366`.

- Builds White Cube, Nocturne, and Grand Forum geometry procedurally from `GalleryDraft` and template dimensions.
- Creates renderer, scene, PMREM environment, camera, OrbitControls, custom first-person navigation, lighting, materials, artwork meshes, decor, collision, and tours inside one mounted runtime.
- Keeps selection/transform updates synchronized without recreating the renderer/full scene, consistent with the repository invariant.
- Uses OrbitControls for Arrange/Overview and `createFirstPersonWalk()` (`GalleryScene.tsx:2525`) for Walk.
- Builds planar colliders and a reachable path graph; click-to-walk resolves a path around colliders rather than using a navmesh.
- Creates procedural material/detail textures and artwork-following lighting.
- Preserves artwork color using explicit color-space handling and unlit/basic artwork material in the procedural path.
- Uses PMREM/environment/reflection work (`GalleryScene.tsx:2190-2265`) and schedules reflection updates after relevant changes.
- Runs an animation loop only while the scene is considered active; `observeRenderActivity()` (`GalleryScene.tsx:3074`) pauses document-hidden/offscreen scenes.
- Uses adaptive runtime quality and DPR from `features/gallery/scene/runtimeQuality.ts`, including downgrade and recovery behavior.

### Camera and modes

| Mode | Procedural implementation |
|---|---|
| Arrange | Orbit camera plus object/art selection, drag/click placement and wall focus |
| Floorplan/open roof | Orbit/cutaway variant inside same runtime |
| Walk Preview / visitor Walk | custom first-person controller; keyboard, drag, click-floor, touch |
| Overview | OrbitControls with overview/cutaway camera behavior |
| Smart View | cycles calculated room/artwork views |
| Intro | optional `createCinematicIntro()` separate from guided tour |
| Guided Tour | stable poses generated from visible artwork placements and wall normals |

### Authored Danny renderer

`DannyDemoScene` begins at `GalleryScene.tsx:5672`.

- Loads `danny-gallery.glb` or compact `danny-gallery-mobile.glb` (`GalleryScene.tsx:6459-6460`).
- Consumes authored GLB names/extras for colliders, hotspots, views, routes, lighting and anchors.
- Uses the same low-level `createFirstPersonWalk`, OrbitControls, visitor control component, runtime quality utilities, render-activity observer, and intro primitive.
- Keeps a separate scene-loading, camera, smart-view, intro, guided-tour, light-selection, and artwork-focus implementation.
- The Blender → GLB role/naming contract is documented in `blender/EXPORT_CONTRACT.md:13-28`.

### Asset loading

- Procedural rooms generate architecture at runtime and load artwork images from draft/blob/data URLs.
- Published rooms receive their Firestore manifest first, then Storage art is hydrated progressively.
- Danny chooses full/mobile GLB by compact runtime conditions.
- Emil loads the Danny GLB independently rather than sharing the loaded model/runtime with `DannyDemoScene`.

### Mobile and performance systems

- `src/styles/mobileExperience.css` and `src/utils/mobileLayout.ts` control compact editor layout/tool sheet behavior.
- Runtime quality is capability/measurement-based in `features/gallery/scene/runtimeQuality.ts` and is tested.
- Main 3D renderers pause when hidden/offscreen.
- Reduced motion disables or resolves cinematic movement rather than forcing it.
- **Likely issue — verify:** test/build success does not establish consistent frame pacing on target mobile GPUs; device/browser testing remains necessary.

## 9. Builder vs Viewer vs DannyHirschArts

| Capability | Builder / procedural | Published procedural viewer | DannyHirschArts |
|---|---|---|---|
| Core renderer | `GallerySceneRenderer` | same `GallerySceneRenderer` | `DannyDemoScene` |
| Geometry | runtime procedural | published draft → runtime procedural | authored Blender GLB |
| Materials | runtime presets/procedural maps | same | authored GLB materials plus runtime tuning |
| Lighting | preset + artwork-following generated lights | same | authored light metadata/anchors with Danny-specific budgeting |
| Artwork | uploaded/demo images mapped to wall planes | Storage-hydrated images mapped to wall planes | authored hotspots/metadata and embedded/mapped sources |
| Arrange | yes | no | no |
| Walk | Walk Preview | Walk | Walk |
| Overview | editor/visitor variant | yes | yes, authored anchor |
| Guided Tour | generated from artwork geometry | generated from artwork geometry | authored route/view sequence |
| Controls UI | shared `VisitorControls` in Walk Preview | shared `VisitorControls` | shared `VisitorControls` |
| Keyboard | shared `visitorKeyboard.ts` | shared | shared |
| Collision | generated planar obstacles | generated planar obstacles | authored collider nodes converted to collision |
| Intro | procedural optional path | procedural optional path | authored Danny-specific path |
| Mobile asset | same procedural scene, adaptive quality | same | dedicated mobile GLB |

### Why Danny looks better

**Confirmed fact:** Danny has an authored asset pipeline: purpose-built room geometry, explicit model materials, collider nodes, lighting metadata, artwork hotspots, views, routes, and separate full/mobile GLBs. Procedural customer rooms derive generic geometry, materials, lights, collision, and tour stops at runtime from a compact `GalleryDraft`.

**Architectural observation:** Danny's quality advantage is not one missing “shadows” flag. It comes from authored spatial composition, asset-specific materials, light placement, view/camera authoring, and a constrained scene contract. The shared renderer utilities reduce behavioral drift but do not make the asset pipelines equivalent.

**Future recommendation:** if future work brings templates toward Danny quality, migrate one template at a time to the documented GLB contract while preserving editor surface IDs and current persistence compatibility. This was not started here.

## 10. Shared vs Duplicate Systems

### Confirmed shared systems

| System | Shared by |
|---|---|
| `VisitorControls` UI | Builder Walk Preview, published procedural viewer, Danny |
| `visitorKeyboard.ts` semantics/hint | procedural scene, Danny, Emil copy/keyboard handling |
| `VisitorTourState` shape | procedural and Danny UI state |
| `createFirstPersonWalk()` | procedural scene and Danny |
| `createCinematicIntro()` | procedural scene and Danny |
| placement validator | manual placement, drag/click, defaults/curation integration, publish review |
| runtime quality/render activity | procedural and Danny |
| `GalleryRepository` | Discover, publish, viewer, account management |
| draft storage | picker, Studio, published edit handoff/recovery |

### Confirmed duplicated or parallel systems

| Parallel implementation | Evidence | Consequence |
|---|---|---|
| Procedural guided-tour engine vs Danny guided-tour engine | `GalleryScene.tsx:4900-5160` vs `:5984-6310`, `:6802-7135` | shared UI, but pause/step/camera interpolation can drift |
| Procedural scene loader/runtime vs Danny GLB runtime | `GallerySceneRenderer` vs `DannyDemoScene` | intentional asset difference, but duplicated lifecycle/camera code |
| Emil renderer/scene/model loader | `ScrollGalleryStory.tsx:170-914` | third scene lifecycle and duplicate GLB download/control logic |
| Emil final Walk controls | manual key/pointer/touch logic `ScrollGalleryStory.tsx:700-858` | same keys, not the same first-person controller; touch feature set differs |
| Account page implemented through dialog component | `AccountPage` renders `AccountDialog presentation="page"` (`AccountDialog.tsx:730-742`) | account page and modal concerns remain coupled |
| Navigation/routing | direct `location.hash`, `window.location.assign`, anchor hrefs | behavior spread across App/account components |

**Architectural observation:** not every duplication is obsolete. Danny needs authored-scene handling and Emil needs scroll-linked reveal. The risk is duplicated interaction state machines, not the existence of different scene sources.

## 11. Emil Scroll Architecture

### Sequence

The current story has six defined chapters in `ScrollGalleryStory.tsx`/`scrollStoryModel.ts`:

1. Blueprint
2. Foundation
3. Architecture
4. Materials
5. Curation
6. DannyHirschArts finale

`storyFrame()` reveals blueprint, floor, walls, ceiling, details, artwork, lighting and finale over explicit progress bands (`scrollStoryModel.ts:32-52`). `storyCamera()` uses a build path until 0.66, then an orbit that ends at 0.9 (`scrollStoryModel.ts:90-129`). The live final state begins at progress 0.985 (`ScrollGalleryStory.tsx:611-626`).

### Scene construction

- The component loads the same Danny full/mobile GLB used by the demo (`ScrollGalleryStory.tsx:367`).
- It classifies meshes using node names and authored metadata, hides colliders, clones materials, and stages architectural groups.
- It derives a blueprint from geometry edges.
- It uses static Danny finale images only as a loading/fallback poster (`ScrollGalleryStory.tsx:924-933`), not as the final interactive implementation.

### Scroll synchronization and pacing

- The section is intentionally long: `1000svh`/minimum 7,600 px desktop and `1100svh`/minimum 7,800 px compact (`scrollGalleryStory.css:8-9`, `:498-505`).
- Raw progress is `(scrollY - storyTop) / storyTravel` (`ScrollGalleryStory.tsx:634-660`).
- `advanceStoryProgress()` applies exponential smoothing and a per-second maximum advance (`scrollStoryModel.ts:61-83`).
- Normal page scrolling is not prevented; this is scroll-linked, not scroll-hijacked.
- Reduced motion resolves to the completed state.

### Start/end behavior

- At 0.985 the same story canvas enters interactive Walk and holds its visitor camera.
- Scrolling backward below 0.92 exits interactive state and resumes reversible story motion (`ScrollGalleryStory.tsx:663-675`).
- The old extra no-change final travel is explicitly removed in the current calculation comment and implementation (`ScrollGalleryStory.tsx:647-651`).

### Evidence-based risks

- **Confirmed fact:** fast raw scrolling cannot directly jump the rendered playhead because advancement is capped.
- **Likely issue — verify:** the page position can reach the bottom of the sticky section before a heavily rate-limited rendered playhead catches up; mathematical tests cover the model but not perceived synchronization under different wheel/trackpad momentum.
- **Confirmed fact:** final interaction is not the main Danny runtime. It is a separate renderer with manual visitor movement and four touch direction buttons (`ScrollGalleryStory.tsx:1008-1011`).
- **Architectural observation:** the final frame can be visually the Danny room yet still behave differently from `#/demo` because camera/collision/control implementations are not shared end to end.

## 12. Guided Tour Architecture

### Shared visitor surface

`src/features/gallery/VisitorControls.tsx` is the shared menu/control component. It exposes:

- Walk / Overview
- Guided Tour start or skip
- Smart View
- Reset View
- Artworks directory
- tour progress, current stop, previous, pause/resume, next

Builder Walk Preview, published rooms, and Danny render this same component (`GalleryScene.tsx:5415-5425`, `:7225-7235`). `visitorTourState.ts` defines the shared idle/playing/paused contract.

### Procedural tours

- Generated at runtime from visible artwork geometry and wall normals.
- Stable pose list is associated with the current room/draft.
- Camera timing and tour progression are implemented in the procedural renderer around `GalleryScene.tsx:4900-5160`.
- User movement can pause/interrupt the active tour and state is published back to the shared control surface.

### Danny tour

- Uses authored GLB views/routes/hotspots and a Danny-specific tour sequence built around `GalleryScene.tsx:6802-6912`.
- Uses a 45-second authored flow and Danny-specific pose weighting/camera interpolation.
- Publishes the same `VisitorTourState` contract to the same UI, but the engine is separate (`GalleryScene.tsx:5984-6310`, `:7071-7135`).

### Duplication assessment

- **Confirmed fact:** Guided Tours do not currently have a competing second menu component; UI unification has already occurred.
- **Confirmed fact:** the camera/tour engines remain separate for generated versus authored tours.
- **Architectural observation:** this is a data-source difference plus implementation duplication. A later shared tour controller could accept generated or authored poses without forcing the room renderers to become identical.
- **Likely issue — verify:** exact pause/resume/skip/step behavior should still be cross-browser compared between Danny and a published generated room; shared buttons do not guarantee identical state transitions.

## 13. Controls Architecture

### Canonical keyboard mapping

`src/features/gallery/visitorKeyboard.ts:1-29` is the current source of truth:

- W/S — forward/back
- A/D — strafe
- Q or Arrow Up — look up
- **E or Arrow Down — look down**
- Arrow Left/Right — turn

`VISITOR_KEYBOARD_HINT` is `W/S move · A/D strafe · Q/E or ↑↓ look · ←→ turn`.

### E vs R investigation

- **Confirmed fact:** `KeyE` is included in both visitor key and look sets.
- **Confirmed fact:** `KeyR` is absent from the binding.
- **Confirmed fact:** `visitorKeyboard.test.ts:9-15` explicitly asserts E looks down, R is unbound, and the hint says Q/E rather than Q/R.
- **Confirmed fact:** procedural and Danny UI hints import the shared string (`GalleryScene.tsx:35`, `:5557-5562`, `:7246`); Emil does too (`ScrollGalleryStory.tsx:21`, `:1002`).
- **Confirmed fact:** keyboard handling is scoped to a focused canvas in the main first-person runtime and Emil (`ScrollGalleryStory.tsx:799-809`; corresponding focus guard inside `createFirstPersonWalk`).

### Pointer/touch differences

- Main first-person runtime supports drag-to-look and click/tap reachable floor navigation.
- Main visitor UI has shared responsive controls.
- Emil implements its own pointer/touch layer and shows only forward/back/turn touch buttons.
- **Architectural observation:** keyboard semantics are unified; the complete input controller is not.

## 14. AURA Branding Inventory

Repository search found AURA/Aura/aura references across 58 tracked source/config/document files (388 matching lines at this snapshot). Raw count includes internal CSS classes and historical audit prose; it is not a list of 388 user-visible replacements.

### Classification inventory

| Class | Examples | Later treatment |
|---|---|---|
| 1. User-facing branding | `Logo.tsx`; Header `AURA Light Preview`; footer; account labels; publish copy; private-room copy; Danny attribution | Brand migration |
| 2. User-facing terminology | gallery, artwork, artist, exhibition, room, Discover galleries | Product-language decision, not blind brand replace |
| 3. Internal technical naming | `AuraMail`, CSS classes, `aura_role`, `aura-*` utilities/data attributes | Usually retain unless there is a technical reason |
| 4. Persistent data identifier | IndexedDB `aura-gallery-editor`; localStorage prefixes; export format `aura-gallery-export`; Firestore collections and Storage paths | Migration-sensitive; preserve/read old values |
| 5. Route/URL | `#/g`, `#/create`, GitHub legacy path, current `lieuva.com` canonical | Preserve legacy resolution; clean-route work is separate |
| 6. External-service dependency | Firebase project/auth domain, callable names, Function params, App Check, email sender/template, Trigger Email collection | Deploy/config migration; do not rename cosmetically |
| 7. Documentation | README, Firebase setup, audit history, GLB contract, asset licenses | Update current docs; retain historical evidence context |
| 8. Safe rename | visible wordmarks, titles, static copy, manifest name, email body/subject after sender readiness | Low data risk |
| 9. Migration-sensitive rename | callable exports, env params, auth links, Firebase paths, GLB metadata, local keys, export format, IDs | Requires compatibility plan |
| 10. Should remain internally unchanged | deployed Firebase project `virtualartplattform`, existing gallery IDs/URLs, old read formats, `aura_role` contract unless versioned | Avoid outage/data loss |

### User-facing surfaces

- `src/components/Logo.tsx:2`: A monogram, AURA wordmark, “AURA home”.
- `src/App.tsx`: page titles (`:3862-3875`), header, landing, Discover, data notice, Studio success and visitor states.
- `src/features/account/*`: account identity, preview language, aria labels.
- `src/features/landing/*`: story chrome and marketing/plan copy.
- `index.html:7-36`: title, descriptions, `og:site_name`, OpenGraph/Twitter titles/image alt, JSON-LD name.
- `public/site.webmanifest:2-4`: name, short name, description.
- `functions/src/emailTemplates.ts:53-108`: email wordmark, subject, body, CTA and footer.
- `functions/src/index.ts:499-540`: unsubscribe/result page and fallback messages.
- `public/assets/demo/aura-hero-gallery.webp`, favicon/social assets: filename and/or visual brand.

### Internal/persistent surfaces

- npm package name `aura-virtual-art-platform` (`package.json:2`).
- local database/key/export identifiers (`draftStorage.ts:4-10`; `AccountDialog.tsx:122-135`).
- callable names `beginAuraGalleryPublication`, `manageAuraGalleryLifecycle`, etc. (`functions/src/index.ts`).
- Function parameter names `AURA_PUBLIC_APP_URL`, `AURA_REPLY_TO`, `AURA_LEGAL_FOOTER` (`functions/src/index.ts:24-35`).
- GLB extras and data attributes using `aura_*` (`blender/EXPORT_CONTRACT.md:13-28`).
- Blender scripts/files and audit terminology.

### Current brand/domain split

**Confirmed fact:** `index.html` canonical/OG URLs and README production link use `https://lieuva.com/`, while the site name, title, visual wordmark, product strings, manifest, emails, callable names, and data identifiers remain AURA. The domain cutover has already occurred; the rebrand has not.

## 15. AURA → LIEUVA Migration Risk Map

| Risk | Type | Why it is dangerous | Safe direction for later work |
|---|---|---|---|
| Firebase project/config rename | External/data | changing project ID/auth domain/bucket disconnects all existing users/data | retain current Firebase project; brand independently |
| Callable Function rename | External/API | deployed client calls and operations can 404 during rollout | keep old exports or deploy aliases; migrate client after both exist |
| Firestore collection/path rename | Persistent data | breaks rules, indexes, Functions, queries, cleanup and existing records | retain or perform explicit dual-read/migration |
| Storage root/path rename | Persistent media | existing covers/art become unreadable; rules and cleanup are path-coupled | retain old paths; version only new schema if justified |
| Local IndexedDB/localStorage rename | Browser data | silently hides existing drafts/recovery | keep keys or add tested migration with fallback reads |
| Export format/extension rename | User files | old `.aura.json` files become incompatible | accept old format permanently; optionally introduce a new version |
| `aura_role` GLB metadata rename | Asset contract | Danny/future exports fail classification | keep internal contract or support both metadata versions |
| Gallery/share IDs and `#/g` | Public links | published links are durable customer assets | preserve forever or redirect/resolve legacy URLs |
| Auth action links/authorized domains | Identity | verification/reset/OAuth redirect failure | stage LIEUVA copy separately from domain/auth configuration |
| App Check domain/site key | Security | enforcement before correct domain registration blocks legitimate clients | verify registered domains/token metrics before enforcement changes |
| Email identity and links | Lifecycle/legal | sender, reply-to, unsubscribe and verification can mismatch or fail | change template/sender/config as one tested release |
| Cleanup workflow/secret | Data lifecycle | collection/path or credential mismatch leaves expired data/assets | preserve paths and validate dry-run/production Action |
| Static SEO/OG | Brand/SEO | global AURA metadata conflicts with LIEUVA and per-space identity | safe brand update now; dynamic room metadata needs hosting architecture |
| Analytics naming | Measurement | no current implementation to preserve, but new taxonomy can hard-code gallery-only future | introduce neutral event schema after product language decision |

### Separation required later

**Brand migration:** visible logo/wordmark, titles, copy, manifest, social assets, email presentation, current documentation.  
**Technical migration:** Firebase identifiers, paths, schema, Functions, routes, local storage, GLB metadata, operational secrets.  

**Architectural observation:** the LIEUVA launch does not require most technical identifiers to change. Leaving well-encapsulated AURA identifiers internally is lower risk than cosmetic consistency.

## 16. Art-Specific Product Coupling

### Deep domain coupling

| Current concept | Evidence | Broader-product implication |
|---|---|---|
| `GalleryDraft`, `GalleryRecord`, `GalleryRepository` | `types.ts`, `galleryRepository.ts` | “Project/Space” would currently require an adapter or domain migration |
| Required `artist` string | `types.ts:93-101`; `firestore.rules:92-94` | not every architect, brand, university or company uses “artist” |
| Required artwork list | `firestore.rules:108-111`; publish review | current publish contract cannot represent a spatial experience without artwork |
| `Artwork` placement on `WallId` | `types.ts:74-89` | content model assumes framed planar visual work |
| Artwork metadata/directory | App/Danny/VisitorControls | visitor information system is art-specific |
| gallery/exhibition language | routes, UI, emails, SEO, docs | acquisition and activation are art-only in current presentation |
| three gallery templates | `templates.ts` | spatial taxonomy is exhibition-first |
| Discover galleries | `App.tsx:385-530` | discovery taxonomy lacks other project/content types |
| Firestore/Storage identifiers | `galleries`, `galleryArtworks`, `published/...` | internal names are persistent and need not block neutral UI abstractions |

### Reusable foundations already present

- Visibility, ownership, ACL, invitations, revisions, lifecycle, stable sharing and Storage media are not inherently art-specific.
- The `GalleryRepository` interface can later sit behind a neutral application service without immediately renaming backend paths.
- `GalleryDraft` can later be wrapped by or migrated toward a versioned `SpaceProject` with typed content blocks.
- Visitor Walk/Overview/tour infrastructure can represent other spatial presentations if content and authored-space contracts become more general.

### Terminology migration candidates — not changes

| Today | Potential scalable UI term | Constraint |
|---|---|---|
| Gallery / room | Space | existing IDs/collections can remain internal |
| Exhibition | Experience / presentation / project | marketing decision needed; not all are interchangeable |
| Artwork | Content / work / item | placement/render schema must support more than images first |
| Artist | Creator / author / organization | account/profile model currently has only strings, no organization entity |
| Discover galleries | Discover spaces | taxonomy/filtering must exist before promise expands |

**Future recommendation:** preserve art as the initial vertical while introducing neutral application-language aliases above the persistence layer. Do not rename the backend until a versioned content model exists.

## 17. Legacy / Obsolete Architecture Candidates

Nothing in this section is approved for deletion. Each candidate needs reference and runtime verification.

### Confirmed compatibility code — retain

- Legacy `#/create/{template}` project IDs (`App.tsx:247-260`).
- IndexedDB v1/localStorage draft migration (`draftStorage.ts:87-109`, `:162-189`).
- Firestore schema-v1/v2 gallery reads and legacy `galleryArtworks` (`firestore.rules:40-55`, `:289-292`; `firebaseGalleryRepository.ts:273`).
- Existing AURA export identifier and `.aura.json` until a compatible importer/version policy exists.
- Existing `aura_role` GLB metadata used by Danny and the export contract.

### Hidden but reachable domain options — not dead

- `travertine` and `linen` wall types are accepted/renderable for persisted compatibility but not in the current ten-option wall picker (`types.ts:31-43`; `galleryValidation.ts:29`; `App.tsx:2300-2340`).
- `dark-oak` floor is accepted/renderable and may be used by existing/default data but is not in the current ten-option floor picker (`types.ts:44-55`; `galleryValidation.ts:30`; `App.tsx:2345-2400`).
- Decor types such as `monstera`, `gallery-bench`, `floor-vase`, `ficus`, `wood-stool`, and `rope-barrier` remain implemented in rendering, validation, CSS, tests and/or auto-curation even though the visible catalog exposes six curated objects (`types.ts:59-71`; `GalleryScene.tsx:846-1130`; `placementValidation.ts:502-514`; `App.tsx:126-143`). They are not safe deletion candidates.

### Asset candidates requiring verification

- The three template preview files are referenced through a dynamic filename expression (`App.tsx:642`, `:842`); a basename-only static reference scan incorrectly reports them as unused. They are active.
- Danny full/mobile GLBs, finale posters, cover, embedded art, fonts and material maps have code or license references.
- **Confirmed fact:** no production asset was proven unused by this investigation.

### Architecture candidates for later extraction, not deletion

- Routing utilities embedded in `App.tsx`.
- `AccountRooms` embedded in `AccountDialog.tsx` despite also powering a page presentation.
- Procedural and Danny tour engines.
- Emil manual Walk controller.
- Large feature-specific sections embedded in `App.tsx` and `GalleryScene.tsx`.

### Historical documentation

Old audit screenshots/reports contain evidence and should be archived/versioned, not treated as runtime dead assets. They also must not be used as the current source of truth without a date/snapshot check.

## 18. Technical Debt Supported by Evidence

| Finding | Classification | Evidence | Consequence |
|---|---|---|---|
| Application orchestration concentration | Architectural observation | `App.tsx` 3,931 lines | route/product changes have wide blast radius |
| 3D runtime concentration | Architectural observation | `GalleryScene.tsx` 7,257 lines | procedural/Danny shared and separate logic is hard to isolate |
| Tour engine duplication | Confirmed fact | procedural vs Danny blocks in `GalleryScene.tsx` | behavioral drift risk |
| Third 3D runtime in Emil | Confirmed fact | `ScrollGalleryStory.tsx` 1,027 lines | extra renderer/model load/input lifecycle |
| Hash/static routing | Confirmed fact | `App.tsx:242-269`; `vite.config.ts:8` | no server-specific room title/OG/canonical; unknown routes become home |
| Static global SEO metadata | Confirmed fact | `index.html:7-36` | every shared gallery receives the same base document metadata |
| No telemetry/RUM | Confirmed fact | no SDK/events in source/package | publish funnel, runtime failure and 3D device quality are not observable |
| Account page/dialog coupling | Confirmed fact | `AccountPage` wraps `AccountDialog` page presentation | management IA remains tied to modal implementation |
| Mixed server/client trust path | Architectural observation | Function permit for create; client/rules transaction for update | two publication paths must remain behaviorally aligned |
| Manual operation dependencies | Confirmed fact | Firebase rules/index/Functions/email/App Check/cleanup workflow docs | repository green does not prove deployed environment parity |
| Current legal notice scope | Confirmed fact | `MvpDataNotice` and copy describe preview limitations | no complete privacy policy, terms, imprint/controller identity, account deletion/export suite found |
| Art-specific schema | Confirmed fact | required `artist`, artwork count, wall placement | broad LIEUVA direction needs a versioned abstraction, not copy-only changes |
| README material count stale | Confirmed fact | README says five/five/three; UI has ten/ten/five | setup/product documentation understates current product |
| Firebase setup URL stale | Confirmed fact | `FIREBASE_SETUP.md:66-71` points at legacy Pages URL; function default is `lieuva.com` | operator may configure wrong verification/action URL |
| Bundle size | Confirmed build output | Firebase/Three chunks around 615/680 kB raw | requires measured prioritization, not arbitrary feature removal |

## 19. Documentation vs Reality

### AGENTS.md

| Statement | Reality |
|---|---|
| Preserve draft, undo/redo, save state, publish validation | **Implemented:** local versioned projects, recovery, history, status and blocking review exist |
| Two primary experiences Arrange and Walk Preview | **Implemented:** same procedural runtime supports both; Overview/cutaway supports arrangement/visit |
| Shared placement validator | **Implemented:** placement and publish review use shared editor validation modules |
| Danny reference | **Accurate:** Danny remains authored and technically separate but shares visitor primitives |
| Progressive loading/adaptive quality | **Implemented in current code:** manifest-first artwork hydration, runtime quality and render activity pause |
| Blender runtime contract | **Partially future-facing:** contract exists; three customer templates remain procedural |

### README.md

- **Outdated:** `README.md:27` says five wall finishes, five floor choices and three ceiling systems. The current Studio exposes ten wall, ten floor and five ceiling choices (`App.tsx:2300-2430`).
- **Incomplete:** route list at `README.md:117-125` omits the implemented `#/account` route and Firebase query action precedence.
- **Accurate:** published media uses Storage, metadata/ACL/lifecycle uses Firestore, edits preserve ID/share URL, and schema-v1/v2 remains readable (`README.md:171-178`, `:245-248`).
- **Accurate:** procedural templates vs authored Danny distinction (`README.md:163`).
- **Point-in-time only:** statements about deployed services cannot be confirmed solely from checked-in code.

### FIREBASE_SETUP.md

- **Outdated:** `FIREBASE_SETUP.md:66-71` still instructs `AURA_PUBLIC_APP_URL` and redirect use of the legacy GitHub Pages path, while `functions/src/index.ts:24-26` defaults to `https://lieuva.com` and `index.html` canonicalizes that domain.
- **Accurate in code contract:** Auth providers, Storage/Firestore split, App Check variable, core function names, immutable revision assets, ACL and lifecycle architecture.
- **External unknown:** whether every rule/index/function/extension/parameter is currently deployed exactly as documented.

### Existing audit documents

- `audit/UI-UX-3D-AUDIT.md` is a backlog/acceptance reference, not current implementation truth. Several earlier consistency and P0 items are already implemented.
- `audit/IMPLEMENTATION-STATUS.md` describes the account-page and earlier improvements accurately in broad terms but reports an older test count (current: 126 root tests).
- `audit/FULL-PRODUCT-EXPERIENCE-AUDIT.md` is dated 16 August 2026 and records 123 tests plus the legacy live URL. Current repository verification found 126 tests and current canonical/domain references use `lieuva.com`.
- `audit/final/browser-qa.md` is historical browser evidence; it is not a current 23 August live-browser run.

### Undocumented or under-documented current behavior

- Manifest-first progressive artwork hydration in the published viewer (`App.tsx:3655-3687`).
- Unknown hash fallback to Landing rather than a 404.
- Exact split between Function-permitted creation and client-transaction revision update.
- Dynamic hidden compatibility material/decor values not offered in the current picker.
- Emil's separate final Walk runtime and control differences.
- Absence of analytics/observability despite planned analytics copy.

## 20. Important Unknowns

These cannot be answered reliably from repository evidence alone:

1. **Deployment parity:** whether current Pages files, Firestore rules, Storage rules, indexes and every core/email Function match this checkout.
2. **External email state:** Trigger Email extension, verified sender/domain, SMTP/Resend configuration, Function parameters and actual delivery/reputation.
3. **App Check production state:** reCAPTCHA Enterprise key/domain registration, enforcement metrics, debug-token leakage, and valid-token rates.
4. **Cleanup state:** current `FIREBASE_SERVICE_ACCOUNT` validity, last successful scheduled cleanup and orphan count.
5. **Existing data distribution:** counts by schema version, retention, visibility, stale revision, missing storage object, and legacy asset path.
6. **End-to-end ACL behavior:** owner/editor/viewer tests with two real verified accounts, invite acceptance, revoke, private access and concurrent stale updates.
7. **Real device performance:** mobile Safari/Chrome GPU classes, memory pressure, thermal throttling, image-heavy Forum rooms and aggressive Emil scroll.
8. **Accessibility in the live browser:** focus order, screen reader naming, zoom, reduced motion and touch target verification across all routes.
9. **Legal/operator inputs:** controller identity, address, support contact, lawful basis, retention schedule, deletion/export obligations, terms and content policy.
10. **LIEUVA product taxonomy:** whether “PLACE” is a feature/category/tagline, how non-art content is represented, and what first non-art vertical is in scope.
11. **Brand assets:** final LIEUVA wordmark, monogram, favicon/social card, trademark clearance and naming/SEO validation.
12. **Clean URL/hosting decision:** whether GitHub Pages/hash routing remains or a server/edge platform will provide per-space HTML metadata.
13. **Analytics consent/taxonomy:** provider, consent model, retention and neutral event naming.
14. **Asset provenance completion:** formal permissions/licenses for every demo/model/material beyond the current repository notice.

## 21. Audit Readiness

### Is the architecture sufficiently understood?

**Yes for Step 2 planning.** The route graph, customer journey, state ownership, local/cloud persistence, security paths, builder/viewer/Danny renderers, Emil Scroll, tours, controls, brand surfaces and compatibility risks are now mapped to current code.

### What is ready to audit next

- Full UI/UX and product journey at desktop/mobile dimensions.
- Live account/publish/edit/update/invite/lifecycle verification using controlled test data.
- LIEUVA brand migration plan separated into safe brand changes and migration-sensitive technical changes.
- Broader “spatial presentation” information architecture and terminology evaluation.
- Performance profiling against the three procedural templates, Danny and Emil.
- SEO/name/domain/clean-route strategy grounded in the current static/hash limitation.

### Preconditions for evidence-grade Step 2

1. Use this repository snapshot or record any new commit/diff before testing.
2. Establish which Firebase rules/indexes/Functions are actually deployed.
3. Prepare two verified test accounts for owner/editor/viewer and private-room tests.
4. Define target desktop/mobile browsers and at least one real lower-tier mobile device.
5. Avoid renaming persistent identifiers during the visual LIEUVA work.

### Final readiness verdict

**Confirmed fact:** the repository is linting, testing and building successfully at this snapshot.  
**Architectural observation:** the product is coherent enough for a deep Step 2 audit, but production integrations and real-device behavior still require external verification.  
**Migration conclusion:** LIEUVA can be introduced first as a controlled presentation/brand layer while preserving AURA-named backend, local-storage, route and GLB contracts until explicit compatibility migrations are designed.
