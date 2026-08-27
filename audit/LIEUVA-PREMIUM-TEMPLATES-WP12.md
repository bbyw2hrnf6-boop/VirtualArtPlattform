# LIEUVA Premium Template & Environment System — WP12

## 1. Verdict

**PASS.** LIEUVA now exposes three intentionally different, production-ready environment directions through one shared template configuration and one shared procedural renderer. The implementation preserves the persistent template IDs (`white-cube`, `nocturne`, `pavilion`), publication schema, Storage paths, routes and Firebase contracts.

## 2. Scope and evidence

Repository evidence:

- template contract and the three environment definitions: `src/features/gallery/templates.ts`;
- shared scene interpretation: `src/features/gallery/GalleryScene.tsx`;
- shared draft defaults: `src/features/gallery/editor/draftDefaults.ts`;
- template-selection, showcase and Discover presentation: `src/App.tsx` and `src/features/landing/directoryExperience.css`;
- truthful runtime previews: `public/assets/templates/*.webp`;
- contract regression tests: `src/features/gallery/templates.test.ts`.

No second renderer, editor, publication path, state store or persistence model was added.

## 3. Architecture before and after

Before WP12, the three IDs already selected procedural branches in `GalleryScene.tsx`, but identity information was scattered across scene conditions, draft defaults and landing-page copy. Preview images described a concept direction rather than the actual runtime.

WP12 extends `GalleryTemplate` into the shared environment contract. Each environment now declares scale, intended use, default lighting, material identity, architectural identity, artwork anchors and a draw-call budget. Existing branches remain inside the shared renderer only where geometry genuinely differs. Common entrance, threshold and header elements consume the same template configuration.

## 4. Final template set

| Persistent ID | User-facing name | Scale | Default light | Intended use |
| --- | --- | --- | --- | --- |
| `white-cube` | White Cube | 16 × 12 m | Daylight | solo and duo presentations |
| `nocturne` | Warm Gallery | 15.5 × 11.5 m | Evening | intimate launches and private views |
| `pavilion` | Grand Forum | 40 × 60 m | Museum | institutions, schools and brand-scale presentations |

The persistent IDs intentionally remain unchanged for backwards compatibility.

## 5. Architectural distinction

- **White Cube:** calm orthogonal volume, neutral framed openings, gallery ceiling and compact sightlines.
- **Warm Gallery:** dark timber floor, warm limewash/charcoal envelope, bronze portals, cove lines and a central sculptural plinth.
- **Grand Forum:** large multi-zone hall, long axial circulation, skylight structure and museum-scale datum details.

The entrance portal, lintel/header and threshold are shared primitives driven by environment configuration rather than duplicated implementations.

## 6. Material identity

The configuration carries both human-readable identity and renderer-ready color values for wall, floor, metal and accent surfaces. Defaults remain compatible with the established material library:

- White Cube: mineral plaster, pale concrete and brushed aluminium;
- Warm Gallery: warm limewash, dark smoked oak and aged bronze;
- Grand Forum: cut limestone, white marble and dark bronze.

Runtime previews were captured from the real WebGL environments and replace the earlier aspirational concept images. Their checksums and capture policy are recorded in `public/assets/templates/README.md`.

## 7. Lighting identity

New drafts read their default light from the template contract. White Cube remains daylight-led, Warm Gallery remains evening/focused, and Grand Forum now defaults to the existing museum profile instead of inheriting generic daylight. The same draft lighting value is consumed by Studio, Walk Preview and the published viewer, so WP12 does not add a separate published-lighting path.

## 8. Artwork placement and anchors

Each definition declares stable placement-anchor families and spacing guidance. Existing artwork placement and wall-normal logic remain authoritative; WP12 documents the intended anchor vocabulary without changing stored placement contracts or existing drafts. The renderer continues to use the same placement, collision and tour systems.

## 9. Template-selection experience

The picker and landing showcase now use the same template source for dimensions, capacity, intended use, default light and material identity. Cards show the actual runtime environment, not an unrelated render. User-facing `Nocturne` is now `Warm Gallery`; its technical ID remains `nocturne`.

