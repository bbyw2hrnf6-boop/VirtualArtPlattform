# LIEUVA Studio design catalogue and dynamic curation

Date: 2026-09-08. Local implementation; no commit, deployment or publication performed.

## What changed

| Area | Previous visible catalogue | Current visible catalogue |
| --- | ---: | ---: |
| Wall colours/materials | 10 | 16 |
| Floor materials | 10 | 15 |
| Distinct objects | 6 | 13 |

New wall colours: sage plaster, ink-blue paint, rose limewash and sand plaster. Woven linen and Roman travertine are restored to the selector. New floors: cork, terracotta tile, basalt terrazzo and basketweave oak parquet; smoked oak is selectable again. All are actual materials in the shared interactive renderer used by Studio and visitors.

New objects: bouclé lounge chair, low stone table and opal/brass light column. Monstera, branch vase, walnut stool and rope barrier are restored as distinct existing objects. Ficus and the older gallery bench remain readable for saved projects and publications, but are not duplicated in the catalogue. Selecting an object already placed in the room (including these legacy equivalents) opens that object. Existing saved duplicates are not deleted.

The object search narrows the catalogue, cards indicate “In room · Select to edit”, full material labels remain readable, and the active finish is named above its swatches.

## Curator behaviour

- New seed for every run, sampled from browser cryptographic randomness; a seed can be supplied by unit tests.
- Three coherent style families (Quiet & light, Earth & timber, Sculptural contrast) plus Surprise me. Artwork palette analysis influences the latter. Compatible wall/floor pairs are chosen within a family, rather than mixing every material indiscriminately.
- Default **Surfaces & objects** retains artwork positions. **Include artwork layout** also recomposes movable works. **Objects only** retains the current surfaces and light. All scopes preserve the authored ceiling system.
- Works in an empty room. One seat, one plant, a display/accent object and optional furnishing establish a composition; larger rooms receive more objects. The curator uses twelve distinct types; the manually selectable rope barrier is excluded to avoid unnecessarily fencing off visitor routes.
- Every proposed arrangement uses unique types. Placement is tested against the shared validator, room shell, partitions and neighbouring objects. A 2.4m-wide central circulation strip and Forum door corridors are reserved; perimeter viewing strips stay clear. The stone table first tries a companion position near the seating.
- Locked and hidden artwork stays intact. Artwork source, identity, metadata, ordering and project identity survive curation. An invalid proposal is rejected without replacing the draft.
- A signature excludes random object UUIDs, preventing artificial “variety” through new IDs alone. The current design and the last twelve accepted session signatures are excluded; surface-changing runs also exclude the active wall/floor pairing. This is bounded repeat avoidance, not a promise of mathematically infinite unique designs.
- **Another variation** runs again directly from the result. Each accepted design is one standard history entry. The dedicated undo action is offered only while that exact proposal is current, so it cannot overwrite later edits. A concurrent edit while image analysis is pending cancels application of the stale proposal.
- Image decoding is bounded at three seconds per image. Palette analysis is local; no external generative model/API was added. The UI explains that images stay in the browser.

## Runtime and compatibility

New furnishings use at most two material batches each and fewer than 6,000 triangles, with geometry bounds checked against the same footprints used for placement. They use the existing object selection, transforms, collision traversal, disposal and shared renderer. The light column uses an emissive opal material rather than adding a shadow-casting lamp.

New material maps are created only for active surfaces: 512px albedo, 256px scalar height/roughness. Existing architectural AO stays intact when materials change. Redundant, unreachable procedural branches for file-backed materials were removed; repeated wall PBR profiles are consolidated.

Client and trusted Functions validators accept all new IDs. Existing schema v3, internal names, Firebase endpoints, persistence keys, routes and publishing logic are preserved. A later manual release must include the updated Functions validator as well as the frontend; a frontend-only release would leave the deployed server unaware of new IDs.

The runtime GLBs and Blender beauty scenes are not repackaged for every choice. The catalogue is an interactive layer applied to the already upgraded rooms; existing beauty masters and Blender sources remain separate from this pass.

## Verification

`npm run check` passes with Node 22.23.2: lint, 341 Vitest tests in 56 files, 43 script tests, all six premium GLB checks, TypeScript and the production build. `npm run check:functions` passes: 160 tests in 24 files, seven script tests, test typechecking and the production-only Functions build. `git diff --check` is clean.

