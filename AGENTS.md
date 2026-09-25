# LIEUVA working seed

LIEUVA is a browser-based 3D exhibition platform. Customer-facing copy uses LIEUVA; existing AURA/gallery identifiers are compatibility contracts. Do not rename Firebase collections, Storage paths, callables, draft keys, routes, `.aura.json` fields, or GLB `aura_*` metadata without an explicit migration and regression coverage.

## Start small

1. Work only in the checkout returned by `git rev-parse --show-toplevel`. Run `git status --short --branch` once. Preserve unrelated work.
2. Read the relevant source and its nearest test before scanning documentation. `README.md` is the compact repository map and command list.
3. Load documents only for the task at hand. Do not read every audit or every Blender brief.

| Task | Read next |
| --- | --- |
| Homepage, product promise, public copy or landing navigation | `src/features/landing/README.md` |
| Current boundary, launch risks, priorities | `audit/CURRENT-STATE.md` |
| Firebase, rules, release, rollback, live operations | `FIREBASE_SETUP.md`, then the matching item in `audit/README.md` |
| Publishing, access, deletion, SEO or telemetry | Matching audit contract selected from `audit/README.md` |
| Studio scene, placement, Walk or templates | `src/features/gallery/AGENTS.md` |
| Functions | `functions/AGENTS.md` |
| Blender, GLB, licensed assets or bespoke showcases | `blender/AGENTS.md` |

## Always preserve

- One placement validator governs click, drag, sliders, curation, restore and publish. Invalid placement is transactional: mesh, React state and stored draft agree.
- Do not recreate the renderer, controls, PMREM environment or full scene for selection/transform-only changes.
- Keep drafts, undo/redo, recovery, reduced motion, keyboard focus and 44 px touch targets functional. A local `Saved` state never implies publication.
- `Auto-arrange` is local and rules-based. Any remote model feature needs explicit per-action consent, a preview, a reversible proposal, and deterministic validation.
- `public/` is deployment input, not an archive. Keep source assets and provenance; keep generated logs, traces and screenshots in ignored `artifacts/`.

## Verify and document precisely

Run `npm run check` after code changes. Add `npm run check:functions`, `npm run test:firebase-rules`, and/or Playwright when their affected boundary applies. Review desktop and 390 × 844 visuals after visual work. Run `git diff --check` before handoff.

After a change, check whether it alters a user-facing promise, acceptance criterion, compatibility rule or operator procedure. Update the nearest scoped contract in the same change:

| Changed boundary | Update |
| --- | --- |
| Homepage, public copy or entry journey | `src/features/landing/README.md` |
| Studio scene, placement or Walk | `src/features/gallery/AGENTS.md` or its scoped source contract |
| Bespoke visitor behavior or assets | `src/features/showcase/README.md` or the selected Blender showcase README |
| Publishing, security or live operations | The matching contract selected through `audit/README.md` or `FIREBASE_SETUP.md` |

If the change implements an existing rule, keep the contract concise and let code and tests show the detail. Update `README.md` when the product summary, repository map or command routing changes. Update `audit/CURRENT-STATE.md` only when the product boundary, current risk or priority changes. Do not append routine implementation diaries or duplicate summaries across documents.

Treat source and current tests as evidence of implemented behavior; a dated audit result is evidence for its stated date and revision. Read the selected document's status before using it as a current requirement. When code and a contract disagree, resolve the discrepancy in the affected change and record any unresolved product decision instead of silently choosing one.

Deployment, live-data mutation, rule changes and deletion require explicit user authorization.
