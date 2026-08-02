# AURA — Virtual Art Platform MVP

AURA is a browser-based platform for creating, curating, publishing, and sharing immersive 3D art exhibitions. This repository contains the first standalone MVP: a React and Three.js editor, three gallery architectures, a visitor experience, a public Discover section, and a ten-day Firebase publishing lifecycle.

Live MVP: [bbyw2hrnf6-boop.github.io/VirtualArtPlattform](https://bbyw2hrnf6-boop.github.io/VirtualArtPlattform/)

> **MVP status:** AURA is a concept-validation showcase, not yet a production marketplace. Read [Security, privacy, and current limitations](#security-privacy-and-current-limitations) before inviting public uploads.

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
- Anonymous publishing, shareable hash links, public discovery, owner deletion, and automatic expiry after ten days.

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
| `npm run build` | Type-check the app and create the production bundle in `dist/`. |
| `npm run preview` | Serve `dist/` locally for production verification. |
| `npm run check` | Run lint, all tests, type-checking, and the complete production build; this is the deployment quality gate. |
| `npm run validate:glb -- path/to/template.glb` | Validate a future template export against the documented AURA GLB contract. |

The supported production path is `.github/workflows/deploy.yml`.

## Editor workflow

The intended creation flow is:

**Choose gallery → Upload artwork → Place or auto-curate → Customize → Publish → Share**

1. Choose one of the three spaces.
2. Upload one or more artwork images.
3. Select an artwork in the left panel.
4. Choose a wall; the camera moves to it and AURA finds an available position.
5. Click the wall for an exact location, drag the artwork directly, or use the fine-placement sliders.
6. Use the translucent side arrows to rotate around the room, or use the numeric metre controls, 3 cm placement grid, exact centimetre readout, framing, lock/hide, alignment, 1.75 m eye-line, and **Space this wall** actions.
7. Use **Reset view** whenever orientation is lost. In the Grand Forum, use the five-zone floor-plan navigator to jump between the central axis and four side galleries.
8. Keep **Arrange** and **Open roof** enabled while editing, then enter **Walk Preview** and **Preview ceiling** to inspect the visitor experience. The same canvas and camera session stay alive; a selected visible artwork becomes the Walk Preview start focus.
9. Add and position objects by dragging them or clicking an empty floor location.
10. Optionally run **AI Curator**. Re-running it intentionally produces a new proposal, and its result can be undone during the current editing session.
11. Open **Review & publish**. AURA validates every visible artwork and object, shows the captured share cover, blocks invalid geometry, and publishes only after the review passes.

Drafts autosave per template in IndexedDB. Direct template routes survive refresh and offer recovery before editing continues.

## Visitor controls

| Context | Controls |
| --- | --- |
| Walk mode | `W`, `A`, `S`, `D` or arrow keys to move and turn; drag to look; click the floor to walk automatically. |
| Artwork | Click an artwork to open its information card; it closes when the visitor turns away. |
| Overview | Orbit the room, zoom with the mouse wheel or a supported pinch gesture, and use the fading cutaway walls to inspect the interior. |
| Cinematic intro | Allow the room-specific camera path to finish or use the on-screen skip control. |
| Danny guided tour | Start or skip the optional 45-second authored tour; use **Smart view** to cycle exhibition anchors and **Reset view** to return to the authored start. |
| Accessible directory | Open **Artworks** for images, metadata, and descriptions without navigating the canvas. It opens automatically if WebGL fails. |

Touch behavior depends on the browser and device. If a HEIC/HEIF image cannot be decoded, convert it to JPG, PNG, or WebP and upload it again.

## Routing and GitHub Pages compatibility

AURA uses hash-based routes, so refreshing a gallery does not require server-side rewrites:

- `#/` — landing page and Discover
- `#/create` — gallery picker and editor
- `#/create/{white-cube|nocturne|pavilion}` — persistent editor route for one template
- `#/create/{white-cube|nocturne|pavilion}/demo` — instant sandbox preloaded with three fictional demo artworks
- `#/demo` — Danny Hirsch live demo
- `#/g/{gallery-id}` — published gallery
- `#/data` — factual MVP data and rights notice

The Vite production base is relative, allowing the built bundle to run from the `/VirtualArtPlattform/` repository path. Runtime assets also use relative URLs.

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
2. Firebase signs the publisher in anonymously in the background.
3. Artwork image data is stored in separate `galleryArtworks` Firestore documents. The gallery document stores metadata, positions, materials, object placements, and a smaller cover image.
   Hidden works and editor-only lock state are omitted from the public record; visitor-facing frame choices are preserved.
4. Both document types receive an `expiresAt` timestamp ten days after publication.
5. Firestore rules allow public reads only while `expiresAt` is in the future. Discover applies the same active-gallery constraint.
6. The scheduled cleanup Action physically deletes expired documents as a separate, best-effort maintenance step.

Firebase Storage is deliberately not used in this Spark-plan MVP. See [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) for console setup, rules, indexes, cleanup, quotas, and verification.

### Firebase web configuration

The Firebase web-client configuration currently lives in `src/services/firebase.ts` and targets the `virtualartplattform` project. Firebase web API keys and project identifiers identify the client application; they are not service-account credentials and are expected to be visible in a browser bundle.

To use another Firebase project, replace that web configuration and the default project in `.firebaserc`, then deploy the repository's rules and indexes to the new project. Never place a service-account JSON or private key in source code.

## Deploy to GitHub Pages

1. Push the repository to GitHub with the application on `main`.
2. Open **Repository Settings → Pages**.
3. Under **Build and deployment**, select **GitHub Actions** as the source.
4. Push a commit to `main`, or manually run **Actions → Deploy to GitHub Pages → Run workflow**.
5. Confirm every step is green and open the URL shown by the deployment job.

`.github/workflows/deploy.yml` installs the locked dependencies with `npm ci`, builds `dist/`, uploads it as a Pages artifact, and deploys it. Do not configure Pages to publish the repository root or the unbuilt `main` branch.

Before presenting a deployment, verify:

```bash
npm run lint
npm run build
```

Then test the landing page, all three room editors, the Danny demo, one publication, the resulting share link in a private browser window, and its Discover card.

For a custom domain, also add the hostname under **Firebase Authentication → Settings → Authorized domains** and update the hardcoded Open Graph image URL in `index.html`.

## Troubleshooting

### The page is white on GitHub Pages

- Confirm Pages uses **GitHub Actions**, not `main / (root)`.
- Open the latest deployment in the Actions tab and confirm the build and deploy jobs succeeded.
- Make sure the deployed URL includes `/VirtualArtPlattform/`.
- Hard-refresh after a deployment and inspect the browser console/network panel for missing JavaScript or asset files.

### `localhost:5173` is not running

Run `npm ci` once, then keep `npm run dev` running in the terminal. Opening `index.html` directly cannot start Vite.

### Publishing reports `permission-denied`

- The room itself is still autosaved locally. This error concerns Firestore publication, not the IndexedDB draft.
- Enable Anonymous Authentication.
- Add the current hostname to Firebase Authorized domains.
- Publish the repository's `firestore.rules` and `firestore.indexes.json`.
- Confirm the web configuration points to the same project in which the rules were deployed.
- Remember that the GitHub Pages workflow deploys the site only; an authenticated project owner must deploy Firestore rules separately.

### Discover is empty or a shared gallery cannot be opened

- Confirm the gallery has not reached its ten-day expiry.
- Confirm the Firestore rules and indexes are deployed.
- Check the browser console for Firebase errors rather than treating all missing records as network failures.

### The 3D scene is unavailable

Use a current browser, enable hardware acceleration, and verify WebGL is available. Older devices or privacy tools that disable canvas/WebGL cannot render the galleries.

## Security, privacy, and current limitations

- Published galleries and their artwork are intentionally public until expiry. Upload only work that may be shared publicly.
- Publishing uses anonymous Firebase identities, not artist accounts. The ability to delete a gallery belongs to the anonymous identity stored in that browser; clearing site data or switching devices can remove that ownership access.
- Published gallery records are immutable. Editing and republishing creates a new gallery and share link.
- The client-only anonymous write path has no application-level rate limiting, moderation, malware scanning, or App Check enforcement. Harden it before opening unrestricted public publishing.
- Firestore Security Rules protect client requests, but they are not a substitute for abuse prevention or a trusted publishing backend.
- Storing compressed images as Firestore strings is appropriate for a low-traffic demo, not a production community or marketplace.
- The local AI Curator is heuristic assistance, not a generative model or professional curatorial guarantee.
- Multiplayer, chat, artist accounts, analytics, payments, sales, events, marketplace features, and community moderation are intentionally outside this MVP.
- This repository currently has no general code license. Do not infer permission for downstream reuse from public repository access.

Review [ASSET_LICENSES.md](./ASSET_LICENSES.md) before reusing artwork, models, textures, fonts, or Blender files outside this AURA deployment.

## Asset notice

The project owner has confirmed permission to display and distribute the Danny Hirsch artwork and gallery assets as part of the AURA demo. That project-specific permission does not automatically grant third parties a reusable asset license. See [ASSET_LICENSES.md](./ASSET_LICENSES.md) for the current notice and items that still require formal provenance records.