| Gzip measurement | Actual bytes | Enforced ceiling |
| --- | ---: | ---: |
| Total JavaScript | 574,377 | 575,000 |
| Total CSS | 53,908 | 54,000 |
| Largest lazy JS | 173,069 | 195,000 |
| Entry JavaScript | 294,681 | 305,000 |
| Entry CSS | 31,731 | 32,500 |

Existing softer performance targets remain open; these figures are build/download budgets, not measured mobile frame rates.

Automated results and bundle measurements are recorded in `studio-design-validation.log` and `studio-design-functions-validation.log` in the task outputs. Tests cover 360 successive seeded variations across all three rooms, all three scopes and all style settings; 90 additional locked/hidden-work scenarios; empty rooms; repeat exclusion; input immutability; geometry bounds and batching; legacy catalogue equivalents; client publication and trusted manifest acceptance. The existing six runtime GLB checks and release bundle ceilings remain enforced without increasing budgets.

### Browser verification completed after unlock

Local Computer Use checks ran at **1440×1000** and **390×844**, in separate `qa-design-*` drafts. User demo drafts were left intact. Evidence: [studio-browser-observations-2026-09-08.json](./studio-browser-observations-2026-09-08.json); real screenshots are included in the task outputs.

- All three templates load the authored desktop GLB, switch between Arrange and Walk, and select their respective `-mobile.glb` after a fresh mobile load. Tested document bounds are exactly 390×844 on mobile; no horizontal overflow was observed in the landing or picker at either viewport.
- White Cube: all four new walls and all four new floors were changed in the running room. The chair, stone table and light column were added, selected and positioned. Searching “lounge” narrows the catalogue; choosing an already placed chair keeps the object count unchanged. An overlapping light-column move is visibly rejected without changing the saved position.
- Empty-room curation and successive surface-changing variants work in all three templates. White Cube used Quiet & light and Earth & timber, Nocturne used Earth & timber, and Forum used Sculptural contrast. Different accepted variants changed surfaces and object composition, while each authored ceiling remained intact.
- Full curation moved the two unlocked White Cube works while retaining the locked first work at exactly north / x=-2.79m / centre=1.75m / scale=0.9. Objects-only runs in White Cube and on mobile Forum retained surfaces, lighting and artwork placement. Curator Undo and standard Redo restored the two observed White Cube variants.
- Reload recovery retained the test rooms, materials, furniture and art. All three pre-publish reviews reported **Geometry valid**, with six optional warnings for the missing years and notes on the three uploaded fictional study images. No sign-in, publish or live-data action was taken.
- Forum camera-map targets reached NW (-15,3.9,-15), NE (15,3.9,-15), SW (-15,3.9,15), SE (15,3.9,15). Placement/path regressions remain covered by the shared automated validator tests.
- Fresh checked sessions reported no browser console errors. Landing, picker and sample-room previews were also inspected at both sizes.

### Corrections prompted by actual browser inspection

1. A static scene-status element added 22px of page overflow and could clip the header when the inspector scrolled. It now uses the existing accessible visually-hidden style while retaining its live-region semantics.
2. Furniture dragged from a seat or upper surface initially jumped to the floor point below the pointer. Dragging now preserves the original floor-relative grab offset. A fresh UI retest moved the chair from (-1.89,-0.87) to (-1.50,-0.72) with a short drag and no placement alert.
3. Mobile Curator controls were only 32.5px high and the result was covered by the tool sheet. Selects now measure 44px; curation collapses the compact sheet and presents the result above its handle. At 390×844, the result ends at y=768 and the sheet starts at y=780, leaving both variation and undo actions accessible.
4. Terracotta and parquet colour variation, parquet joints, and the bright aggregate in dark terrazzo were reduced after checking their actual browser appearance.

These fixes are included in the final passing `npm run check` and the bundle figures above. Browser diagnostics include last-pass draw-call/triangle snapshots: reflection and preview passes can temporarily replace those counters, so they are deliberately not presented as a stable FPS or draw-call benchmark. Adaptive quality was observed at balanced/low under the local test workload.

### Remaining limits

The local functional and viewport checks are complete. Actual iOS/Android sustained FPS, thermal behaviour, memory pressure and physical touch comfort remain unmeasured. These runtime captures do not establish pixel parity with the supplied reference images or a professional art-direction sign-off. The separate Cycles beauty masters remain 4K stills; the walkable room continues to use its interactive optimized scene. Manual release must include both frontend and the updated Functions validator. No commit, push, deployment or publication was performed.