## 10. Discover and homepage scope

Discover was refined into an editorial directory with 4:3 live covers, calmer typography, clearer template attribution, a less noisy longevity badge and an honest empty state. The permanent DannyHirschArts fallback card was removed from Discover. The large duplicate Danny case-study section was removed from the landing page; the authored Emil Scroll and deliberate demo entry remain the selected proof points.

## 11. Desktop visual QA

At 1440 × 1000:

- landing, template picker and all three Studio routes rendered without horizontal overflow;
- all three environments reached `3D Space ready`;
- the picker presented exactly three distinct environments with truthful facts and previews;
- Discover retained its search and public directory behavior;
- no unexpected console or WebGL warnings were recorded.

## 12. Mobile visual QA

At 390 × 844:

- landing, picker and all three Studio routes stayed within the viewport;
- every Studio route retained a usable canvas and compact authoring controls;
- the Grand Forum remained navigable despite its larger scale;
- no unexpected console or WebGL warnings were recorded.

Some secondary pre-existing header/skip targets remain below the ideal 44 px touch size. They are outside the template architecture and are retained as a general mobile polish condition rather than a WP12 blocker.

## 13. Runtime measurements

Local Vite production-equivalent browser QA, after scene stabilization:

| Environment | Scene-ready | Draw calls | Triangles | Textures |
| --- | ---: | ---: | ---: | ---: |
| White Cube | 255 ms | 67 | 39,660 | 23 |
| Warm Gallery | 264 ms | 52 | 35,760 | 23 |
| Grand Forum | 198 ms | 80 | 35,532 | 25 |

These figures are observational development measurements from the existing `GalleryScene` diagnostics hooks, not production RUM claims. Geometry detail for the Warm Gallery's central object now follows the existing adaptive quality tier.

## 14. Performance budgets

`npm run check` passes all current budgets:

- total JavaScript gzip: 541,284 / 550,000 bytes;
- total CSS gzip: 36,692 / 37,000 bytes;
- largest lazy JavaScript chunk gzip: 180,987 / 195,000 bytes;
- entry JavaScript gzip: 111,908 / 120,000 bytes.

The previews are WebP and are smaller than the concept images they replace. Per-template draw-call budgets are explicit in the shared configuration.

## 15. Lifecycle confidence

The existing deterministic release-gate suite covers publication validation, publication/update state, immutable Storage paths, JPG/PNG/WebP normalization, recovery and repository behavior. It passes 71/71 tests. WP12 changes no save, publication, ACL, Firebase or Storage contract. Studio route QA covered selection and editing entry for all three templates. A signed-in production publish/update smoke test remains a normal post-deploy operational check, not a new WP12 architecture requirement.

## 16. Automated verification

- `npm run check` — PASS: 43 test files, 266 tests, lint, build and performance budgets.
- `npm run check:functions` — PASS: 6 test files, 45 tests and TypeScript build.
- `npm run test:release-gate` — PASS: 8 test files, 71 tests.
- `git diff --check` — PASS.

## 17. Files changed

- `src/features/gallery/templates.ts`
- `src/features/gallery/templates.test.ts`
- `src/features/gallery/GalleryScene.tsx`
- `src/features/gallery/editor/draftDefaults.ts`
- `src/features/gallery/editor/draftDefaults.test.ts`
- `src/App.tsx`
- `src/features/landing/directoryExperience.css`
- `public/assets/templates/white-cube-preview.webp`
- `public/assets/templates/nocturne-preview.webp`
- `public/assets/templates/pavilion-preview.webp`
- `public/assets/templates/README.md`
- `audit/LIEUVA-PREMIUM-TEMPLATES-WP12.md`

## 18. Remaining conditions

1. Run the standard signed-in production smoke after a future authorized deployment: create, save, publish, visit and update one fixture Space, then remove only that fixture.
2. Validate touch comfort on at least one physical iOS and Android device.
3. Use production RUM from WP6 to validate scene-ready and frame-time distributions on low-end devices; local measurements are not a substitute for population data.

## 19. Completion

WP12 is complete. The repository is ready for WP13 without a template-system migration.
