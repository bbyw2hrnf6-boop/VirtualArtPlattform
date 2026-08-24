# LIEUVA repository guidance

> **Compatibility firewall:** LIEUVA is the customer-facing brand. Legacy AURA/gallery technical identifiers—including Firebase collections and project IDs, Storage paths, callable names, Function parameters, IndexedDB/localStorage keys, `.aura.json`, routes and GLB `aura_*` metadata—are compatibility contracts. Never rename them for cosmetic consistency without an explicit migration plan and regression coverage.

> **Clean URL boundary:** `/spaces/{existing-galleryId}` is a delivery route over the existing publication identity. Clean customer URLs never authorize renaming `galleries`, gallery IDs, Storage paths, callable Functions, revisions, ACL or export/local-draft contracts.

## Product goal

- Build a pitch-ready browser platform for creating, curating, previewing, publishing, and sharing premium virtual art exhibitions.
- Treat audit/UI-UX-3D-AUDIT.md as the current product-quality backlog and acceptance guide.
- Preserve LIEUVA's editorial visual identity: Instrument Serif, Manrope, restrained neutral palettes, and acid-green only for state/action emphasis.
- Prefer visible product proof over marketing claims. Never describe a runtime feature or Blender pipeline that does not exist.

## Product priorities

1. Prevent work loss and invalid published galleries.
2. Keep the Three.js renderer and scene stable during editor changes.
3. Make artwork placement predictable, reversible, and validated.
4. Support two obvious primary experiences: Arrange and Walk Preview. Wall/Floorplan views may support Arrange.
5. Keep all three templates visually distinct and pitch-ready in their default state.
6. Make the Danny demo the reference implementation for visitor quality, metadata, collision, and navigation.
7. Keep mobile, reduced motion, keyboard access, and slow devices first-class.

## 3D invariants

- Do not recreate the renderer, PMREM environment, controls, or full scene for selection-only or transform-only state changes.
- Use one shared placement validator for click, drag, sliders, auto-curation, restore, and publish.
- Reject invalid placement transactionally and visibly; never leave mesh state different from React/persisted state.
- Validate artwork rectangles and decor footprints against room surfaces, openings, partitions, neighbors, scale, and rotation.
- Use collider or navmesh data for visitor movement. Click-to-walk targets must be reachable.
- Keep artwork color management explicit and predictable. Atmospheric lighting must not destroy artwork color fidelity.
- Stop auto-rotation and camera tours when reduced motion is requested.
- Use adaptive DPR, shadow quality, texture resolution, and progressive loading.
- Runtime room geometry must come from documented procedural code or an explicit Blender-to-GLB contract. Keep marketing copy accurate.

## Editor invariants

- Autosave versioned drafts locally and offer recovery after refresh.
- Provide undo and redo for meaningful draft changes.
- Preserve the user's draft across view switches and non-destructive navigation.
- Show saved/saving/error state.
- Give numeric transform controls useful units and visible values.
- Run a pre-publish review that blocks invalid geometry and explains each issue.
- Do not publish, delete, deploy, alter Firebase rules, or mutate live data during local verification unless the user explicitly asks.

## UI and accessibility

- Keep primary text at least 12 px and controls at least 44 × 44 px on touch surfaces.
- Meet WCAG AA contrast for functional and explanatory text.
- Scope keyboard movement to a focused 3D surface.
- Provide a non-WebGL artwork list/description and meaningful loading/failure states.
- Dialogs require focus management, Escape, focus return, and aria-modal when modal.
- Do not use scroll hijacking. Scroll-linked motion must be reversible and have a reduced-motion fallback.

## Verification

- Run npm run check after code changes.
- Run automated tests when present.
- Test landing, picker, all three templates, upload/placement, undo/redo/recovery, Walk/Overview, and publish review.
- Visually verify at 1440 × 1000 and 390 × 844.
- Record intentional performance or accessibility regressions before handoff.

## Files and assets

- Keep product code in src/; keep audit evidence in audit/.
- Preserve user-owned changes and unrelated files.
- Record source and license information for new fonts, images, textures, models, and artwork in ASSET_LICENSES.md.
- Prefer real product captures or licensed project assets over invented UI screenshots.
