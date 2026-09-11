# LIEUVA

LIEUVA is a browser-based platform for building, publishing and exploring walkable 3D exhibitions. The product includes LIEUVA Studio, three authored room templates, public and protected Space delivery, Discover, Creator profiles and a Firebase-backed publishing lifecycle.

Live product: [lieuva.com](https://lieuva.com/)

> **Compatibility firewall:** LIEUVA is the customer-facing brand. Existing AURA/gallery identifiers in Firebase, Storage, callable Functions, local persistence, `.aura.json`, routes and GLB `aura_*` metadata are active compatibility contracts. Do not rename them without a migration plan and regression coverage.

## Current state

- Three templates: White Cube, Warm Gallery (technical ID `nocturne`) and Grand Forum (`pavilion`).
- Arrange and Walk Preview share one Three.js scene and camera session.
- Artwork upload, placement, framing, transforms, undo/redo, versioned local recovery and publish review are active.
- The homepage contains the reversible 20-second room sequence with three floor and three wall comparisons, plus reduced-motion and mobile behavior.
- `public/assets/templates/premium-v3/` is the only shipping template-runtime generation. Older exports remain recoverable from Git; editable `.blend` sources and 4K masters remain in `blender/production/`.
- The Danny Hirsch exhibition remains the visitor-quality and metadata reference.
- The repository is suitable for a controlled production pilot, not unrestricted public uploads. External launch conditions are listed in [current state](./audit/CURRENT-STATE.md).

## Toolchain and setup

Use the pinned versions from `.nvmrc`, `package.json` and CI:

- Node.js `22.23.2`
- npm `10.9.8`
- Java `21.0.12+101` only for Firebase rule-emulator tests

```bash
npm ci
npm run dev
```

Vite prints the local URL, normally `http://localhost:5173/`. Do not open `index.html` through `file://`.

Install the other locked workspaces only when needed:

```bash
npm ci --prefix functions
npm ci --prefix firebase-cli --ignore-scripts --no-audit --no-fund
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite. |
| `npm run check` | Lint, unit tests, script tests, premium-GLB validation, production build and performance budgets. |
| `npm run check:functions` | Test, type-check and build Firebase Functions. |
| `npm run test:firebase-rules` | Run Firestore and Storage authorization matrices in emulators. |
| `npm run build` | Type-check and build `dist/`, then prepare the generated Functions app shell. |
| `npm run test:browser-smoke` | Test the built public shell, story, Studio handoff, all rooms and mobile editing in Chromium. |
| `npm run check:ci` | Run the complete local CI-equivalent gate; requires Functions/Firebase dependencies, Java and Chromium. |
| `npm run validate:glb -- path/to/file.glb` | Validate the generic Blender/legacy metadata contract. |
| `npm run validate:premium` | Validate all six shipping premium-v3 GLBs without changing tracked files. |
| `npm run validate:premium:update` | Intentionally refresh the tracked GLB measurement report. |
| `npm run clean:generated` | Remove builds, diagnostics, caches and Blender backups; keeps dependencies, `.env` files, sources and assets. |

Run `npm run build` before an isolated browser-smoke run. Install Chromium once with `npm run test:browser-smoke:install`.

## Repository map

```text
src/
  App.tsx                         app shell, lightweight routing, Studio orchestration
  features/gallery/              Three.js scene, editor, placement and visitor runtime
  features/landing/              homepage story and discovery entry points
  features/creator/              Creator Hub, directory and public profiles
  features/account/              authentication, account and access management
  services/                      drafts, Firebase boundary, publishing and telemetry
  styles/                        shared, mobile and visitor styles
functions/
  src/index.ts                   exported callable/HTTP Functions
  src/                           publication, identity, rights, policy, SEO and observability modules
tests/
  browser-smoke/                 portable Playwright journeys
  firebase-rules/                emulator authorization matrices
public/assets/                    files copied into the deployed web root
blender/production/v3/           current editable room sources, maps and retained masters
blender/production/v1,v2/        retained historical editable sources and v1 masters
scripts/                          build, validation, release and operator tools
audit/                            current state and durable operational specifications only
```

The largest implementation files are `src/App.tsx`, `src/features/gallery/GalleryScene.tsx` and `functions/src/index.ts`. Extract from them incrementally behind existing behavior tests; do not rewrite the renderer or change exported Function names as a cleanup shortcut.

## Product and data contracts

- Drafts are local and account-free. Publishing requires a verified Email/Password or Google account.
- Public, unlisted and private Spaces use the existing `galleries/{galleryId}` identity. Owner/Editor/Viewer access is stored separately.
- Published media uses immutable owner/revision-scoped Storage paths. Updates preserve the Space ID and share URL.
- New records use the current schema; schema-v1/v2 records remain readable.
- The same placement validator must govern click, drag, sliders, curation, restore and publish.
- Invalid transforms must fail transactionally: mesh, React state and persisted state may not diverge.
- Renderer, controls, PMREM environment and full scene must survive selection, transform and mode-only changes.
- Adaptive DPR, progressive loading, reduced motion, keyboard scope, WebGL fallbacks and non-WebGL artwork access are first-class behavior.

Canonical public delivery is `/spaces/{galleryId}`. Compatibility entry points and technical IDs remain active:

- `#/create` and `#/create/{white-cube|nocturne|pavilion}`
- `#/create/{template}/demo`
- `#/demo` for the Danny reference
- `#/g/{galleryId}` as the legacy Space entry
- `#/data` for data/right notices
- Firebase Auth action query parameters such as `?mode=verifyEmail&oobCode=…`

Clean customer URLs do not authorize renaming `galleries`, `galleryId`, Storage paths, callable names, local draft keys or GLB `aura_*` fields.

## Assets and Blender

- Runtime assets belong in `public/assets/`; every file there is copied into builds and deployments, so it must have a real runtime reference.
- Original/provenance files belong in `blender/`; current exports are rebuilt with `blender/production/build_premium.py` and validated with `npm run validate:premium`.
- Keep primary `.blend` files, source material studies, current runtime maps and retained 4K masters. Do not commit `.blend1`, logs, caches, exploratory renders or duplicate old GLBs.
- Record source and license changes in [ASSET_LICENSES.md](./ASSET_LICENSES.md). The Danny assets have project-specific permission, not a general redistribution license.
- See [Blender export contract](./blender/EXPORT_CONTRACT.md) and [production instructions](./blender/production/README.md).

## Firebase and release safety

The production target is Firebase Hosting plus the scoped Functions exported by `functions/src/index.ts`. `.github/workflows/deploy.yml` is the production workflow. Firestore rules, Storage rules and indexes require their separate reviewed policy release.

Do not deploy, publish fixtures, mutate production data or alter rules while doing local verification unless the user explicitly requests it. Deployment order, required variables, preview checks, rollback and operator procedures are in [FIREBASE_SETUP.md](./FIREBASE_SETUP.md).

## Documentation sources of truth

- [AGENTS.md](./AGENTS.md): default rules for future Codex work.
- [audit/CURRENT-STATE.md](./audit/CURRENT-STATE.md): current product boundary, open risks and maintenance priorities.
- [audit/README.md](./audit/README.md): retained audit/operations index and evidence policy.
- [FIREBASE_SETUP.md](./FIREBASE_SETUP.md): Firebase setup, deployment and rollback.
- [ASSET_LICENSES.md](./ASSET_LICENSES.md): asset provenance and rights.
- [blender/EXPORT_CONTRACT.md](./blender/EXPORT_CONTRACT.md): Blender-to-GLB contract.

Update these sources in the same change when behavior, architecture, schemas, release steps or assets change. Test output, screenshots and temporary reports belong in ignored `artifacts/`, not in permanent project documentation.

This repository has no general code license. Do not infer reuse rights from repository access.
