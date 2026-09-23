# LIEUVA

LIEUVA lets people create, publish and explore walkable 3D exhibitions. It includes Studio, three authored templates, local drafts and recovery, public/private Space delivery, Discover, Creator profiles, and Firebase-backed publication.

Live product: [lieuva.com](https://lieuva.com/)

## Fast orientation

- **Studio:** Arrange and Walk Preview share one Three.js scene. The three current templates are White Cube, Warm Gallery (`nocturne`) and Grand Forum (`pavilion`).
- **Delivery:** published Spaces keep the existing `galleries/{galleryId}` identity; clean delivery is `/spaces/{galleryId}`. Legacy AURA/gallery names remain contracts.
- **Bespoke demos:** Obsidian, Sculpture Pavilion and Forest Fold House are read-only, lazy-loaded showcases. They are not Studio templates or Firebase publications.
- **Pilot boundary:** the product is a controlled production pilot. Current launch risks and priorities are in [current state](./audit/CURRENT-STATE.md).

## Toolchain and common commands

Use Node `22.23.2` and npm `10.9.8`. Firebase rule tests also need Java `21.0.12+101`.

```bash
npm ci
npm run dev
```

| Command | Use |
| --- | --- |
| `npm run check` | Default client quality gate: lint, tests, GLB validation, build, budgets. |
| `npm run check:functions` | Functions type, test, build and release-manifest gate. |
| `npm run test:firebase-rules` | Firestore and Storage rules in emulators. |
| `npm run test:browser-smoke` | Built Chromium journeys. |
| `npm run test:browser-visual` | Reviewed visual baselines at desktop and mobile sizes. |
| `npm run test:browser-cinematic` | GPU qualification for bespoke flights and guided tours at desktop/mobile sizes. |
| `npm run check:ci` | Full local CI-equivalent gate; needs Java and Chromium. |
| `npm run validate:premium` | Validate current Studio GLBs without changing reports. |
| `npm run clean:generated` | Remove reproducible builds, diagnostics and Blender scratch files. |

Run `npm run build` before an isolated smoke run. The four expensive Forest/Sculpture GPU walkthroughs are advisory in hosted CI by owner decision; their route, lazy-loading and asset dependency checks remain blocking. Local smoke still runs all journeys.

## Repository map

```text
src/features/gallery/  Three.js scene, Studio editor, placement and visitor runtime
src/features/landing/  Homepage story and showcase entry points
src/features/{account,creator,demo}/  Account, profiles and Danny reference
src/services/          Drafts, Firebase boundary, publishing and telemetry
functions/src/         Callable/server delivery, lifecycle, policy and access modules
tests/                 Playwright smoke and Firebase rule matrices
public/assets/         Referenced deployment assets only
blender/production/v3/ Current Studio sources, maps and retained masters
blender/showcases/     Independent Obsidian, Sculpture and Forest sources
scripts/               Build, validation, release and operator tools
audit/                 Indexed durable contracts and current risks
```

The largest modules are `src/App.tsx`, `src/features/gallery/GalleryScene.tsx` and `functions/src/index.ts`. Extract them only behind existing behavior coverage; do not use a renderer rewrite or Function-name migration as cleanup.

## Core contracts

- Drafts are local and account-free. Publishing, revisions and immutable media paths preserve the existing gallery identity.
- Guest publication uses the same server permit, App Check, quota and ownership boundary as accounts. Its Explore period and direct-link retention are distinct contracts.
- Visibility, review, Creator attribution, search indexing, access roles and lifecycle rules are server-owned. `discoverEligible` is never a client toggle.
- Placement, navigation and accessibility must work on desktop and mobile, with reduced-motion and non-WebGL fallbacks.
- Runtime assets require a real reference. Keep primary Blender sources and licensed originals; do not commit caches, backup blends, traces or duplicate generated outputs.

## Read only when relevant

| Need | Source |
| --- | --- |
| Working conventions and document routing | [AGENTS.md](./AGENTS.md) |
| Current boundary and open launch work | [audit/CURRENT-STATE.md](./audit/CURRENT-STATE.md) |
| Audit/operations contract index | [audit/README.md](./audit/README.md) |
| Firebase setup, release and rollback | [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) |
| Asset provenance | [ASSET_LICENSES.md](./ASSET_LICENSES.md) |
| Studio Blender/GLB contract | [blender/EXPORT_CONTRACT.md](./blender/EXPORT_CONTRACT.md) |
| Bespoke render/showcase contract | [blender/showcases](./blender/showcases/) |
| Guided visits, house flight and three-world homepage film | [showcase direction](./src/features/showcase/README.md) |

Do not deploy, publish fixtures, mutate production data or alter rules during local verification without explicit user authorization.
