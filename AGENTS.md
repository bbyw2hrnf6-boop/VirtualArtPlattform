# LIEUVA repository guidance

> **Compatibility firewall:** LIEUVA is the customer-facing brand. Legacy AURA/gallery identifiers—including Firebase collections/project IDs, Storage paths, callable names and parameters, IndexedDB/localStorage keys, `.aura.json`, routes and GLB `aura_*` metadata—are compatibility contracts. Never rename them for cosmetic consistency without an explicit migration and regression coverage.

> **Clean URL boundary:** `/spaces/{existing-galleryId}` is delivery over the existing publication identity. It never authorizes renaming `galleries`, IDs, revisions, ACL, Storage or local-draft contracts.

## Read before changing

1. Read `README.md` and `audit/CURRENT-STATE.md`.
2. Read the relevant operational source: `FIREBASE_SETUP.md`, `ASSET_LICENSES.md`, `blender/EXPORT_CONTRACT.md` or the indexed specifications in `audit/README.md`.
3. Designate one checkout as canonical for the task. Confirm it with `git rev-parse --show-toplevel` and `git status --short --branch`; treat similarly named clones as stale until their HEAD and upstream are verified, and do not split implementation and authoritative checks across clones.
4. Preserve user-owned and unrelated changes.
5. Use Node `22.23.2` and npm `10.9.8` for authoritative checks.

## Sources of truth

| Concern | Source |
| --- | --- |
| Product, setup, commands, architecture | `README.md` |
| Current boundary and open risks | `audit/CURRENT-STATE.md` |
| Firebase, deploy and rollback | `FIREBASE_SETUP.md` |
| Asset rights/provenance | `ASSET_LICENSES.md` |
| GLB nodes, surfaces and metadata | `blender/EXPORT_CONTRACT.md` |
| Runtime templates | `src/features/gallery/templates.ts` |
| Current authored environment | `src/features/gallery/scene/premiumEnvironment.ts` and `public/assets/templates/premium-v3/` |
| Publication/storage contracts | `src/services/`, `functions/src/`, Firebase rules and their tests |

Do not treat a dated Git-history audit, screenshot or generated report as current behavior.

## Product priorities

1. Prevent work loss and invalid publication.
2. Keep the shared Three.js scene stable during editor changes.
3. Make placement predictable, reversible and validated.
4. Keep Arrange and Walk Preview obvious on desktop and mobile.
5. Keep all three templates distinct and visitor-ready.
6. Preserve the Danny demo as the visitor/metadata reference.
7. Keep mobile, reduced motion, keyboard access and slow devices first-class.

## 3D and editor invariants

- Do not recreate renderer, PMREM environment, controls or the full scene for selection/transform-only changes.
- Use one placement validator for click, drag, sliders, auto-curation, restore and publish.
- Reject invalid placement transactionally; mesh, React and persisted state must agree.
- Validate artwork rectangles and decor footprints against surfaces, openings, partitions, neighbors, scale and rotation.
- Movement targets must be reachable through collider/nav data.
- Keep artwork color management explicit; atmospheric light must not destroy fidelity.
- Stop automatic motion under reduced-motion preferences.
- Preserve drafts across mode changes and non-destructive navigation; autosave, recovery, undo/redo and visible save state remain mandatory.
- Pre-publish review blocks invalid geometry and explains every issue.

## UI and accessibility

- Preserve the dark editorial identity: Instrument Serif, Manrope, restrained neutrals and acid green for state/action emphasis.
- Functional text must meet WCAG AA; touch controls must be at least 44 × 44 px.
- Scope keyboard movement to a focused 3D surface.
- Keep a non-WebGL artwork directory and meaningful loading/failure states.
- Dialogs need focus containment, Escape, focus return and `aria-modal`.
- Native scrolling stays in control; scroll-linked motion must be reversible with a reduced-motion fallback.
- Keep draft/publication scope visible on compact layouts; a bare `Saved` state must never imply that local changes are live.
- Treat Data Saver as a request for an actionable lightweight fallback, not as an error state.

## AI and automation boundary

- Studio `Auto-arrange` is a local color-sampling and placement-rules workflow. It does not call an AI service; keep that distinction explicit in product copy.
- Do not send artwork or metadata to a remote model without a deliberate feature contract, explicit per-action consent and an exact preview of the transmitted data.
- Remote model output is advisory: show a proposal/diff with Apply, Edit and Discard, commit acceptance as one undoable transaction, and never auto-save or auto-publish it.
- The deterministic placement validator remains authoritative. Never persist model-generated coordinates directly.
- Do not generate, modify, train on or infer provenance for artist work by default. Keep human, AI-assisted and AI-generated provenance user-declared and visibly distinct.
- Keep model credentials server-side and re-check current provider retention, training, regional and cost controls before implementation.

## Maintainability and repository hygiene

- Product code lives in `src/`; trusted server code lives in `functions/src/`.
- Extract large modules incrementally behind characterization tests. Do not combine cleanup with a renderer rewrite or identifier migration.
- Remove code/assets only after checking static imports, lazy imports, dynamic URL construction, tests, build scripts and documentation.
- `public/` is deployment input, not an archive. Only current referenced runtime assets belong there.
- Keep primary Blender sources and licensed/original assets. Do not commit `.blend1`, logs, caches, exploratory renders, duplicate exports, `dist/` or test output.
- Put temporary screenshots, traces and measurements in ignored `artifacts/`; run `npm run clean:generated` when done.
- Add durable audit text only when it records an ongoing contract or unresolved decision. Index it in `audit/README.md`.
- New asset provenance belongs in `ASSET_LICENSES.md`.
- Use descriptive commit and pull-request summaries that name the behavior or contract changed; one-character or placeholder messages are not acceptable release history.

## Verification

- After code changes, run `npm run check`.
- Run `npm run check:functions` for Functions changes.
- Run `npm run test:firebase-rules` for schema, rule, Storage or access changes.
- Run the Playwright smoke suite for UI, route, scene, asset or build changes; verify 1440 × 1000 and 390 × 844 when visuals change.
- Review visual diffs before refreshing approved baselines; never update snapshots merely to make a failing check pass.
- Run `git diff --check` and check for broken Markdown links before handoff.
- Record intentional performance/accessibility regressions; never silently raise budgets.

Do not deploy, publish, delete live data, change Firebase rules or run destructive production operator actions during local verification without explicit user authorization.

## Documentation maintenance

Update `README.md`, `audit/CURRENT-STATE.md` and the relevant contract in the same change when product behavior, architecture, routes, schemas, assets, commands or release procedures change. Prefer replacing stale summaries over appending another chronological status block.
