# LIEUVA Premium Artwork & Asset Presentation — WP13

Date: 2026-08-27  
Verdict: **PASS WITH CONDITIONS**

## Scope and architecture

WP13 extends the existing shared artwork model, `GalleryScene`, editor state,
placement validator, persistence validator and image worker. It does not create a
second renderer, upload path, publishing system or Firebase schema. Existing
legacy records remain readable because every new field is optional and the
historic frame values remain valid.

## Implemented

- Increased normalized artwork preparation from a 1200 px ceiling to an adaptive
  2048 px ceiling. Encoding now starts at WebP quality 0.90 and preserves at
  least 0.56 before reducing dimensions to respect the existing payload limit.
- Kept artwork pixels in sRGB, rendered with a non-tone-mapped
  `MeshBasicMaterial`, adaptive anisotropy and the original aspect ratio. Frames,
  mats and room light cannot tint the uploaded image.
- Added one shared presentation contract in
  `src/features/gallery/artworkPresentation.ts` with six curated frames:
  Thin Black, Thin White, Natural Wood, Dark Wood, Brushed Metal and Frameless.
- Added No Mat, Gallery White, Warm White and Black mat treatments. Mat geometry
  sits outside the image aperture, so enabling a mat never crops the artwork.
- Added physically legible frame depth, a shallow artwork substrate, wood grain,
  metalness/roughness/clearcoat tuning and restrained selection emphasis.
- Applied mounted outer dimensions to wall bounds, exclusions, overlap checks,
  availability and distribution. A frame or mat can no longer silently collide
  even when the unframed image would fit.
- Preserved the existing pooled per-artwork spotlight system and its target
  updates instead of adding expensive duplicate lights.
- Added Medium and Original dimensions metadata plus displayed and mounted sizes
  in centimetres. Existing horizontal, centre-height and artwork-height precision
  controls remain the single placement system.
- Added safe frame/mat switching validation and a Reset placement action that
  reuses the existing deterministic placement solver.
- Studio focus and visitor focus now receive the same medium/dimensions metadata.
- Added explicit upload-ready status styling while preserving validation,
  normalization, progress and recoverable error behavior.

## Rendering and fidelity evidence

- The same `GalleryScene` renders Arrange, Walk Preview and published visitors.
- Visual QA confirmed a portrait work with Dark Wood and Warm White mat retains
  its full image area and receives physical depth without altering its pixels.
- White Cube, Nocturne and Grand Forum/Pavilion all reached `3D Space ready` with
  artwork controls and Walk Preview available.
- Walk Preview exposed the shared Artworks, Guided Tour and Reset View controls.
- Browser console contained no warnings or errors during the tested Nocturne
  Walk Preview flow.

## Responsive QA

- Desktop: checked at 1440 × 1000 through the complete artwork inspector.
- Mobile: checked at 390 × 844 and 360 × 800.
- At 360 px there was no horizontal document overflow (`scrollWidth ===
  clientWidth`).
- Frame choices and Walk Preview measured 44 px high; the mobile Studio kept the
  3D canvas visible while the editor used its existing peek/half/expanded system.

## Automated verification

- `npm run check`: PASS — 44 files, 271 tests, production TypeScript/Vite build.
- `npm run check:functions`: PASS — 6 files, 45 tests, Functions TypeScript build.
- `npm run test:release-gate`: PASS — 8 files, 72 tests.
- `git diff --check`: PASS.
- Performance budgets: PASS — total JS gzip 542,773 / 550,000 bytes; total CSS
  gzip 36,720 / 37,000; largest lazy JS 180,987 / 195,000; entry JS 112,719 /
  120,000.

## Regression coverage added

- Exact aspect-ratio preservation and no image crop.
- Mat aperture outside the artwork image.
- Physical depth difference between wood and frameless presentation.
- Mounted frame/mat dimensions applied to wall-bound validation.
- Frame, mat, medium and original-dimensions persistence round trip.
- Unsupported mat rejection while legacy optional fields remain accepted.

## Files changed

- `src/features/gallery/artworkPresentation.ts`
- `src/features/gallery/artworkPresentation.test.ts`
- `src/features/gallery/GalleryScene.tsx`
- `src/features/gallery/types.ts`
- `src/features/gallery/editor/placementValidation.ts`
- `src/features/gallery/editor/placementValidation.test.ts`
- `src/services/galleryValidation.ts`
- `src/services/galleryValidation.test.ts`
- `src/services/imagePreparation.ts`
- `src/workers/imageProcessor.worker.ts`
- `src/App.tsx`
- `src/styles/global.css`

## Remaining conditions and risks

1. A controlled authenticated production publish/update should confirm Storage
   upload, saved frame/mat metadata and the final public URL without modifying
   unrelated user data.
2. Transparent PNG, large landscape, large portrait and square creator-owned
   source files still need a signed-in end-to-end upload comparison on the live
   Firebase environment. Unit and local sample coverage validate the shared
   geometry and persistence contract, but no personal file was transmitted.
3. The current legacy publication payload still constrains normalized embedded
   sources. WP13 improves quality substantially inside that invariant; removing
   the limit would require a separately planned Storage-only compatibility
   migration.
4. Wood grain is deterministic procedural texture rather than a new downloaded
   bitmap. It avoids asset weight and licensing risk but should receive final
   art-direction review on representative calibrated displays.
5. Performance budgets are close to their existing warning ceilings, especially
   CSS and aggregate JavaScript. WP14 should avoid adding eager code.

WP13 is complete as **PASS WITH CONDITIONS**. The repository is ready for WP14
after the focused live Firebase media/publish smoke test above; no rules, indexes,
collections, Storage paths, Functions names, GLB metadata or routes changed.
