# LIEUVA — Immersive 3D presentation platform

LIEUVA is a browser-based platform for creating, publishing, sharing and discovering immersive 3D presentations. This repository contains the current MVP: LIEUVA Studio, three Space templates, a visitor experience, Discover, account access, and a Firebase publishing lifecycle.

> **Compatibility firewall:** LIEUVA is the visible brand. Existing AURA/gallery identifiers in Firebase, Storage, callable Functions, local persistence, `.aura.json`, routes and GLB metadata are intentional compatibility contracts and must not be casually renamed.

Live MVP: [lieuva.com](https://lieuva.com/)

> **MVP status:** LIEUVA is a concept-validation product, not yet a production marketplace. Read [Security, privacy, and current limitations](#security-privacy-and-current-limitations) before inviting public uploads.

## What the MVP includes

- A premium landing page, featured Danny Hirsch exhibition, and Discover carousel.
- Exactly three selectable gallery spaces:

  | Space | Character | Artwork capacity |
  | --- | --- | ---: |
  | The White Cube | Luminous, minimal hall | 8 |
  | Nocturne | Intimate, dramatic chamber | 8 |
  | The Grand Forum | 40 × 60 m, five connected galleries | 14 |

- Browser uploads for JPG, PNG, WebP, and browser-decodable HEIC/HEIF images.
- An instant White Cube sandbox with three documented fictional demo artworks, no upload or account required.
- Visual wall selection, automatic free-slot placement, click-to-place, direct dragging, precision sliders, exact displayed dimensions, framing, lock/hide, left/centre/right alignment, and even spacing across one wall.
- Persistent local autosave and refresh recovery, undo/redo, transactional placement validation, and a pre-publish geometry review.
- Separate **Arrange** and **Walk Preview** modes, plus open-roof and finished-ceiling inspection without rebuilding the WebGL renderer.
- Reset View restores a dependable composition; entering Walk Preview starts in front of the selected visible artwork when one is selected.
- The Grand Forum includes a five-zone floor-plan navigator for its central axis and four connected galleries.
- Five wall finishes, five current floor choices, three ceiling systems, and three lighting presets.
- Seven decorative object types, with up to eight object placements in a published gallery.
- A local **AI Curator** that analyzes image color palettes in the browser and proposes a different layout, atmosphere, and object arrangement. It does not send artwork to an external AI API.
- Cinematic gallery introductions, 1.75 m visitor eye height, walk and overview modes, artwork information cards, an accessible text-first artwork directory, and click-to-walk navigation.
- The Danny Hirsch reference offers an optional 45-second guided tour, authored Smart Views, Reset View, exact GLB artwork metadata, and an automatic artwork-directory fallback when WebGL is unavailable.
- Discover keeps the Danny reference exhibition visible when the live community feed is empty or unavailable.
- Account-free building and Walk Preview; publishing uses verified Email/Password or Google accounts with public, unlisted, or private account-preview rooms.
- Owner, Editor, and Viewer ACL records. Owners and Editors can update room content under the existing share URL; only Owners manage access and deletion.
- A separate optional LIEUVA Preview Letter opt-in for Email and Google accounts, with one welcome edition, account-level withdrawal, and one-click unsubscribe. Branded verification/newsletter delivery requires the documented Cloud Functions and SMTP extension setup.
- Clear **LIEUVA Light Preview** status throughout account, picker, publishing, and plan surfaces; future paid professional tools remain visibly planned and inactive.

## Requirements

- [Node.js](https://nodejs.org/) 22.13 or newer
- npm
- A current desktop or mobile browser with WebGL and hardware acceleration enabled
- A Firebase project only when testing publication and Discover
- Blender only when inspecting or regenerating the non-runtime concept files

## Quick start

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173/`.

Do **not** double-click `index.html` or open it with a `file://` URL. A Vite application must be served by the development server or from a production build.

To verify a production build locally:

```bash
npm run lint
npm run build
npm run preview
```

`npm run preview` normally serves the built application at `http://localhost:4173/`.

## Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server with hot reload. |
| `npm run lint` | Run ESLint across the project. |
| `npm test` | Run the editor, placement, review, storage, and runtime-quality tests. |
| `npm run build` | Type-check the app, create `dist/`, and prepare the generated HTML shell used by privacy-aware Space delivery. |
| `npm run preview` | Serve `dist/` locally for production verification. |
| `npm run check` | Run lint, all tests, type-checking, and the complete production build; this is the deployment quality gate. |
| `npm run check:functions` | Test and type-check the trusted branded-email/newsletter Functions. |
| `npm run validate:glb -- path/to/template.glb` | Validate a future template export against the documented legacy `aura_*` GLB contract. |

The WP5 production target is Firebase Hosting plus the repository's three public delivery Functions. The existing GitHub Pages workflow remains available as a reviewed rollback/legacy-host path and is not the clean-URL production architecture.

## Editor workflow

The intended creation flow is:

**Choose gallery → Upload artwork → Place or auto-curate → Customize → Publish → Share**

1. Choose one of the three spaces.
2. Upload one or more artwork images.
3. Select an artwork in the left panel.
4. Choose a wall; the camera moves to it and LIEUVA Studio finds an available position.
5. Click the wall for an exact location, drag the artwork directly, or use the fine-placement sliders.
6. Use the translucent side arrows to rotate around the room, or use the numeric metre controls, 3 cm placement grid, exact centimetre readout, framing, lock/hide, alignment, 1.75 m eye-line, and **Space this wall** actions.
7. Use **Reset view** whenever orientation is lost. In the Grand Forum, use the five-zone floor-plan navigator to jump between the central axis and four side galleries.
8. Keep **Arrange** and **Open roof** enabled while editing, then enter **Walk Preview** and **Preview ceiling** to inspect the visitor experience. The same canvas and camera session stay alive; a selected visible artwork becomes the Walk Preview start focus.
9. Add and position objects by dragging them or clicking an empty floor location.
10. Optionally run **AI Curator**. Re-running it intentionally produces a new proposal, and its result can be undone during the current editing session.
11. Open **Review & publish**. LIEUVA validates every visible work and object, shows the captured share cover, blocks invalid geometry, and publishes only after the review passes.

Drafts autosave per template in IndexedDB. Direct template routes survive refresh and offer recovery before editing continues.

## Visitor controls

| Context | Controls |
| --- | --- |
| Walk mode | `W`, `A`, `S`, `D` or arrow keys to move and turn; drag to look; click the floor to walk automatically. |
| Artwork | Click an artwork to open its information card; it closes when the visitor turns away. |
| Overview | Orbit the room, zoom with the mouse wheel or a supported pinch gesture, and use the fading cutaway walls to inspect the interior. |
| Cinematic intro | Allow the room-specific camera path to finish or use the on-screen skip control. |
| Danny guided tour | Start or skip the optional 45-second authored tour; use **Focus view** to cycle exhibition anchors and **Reset view** to return to the authored start. |
| Accessible directory | Open **Artworks** for images, metadata, and descriptions without navigating the canvas. It opens automatically if WebGL fails. |

Touch behavior depends on the browser and device. If a HEIC/HEIF image cannot be decoded, convert it to JPG, PNG, or WebP and upload it again.

## Routing and clean-Space delivery

Published Spaces use one durable customer URL backed by their existing publication ID:

- `/spaces/{gallery-id}` — canonical published Space URL

All new share and Discover links use the canonical `https://lieuva.com/spaces/{gallery-id}` form. Title, Creator and revision changes keep the same URL. Firebase Hosting rewrites direct requests to a privacy-aware HTTP Function, which returns route-specific initial metadata and then boots the normal React visitor application.

Existing product areas keep their compatibility hash routes:

- `#/` — landing page and Discover
- `#/create` — gallery picker and editor
- `#/create/{white-cube|nocturne|pavilion}` — persistent editor route for one template
- `#/create/{white-cube|nocturne|pavilion}/demo` — instant sandbox preloaded with three fictional demo artworks
- `#/demo` — Danny Hirsch live demo
- `#/g/{gallery-id}` — legacy published-Space entry; resolves the same ID and replaces it with the clean canonical URL
- `#/data` — factual MVP data and rights notice
- `?mode={verifyEmail|resetPassword}&oobCode=…` — Firebase account action handler; query parameters precede the hash route

The default production build uses root-relative assets for Firebase Hosting and direct clean-route refreshes. Setting `LEGACY_GITHUB_PAGES=true` creates the relative-base rollback bundle used by the retained Pages workflow.

## Architecture

```text
src/
├── App.tsx                         Routes, landing page, editor, publishing UI
├── components/AppErrorBoundary.tsx Global crash recovery for lazy/3D failures
├── components/Logo.tsx            Shared brand mark
├── features/gallery/
│   ├── GalleryScene.tsx            Three.js rooms, editor interaction, visitor controls
│   ├── autoCurator.ts              Local palette analysis and automatic curation
│   ├── editor/                      Draft defaults/history, placement and publish review
│   ├── scene/                       Adaptive quality and shared collision runtime
│   ├── templates.ts                Runtime room metadata and capacities
│   └── types.ts                    Gallery domain types
├── services/
│   ├── draftStorage.ts             Versioned IndexedDB autosave and recovery
│   ├── firebaseGalleryRepository.ts Lazy-loaded Firebase implementation
│   ├── galleryRepository.ts        Lightweight persistence boundary
│   └── galleryValidation.ts        Runtime validation for public Firestore data
└── styles/global.css               Application and responsive styling

functions/
├── src/index.ts                    Trusted product APIs plus Space HTML/card/sitemap delivery
├── src/spaceSeo.ts                 Privacy-aware metadata, cache and sitemap policy
└── src/emailTemplates.ts           Responsive LIEUVA transactional and welcome emails

public/assets/                      Runtime demo and material assets
blender/templates/                  Editable concept/reference Blender files
blender/EXPORT_CONTRACT.md          Blender-to-GLB node and metadata contract
scripts/cleanup-expired.mjs         Scheduled physical Firestore cleanup
scripts/validate-glb-contract.mjs   Template-export contract validator
.github/workflows/                  Pages deployment and expiry cleanup
```

The three builder rooms are generated procedurally in `GalleryScene.tsx`; marketing copy states this honestly. The Danny reference exhibition is an authored Blender GLB. [`blender/EXPORT_CONTRACT.md`](./blender/EXPORT_CONTRACT.md), `blender/create_templates.py`, and the validator define the path for replacing procedural rooms with exported GLBs without pretending that migration is already complete.

The Danny demo ships a full desktop GLB and a metadata-equivalent mobile derivative with reduced geometry and texture sizes. Runtime quality detection selects the derivative on low-tier devices and Meshopt decoding uses Web Workers. See [`public/assets/demo/README.md`](./public/assets/demo/README.md).

The repository boundary in `galleryRepository.ts` keeps persistence separate from the editor, so authentication, storage, accounts, or another backend can be introduced without coupling them to the Three.js renderer.

## Publishing and data flow

1. Artwork is decoded in the browser, resized to at most 1200 px on its longest side, converted to WebP, and compressed until its data URL is below the configured 780,000-character limit.
   Same-origin artwork bundled with the fast sandbox is embedded before publication as well.
2. Draft building and Walk Preview remain local and account-free. Publishing restores a verified Email/Password or Google account.
3. A trusted callable Function issues a short-lived, quota-checked publication permit. Artwork images and the room cover are then uploaded to immutable owner-scoped Firebase Storage objects. In-place edits create a new asset revision and atomically update the same schema-v3 gallery document, preserving its share URL. Existing schema-v1/v2 rooms remain readable.
   Hidden works and editor-only lock state are omitted from the public record; visitor-facing frame choices are preserved.
4. New verified-account rooms currently receive a 365-day account-preview window. Billing and permanent hosting are not active; older guest rooms retain their original expiry for compatibility.
5. Firestore and Storage rules enforce expiry and visibility. Discover queries only public rooms; unlisted rooms require the link; private rooms require the owner or an invited verified email.
6. ACL documents store editor/viewer membership separately from the public gallery record. Archive hides a room without deleting it; Trash provides seven days to restore. The scheduled cleanup Action removes expired or purge-ready assets, ACL records, and documents.
7. Trusted Cloud Functions generate verification action links, persist optional newsletter consent, and queue branded messages into the official Trigger Email extension's protected `mail` collection. The welcome edition is idempotent per account; users may withdraw in Account settings or through a one-click link.

Firebase Storage requires Blaze as of February 2026, although no-cost quotas still apply. See [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) for bucket, rules, CORS, email delivery, Functions, consent, cleanup, quotas, and verification.

### Firebase web configuration

The Firebase web-client configuration currently lives in `src/services/firebase.ts` and targets the `virtualartplattform` project. Firebase web API keys and project identifiers identify the client application; they are not service-account credentials and are expected to be visible in a browser bundle.

To use another Firebase project, replace that web configuration and the default project in `.firebaserc`, then deploy the repository's rules and indexes to the new project. Never place a service-account JSON or private key in source code.

## Deploy the clean-URL architecture

Do not cut production DNS before the preview checks in [`FIREBASE_SETUP.md`](./FIREBASE_SETUP.md) pass. The reviewed deployment unit is the built site plus `spaceDocument`, `spaceCard`, and `spaceSitemap` in the same Firebase project:

```bash
npm run check
npm run check:functions
```

During the separately approved external preview window, deploy the three new Functions first, then create the Hosting preview channel that rewrites to them. Exact commands/order, raw-HTTP checks, DNS handoff and rollback are documented in `FIREBASE_SETUP.md` and `audit/CLEAN-SPACE-URL-SEO-IMPLEMENTATION.md`.

Clean customer URLs do not imply renamed Firebase/data identifiers. `galleries`, `galleryId`, Storage paths, callable names, `.aura.json`, local draft keys and GLB `aura_*` metadata remain compatibility contracts.

## Legacy GitHub Pages rollback

1. Push the repository to GitHub with the application on `main`.
2. Open **Repository Settings → Pages**.
3. Under **Build and deployment**, select **GitHub Actions** as the source.
4. Push a commit to `main`, or manually run **Actions → Deploy to GitHub Pages → Run workflow**.
5. Confirm every step is green and open the URL shown by the deployment job.

`.github/workflows/deploy.yml` installs the locked dependencies with `npm ci`, builds `dist/`, uploads the Pages artifact, and deploys it. Firestore rules remain a separate manual Firebase Console step. Do not configure Pages to publish the repository root or the unbuilt `main` branch.

Before presenting a deployment, verify:

```bash
npm run lint
npm run build
```

Then test the landing page, all three room editors, the Danny demo, one publication, the resulting share link in a private browser window, and its Discover card.

The Pages workflow sets `LEGACY_GITHUB_PAGES=true`, preserving the previous repository-subpath asset behavior. It cannot provide per-Space raw metadata, dynamic cards or privacy-aware status codes and is therefore a rollback path, not the WP5 production target.

## Troubleshooting

### The page is white on GitHub Pages

- Confirm Pages uses **GitHub Actions**, not `main / (root)`.
- Open the latest deployment in the Actions tab and confirm the build and deploy jobs succeeded.
- Use `https://lieuva.com/` for the production site. The legacy GitHub Pages repository URL may still include `/VirtualArtPlattform/`.
- Hard-refresh after a deployment and inspect the browser console/network panel for missing JavaScript or asset files.

### `localhost:5173` is not running

Run `npm ci` once, then keep `npm run dev` running in the terminal. Opening `index.html` directly cannot start Vite.

### Publishing reports `permission-denied`

- The room itself is still autosaved locally. This error concerns Firestore publication, not the IndexedDB draft.
- Enable Anonymous, Email/Password, and Google Authentication.
- Add the current hostname to Firebase Authorized domains.
- Publish the repository's `firestore.rules` and `firestore.indexes.json`.
- Confirm the web configuration points to the same project in which the rules were deployed.
- Update Firestore rules manually in Firebase Console; the GitHub Pages workflow intentionally deploys only the website.

### Discover is empty or a shared gallery cannot be opened

- Confirm the gallery has not reached its configured expiry.
- Confirm the Firestore rules and indexes are deployed.
- Check the browser console for Firebase errors rather than treating all missing records as network failures.

### The 3D scene is unavailable

Use a current browser, enable hardware acceleration, and verify WebGL is available. Older devices or privacy tools that disable canvas/WebGL cannot render the galleries.

## Security, privacy, and current limitations

- Guests can build and Walk Preview locally, but publishing requires a verified account. Account rooms may be public, unlisted, or private; private preview access is not yet a contractual confidential-data service.
- Published gallery identity, ownership, visibility, and expiry remain stable. Owners and Editors can revision content under the same link; concurrent stale edits are rejected without deleting the local draft.
- New publications use a trusted permit Function and are limited to 20 new rooms per verified account per UTC day. App Check is wired into the client and trusted room Functions, but must be registered and enforced in the Firebase Console before public launch.
- Firestore and Storage rules require the server permit for new immutable upload paths. They remain one layer of defense; moderation and image malware scanning are still production gates.
- Artwork and covers use Firebase Storage; room data, lifecycle state, permits, and ACL records use Firestore. Physical deletion runs in the trusted cleanup worker after expiry or the Trash recovery window.
- The local AI Curator is heuristic assistance, not a generative model or professional curatorial guarantee.
- Simultaneous co-editing, a user-facing revision history, multiplayer, chat, analytics, payments, sales, events, marketplace features, and community moderation are intentionally outside this MVP.
- This repository currently has no general code license. Do not infer permission for downstream reuse from public repository access.

Review [ASSET_LICENSES.md](./ASSET_LICENSES.md) before reusing artwork, models, textures, fonts, or Blender files outside this LIEUVA deployment.

## Asset notice

The project owner has confirmed permission to display and distribute the Danny Hirsch artwork and gallery assets as part of the LIEUVA demo. That project-specific permission does not automatically grant third parties a reusable asset license. See [ASSET_LICENSES.md](./ASSET_LICENSES.md) for the current notice and items that still require formal provenance records.
