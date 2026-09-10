# Emil direction v2 and mobile Studio · implementation notes

Reviewed the supplied `lieuva-emil-scroll-regieplan-v2.md`, the four 24-shot boards,
and yesterday's mobile Arrange / Materials / Walk concepts against current code.
The document describes a proposal and explicitly says its author could not verify
WebGL. Its observed feature claims are checked against the repository; its
"Keine Umsetzung" subtitle describes that document, not the owner's current request.

## Decisions before implementation

| Reference | Adopt | Adapt to the working product |
| --- | --- | --- |
| Shots 1–6 | Ground-plan outline, floor reveal, rising architecture, daylight, empty-room hold | Animate the existing authored room; no second fake room or runtime GLB replacement. |
| Shots 7–12 | Three separate artwork arrivals, a small framing demonstration, stable final object positions | Use the actual editable demo works and existing catalog sculpture/bench. Keep the original stone study rather than inventing an unsupported terracotta finish. Sculpture left, bench right, clear entrance aisle. |
| Shots 13–18 | Mineral → Oak → black Marble from a fixed comparison camera, followed by a gentle detail move | Use existing PBR materials. A deliberate visitor material choice overrides the automatic demonstration and survives Studio handoff. |
| Shots 19–24 | Descend through the open front cutaway, reach eye height, settle, then invite interaction | Preserve native reversible scroll, optional user-started film, explicit Look around and existing Studio action. No automatic walk or loading overlay in the story. |
| Mobile story | A composed room view with readable text and reachable controls | Give the room a dedicated upper composition; reduce simultaneous chrome; material controls stay separate from copy and the Studio button. Test short/narrow phones as well as 390 × 844. |
| Mobile Arrange screenshot | Direct Artwork / Walls / Floor / Lighting / More dock | Reuse existing upload, placement, materials and history handlers; open only the requested tools. More keeps ceiling, objects, project details and AI direction reachable. |
| Mobile Materials screenshot | Large two-column material previews, selection feedback, explicit completion | Focused sheet with close/Escape, expand option and focus return to the activating dock button. Scene stays mounted while switching tools. |
| Mobile Walk screenshot | Maximize the room, obvious return to Arrange | Hide editing dock/sheet during Walk, retain the real view switch and touch navigation. |

## Acceptance

Verify camera continuity and clearance of the front wall, sequential/reversible reveals,
fixed material-comparison pose, settled final frame, manual material persistence,
quiet loading, reduced motion, mobile tool reachability, upload/selection,
material apply/Undo, sheet dismissal/focus restoration, Arrange/Walk and publish
review. Run the production build and full Linux browser gate with the recently
corrected CI budgets. Keep all quality ceilings and compatibility identifiers.

Record final results and asset provenance after implementation. No automatic
commit, publishing or live Firebase mutation is authorized.

## Implementation

- 24 bounded camera segments, stationary comparison shots, three individual
  artwork reveals and stable sculpture/bench positions. The installed shell has a
  solid south wall, so the front cutaway stays open until the camera is inside;
  this does not invent a doorway or pass through a visible wall.
- Floor/wall clipping reveals existing authored geometry with unchanged UVs;
  daylight and artwork lighting arrive with their stages. Native scrolling can
  reverse the entire sequence. No renderer or GLB reload for these changes.
- The material score demonstrates Mineral → Oak → Marble. A deliberate choice
  overrides the demonstration and remains in the real saved Studio handoff.
- Mobile story reserves separate room/copy/control areas, including 320 × 667.
  Look around explicitly enters touch navigation; Back to story restores native
  scrolling. Reduced motion shows a completed stationary room and readable copy.
- Mobile Studio dock: Artwork, Walls, Floor, Lighting, More. Focused light sheets
  offer large swatches, a pinned Done action, close/Escape and focus return. The
  room preview resizes with the sheet and preserves viewing direction/zoom ratio.
  More retains ceiling, objects, AI direction, history and project details.
- Publication review uses an intrinsic responsive cover grid. No live publication
  was performed. Existing upload, placement, validation, persistence and account
  boundaries are retained.
- Removed superseded sheet CSS and the forced extra scene chunk. The Three vendor
  boundary remains. Known shader comments/whitespace are compacted; independent
  token comparison covers every installed chunk, with no shader instructions or
  rendering quality removed. All release ceilings remain unchanged.

## Blender and assets

The camera study was regenerated and reopened to validate all 1,729 poses, vertical
FOV and overhead visibility. Three new 960 × 540 Cycles QA stills were rendered.
This remains a camera study with the source's four beauty panels and walnut bench;
it does not claim pixel parity with the runtime's construction, material swaps or
three-work draft. Existing runtime GLBs, 4K masters and PBR maps are untouched.
The opening posters now match the first floor-plan shot; no old loading bar or
finished-room poster flashes into the sequence. No third-party assets were added.

## Verification

- `npm run check`: passed, including 61 unit-test files / 348 tests, script tests,
  premium contracts, normal and production-feature builds. Lint has no errors;
  three existing Fast Refresh warnings concern scratch artifacts.
- Final production-feature artifact in pinned Chromium on macOS: **14/14 passed**,
  no retries, 1.5 minutes. Includes all three room arrivals, stable Arrange redraws,
  roof/Walk switches, scroll/film controls, real material handoff, touch exploration,
  mobile tools, upload, Undo/Redo, explicit draft recovery and publication review.
- Public production configuration (App Check and Functions telemetry branches)
  in Ubuntu arm64 / pinned Chromium SwiftShader / 2× CPU slowdown: **14/14 passed**,
  no retries, 3.5 minutes. This is a local Linux software-GPU reproduction, not a
  claim that GitHub's amd64 runner or a live deployment has completed.
- Visual captures at 1440 × 1000, 390 × 844 and 320 × 667: readable separate
  story controls; reachable sheet completion; no horizontal mobile overflow.
  Both mobile publication reviews report valid geometry and zero warnings.
- Blender source reopened and validated against all 1,729 sampled poses; original
  material detail functions and retained material nodes match their recorded hashes.
- `git diff --check`: passed.

Final public production build, gzip bytes (existing ceilings unchanged):

| Measurement | Actual | Ceiling |
| --- | ---: | ---: |
| Total JavaScript | 574,720 | 575,000 |
| Total CSS | 53,718 | 54,000 |
| Largest lazy JavaScript | 175,028 | 195,000 |
| Entry JavaScript | 303,087 | 305,000 |
| Entry CSS | 32,476 | 32,500 |

The lower aspirational performance targets remain open; entry CSS and total JS
headroom is small. Hardware Safari and Android GPU testing remain outside this
local Chromium verification. No commit, push, live deployment or publication was
performed.
