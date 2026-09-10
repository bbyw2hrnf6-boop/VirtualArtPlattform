# LIEUVA — Screenshot review and production notes, 9 September 2026

> Latest CI follow-up: [10 September Linux reproduction and browser timing correction](./LIEUVA-CI-SMOKE-2026-09-10.md) supersedes this document's earlier unchanged-timeout notes. All twelve browser checks now pass in the local Linux verification; remote deployment success is not implied.

## Before implementation

Reviewed all eleven supplied concepts against the running homepage and the actual
Studio, sharing, loading and scene code at `8b0c108`. The references are visual
proposals, not evidence of supported features or instructions to reproduce them.
LIEUVA, Instrument Serif, Manrope, warm neutrals and the restrained acid accent
remain the visual language. Existing identities, routes and publishing rules stay.

| Image | Useful idea | Decision for this pass |
| --- | --- | --- |
| 1 — desktop home | Room dominates; clear creation/exploration actions; readable sequence from choosing to sharing | Keep the existing room story and working template cards. Clarify chapter navigation and keep the room visible behind a smaller editorial caption. Do not replace the entire homepage with a static mockup. |
| 2 — Explore | Generous thumbnails, creator attribution, direct entry | Preserve the real directory, search and listing logic. No fabricated exhibitions or creator identities; no redundant grid/list control without a real need. |
| 3 — Arrange | Unobstructed room; roof/mode controls; contextual tools | Preserve the existing functional Arrange/Walk, roof, move/rotate/scale and undo controls. Improve material previews within the existing tool system. |
| 4 — visitor discussion | Room remains the main canvas, secondary discussion panel | Preserve existing discussion/access behavior. Do not add fake comments or a second emoji implementation. |
| 5 — mobile home/Explore/discussion | Readable first screen, wide touch targets, sheets instead of cramped panels | Check 390 × 844; use a compact story caption and chapter control. Preserve real mobile navigation/discussion rather than adding another persistent navigation bar. |
| 6 — My Spaces | Clear Open Studio / Preview / Share hierarchy | Retain current project/recovery destinations; add a truthful return path from publication success where appropriate. No invented edit dates or alert counts. |
| 7 — mobile materials | Large texture swatches, explicit completion, room still visible | Use actual material imagery instead of abstract colour chips for floors; retain existing sheet resizing and Walk return controls. |
| 8 — publication success | Real cover, visible link, immediate copy/open actions | Make link copying available directly after publication; keep QR/native sharing, permissions, expiry and continue-editing behavior. A private link must not imply public access. |
| 9 — artwork upload | Clear selection, preview, validation and cancellation | Retain supported formats and current upload transactions. Do not promise HEIC or change validation based on text in a concept. |
| 10 — collection storyboard | Six deliberate composition beats: arrival, placement, detail, collection, object, held overview | Author a longer continuous camera score with holds and controlled reveal; keep the actual sample collection and Studio handoff. No pretend editor panels. |
| 11 — architectural storyboard | Calm aerial approach, architecture before collection, consistent pacing | Start with an authored elevated room view and settle into an interior dolly. Use the actual room geometry; no invented wireframe/building capability. Target a 72-second optional film with free native scrolling and reduced-motion alternative. |

## Concrete production plan

1. Replace the short single dolly (380 desktop / 310 mobile viewport heights)
   with a longer four-chapter architectural score. Provide optional play/pause,
   chapter jumps and a way to continue below the story. Native scroll remains
   available; no wheel/touch interception or forced tour.
2. Keep a real room poster during preparation, then reveal the prepared canvas.
   Homepage preparation must never show a room progress bar. Errors and retry
   remain accessible. The three actual room entries use one visual loading
   contract, including their pre-scene fallback, followed by the existing
   readiness-gated introduction.
3. Improve surface scale/detail and the floor picker using real runtime material
   inputs. Preserve the approved black marble and all ceiling finishes. Review
   material appearance in local Blender and the actual browser renderer; beauty
   images are not substitutes for interactive verification.
4. Improve publication success with a visible link/copy action and clearer
   cover/context. Preserve public/unlisted/private, QR, native share, access
   manager, expiry, update and editor return.
5. Verify Desktop/Mobile, forward/reverse story motion, reduced motion, no loader
   flash, all three room arrivals, material editing/undo and publishing review.
   Run the locked quality gate AND Chromium browser smoke, including production
   configuration. Keep enforced performance ceilings and existing room assets.

## Acceptance evidence

Implemented and verified locally on 9 September 2026:

- **Story:** 900svh desktop / 720svh compact, ten authored camera stops and an
  optional 72-second playback. Native scroll reverses the sequence. Four chapter
  controls, explicit pause and a direct skip below the entire section. Keyboard
  and touch activation of Pause do not restart the film. Reduced motion presents
  the completed stationary room and readable sequence text. Studio handoff saves
  the real selected finish, artwork and decor as a recoverable local draft.
- **Preparation:** route/module/manifest placeholders and the room renderer share
  the same arrival design; the retired decorative 65% bar and Danny poster style
  are removed. Homepage preparation uses responsive captures of the exact opening
  pose (24,516 desktop / 5,714 mobile bytes), followed by a dissolve after GPU
  readiness. It never displays a room progress bar. Visible errors/retry remain.
  The renderer's texture/reflection/shader/frame gate and intro sequencing remain.
- **Materials:** metric mapping and independent fine relief on concrete, limestone,
  natural oak, microcement, dark concrete, slate and terrazzo. Natural oak relief
  follows albedo grain. Black marble and other wood/ceiling formulas are retained.
  Eleven actual raster previews plus existing procedural samples keep their IDs.
- **Mobile:** two-column, 80px material previews; Done collapses the sheet and
  returns focus; half/full sheet state is reported correctly. Finale swatches and
  the Studio action have separate touch areas. Publication success uses one
  vertical scroll surface on compact screens.
- **Sharing:** direct URL and Copy link on success, retained QR/native sharing,
  readable labels, focus restoration and an error message when native sharing
  fails. A locally retained 1280×960 maximum capture avoids stretching the 640px
  published thumbnail; the cover has a bounded landscape area. Permissions,
  expiry, update flow, editor return and URL generation are unchanged.
- **Blender:** separate 72-second editable camera source and separate material
  library; three camera and three material closeups at 960×540/16 samples. Their
  manifests distinguish source beauty staging from the actual runtime collection.
  Camera samples, packed materials and independent detail maps were validated.
  Existing three native 4K masters, original source blends and six runtime GLBs
  were not changed. These new stills are QA proofs, not replacement 4K masters.

### Verification

Node 22.23.2 / npm 10.9.8, pinned modern Chromium:

| Gate | Result |
| --- | --- |
| `npm run check` | Passed: lint, 344 unit tests / 60 files, 46 script tests, six GLB validations, default and production-feature builds |
| Chromium smoke — default artifact | 8/8 passed, 31.3 seconds, no retry |
| Chromium smoke — production-feature artifact | 8/8 passed, 33.2 seconds, no retry |
| Isolated publication UI preview | Passed: URL visible, QR generated, mobile single scroll and Open action reachable; no live publish |
| Responsive poster captures | 2/2 ready-gated captures succeeded |
| Blender study validation | 1,729 camera samples, three byte-exact independent detail-map pairs, saved packed source nodes/hashes passed |

The browser tests cover delayed GLB preparation without a visible loader,
forward/reverse chapters, keyboard pause, actual skip boundary, selected-floor
Studio handoff, all three premium room entries, reduced-motion/mobile layout,
material action separation, Done/focus and Undo. Existing public shell and CSP
checks remain. CUA additionally verified the real mobile controls and local
sharing UI, and a held visitor collection: arrival `loading/error` keeps intro
`waiting`; retry reaches `ready` and permits the introduction afterward.

| Production gzip measurement | Bytes | Enforced ceiling |
| --- | ---: | ---: |
| Total JS | 572,414 | 575,000 |
| Total CSS | 52,806 | 54,000 |
| Largest lazy JS | 175,192 | 195,000 |
| Entry JS | 302,194 | 305,000 |
| Entry CSS | 31,790 | 32,500 |

All enforced limits pass. The lower aspirational WP2 targets remain open; no
ceiling was raised. Browser tests use desktop 1440×1000 and compact 390×844
emulation, not a physical mobile benchmark. Production-feature validation uses
the repository's public fixture configuration; private GitHub secrets/live
hosting were not inspected or changed. Publishing UI was exercised in a labelled
local fixture; access/publishing behavior is covered by existing unit contracts.
No claim of a new authenticated live end-to-end publication is made.

Audit logs and screenshots are under ignored `artifacts/editorial-*`,
`artifacts/playwright-results/`, and
`artifacts/homepage-production-smoke-results/`. Screenshot source decisions above
were written before implementation. No commit, push, deployment or live
publication was performed.

## CI timing correction after revision `28869a0`

The owner supplied a failed GitHub browser-smoke log: six tests passed; the
desktop story did not mount within the assertion's five-second default and the
mobile fourth chapter did not settle within five seconds. The previous local
hardware-rendered passes did not cover the runner's slower rendering path.

Forced SwiftShader reproduced the mobile failure locally: after five seconds,
progress was `0.7369663589851587` instead of exceeding `.754`. The desktop test
also failed locally, at its separate poster-transition assertion rather than
the mount assertion reported by GitHub.

The story's exponential smoothing and optional playback capped every elapsed
frame at 80 ms. At low frame rates that discarded real elapsed time, delaying
chapter selection and extending the nominal 72-second film. Both now use actual
nonnegative elapsed time; the existing visibility pause/reset remains. A new
regression compares forward and reverse settling after one second at 1 fps and
25 fps. Camera stops, interpolation paths, materials, DPR/shadow quality settings,
geometry, source blends and images are unchanged.

Only the deferred-mount and poster-transition assertions receive the same bounded
30-second preparation allowance already used by the room readiness checks. The
two-scene desktop journey has a 90-second total allowance. Chapter convergence
still must pass within five seconds; no test is skipped and no retries are needed
to qualify a pass. `LIEUVA_BROWSER_SMOKE_SOFTWARE_GL=1` makes the slow rendering path
reproducible through the standard Playwright configuration without changing the
product's quality settings.

The Blender validator still compares all 1,729 camera samples/proof poses exactly,
checks original asset hashes and independent material buffers. It now records
the current runtime-code hash separately from the historical authoring-code hash,
so a timing-only code edit does not require relabelling or regenerating unchanged
Blender scenes. That validation passed.

Local follow-up evidence: both affected tests passed under SwiftShader (1.7 min);
`npm run check` passed with 345 unit tests, 46 script tests, six GLB validations
and both builds. The complete default Chromium suite passed 8/8 (26.4 sec), and
the complete production-feature suite passed 8/8 under SwiftShader (3.2 min),
both with retries explicitly disabled. Desktop 1440×1000 and compact 390×844
captures were visually reviewed. Production gzip: JS 572,411 bytes, CSS 52,806,
largest lazy JS 175,192, entry JS 302,196, entry CSS 31,790. All existing ceilings
pass; no ceiling was raised. Logs are under ignored `artifacts/deployment-*`.
No GitHub run, commit, push or deployment was triggered.

## Second CI follow-up after revision `25eceee`

Read the actual logs of GitHub run `34394176346`, production job `102610240390`.
The mount checks progressed, but the desktop oak click exhausted the 90-second
journey budget after the button had become visible/stable; mobile chapter progress
again missed five seconds. The earlier local passes did not establish runner
reliability. Only the policy archive was retained by that run, so its referenced
Playwright traces/screenshots were unavailable through the artifacts endpoint.

Local SwiftShader plus 6× CDP CPU throttling reproduced the mobile failure before
this follow-up (the first progress sample remained zero). Profiling also showed
long WebGL/reflection tasks. A stationary homepage kept submitting identical 3D
frames, competing with input and compositor work on the software GPU.

Implemented:

- Explicit chapter selection publishes its UI state and destination immediately.
  Normal native scrolling and optional film playback still use the authored camera
  path and time-based smoothing.
- The shared renderer skips unchanged frames only for a non-interactive homepage
  presentation. Camera/reveal changes, cutaway settling, material/draft updates,
  late texture completion, resize and completed room reflections invalidate it.
  Look Around, Studio and visitor navigation keep continuous rendering.
- Homepage cutaway opacity settles by elapsed time and reaches an exact endpoint;
  it no longer takes dozens of expensive low-FPS frames to settle. Other editor
  cutaway interpolation retains its existing behavior.
- Browser tests wait for the actual rendered chapter and completed preparation,
  assert that a resting story stops drawing and that material editing draws again.
  No force-clicks, disabled WebGL, skipped cases, reduced room assets, quality caps
  or further timeout increases are used. CPU throttling is an opt-in test setting.
- Both workflow branches retain failed Playwright diagnostics for seven days.
  The browser gate still blocks release after failure; no continue-on-error path.
- Visual review caught a separate existing reflection defect, also reproduced in
  a build of unchanged `25eceee`: the mobile interior was nearly black under
  SwiftShader despite successful DOM checks. GPU readback found five invalid RGB
  texels (15 half-float NaN components) in the raw 128px room cube. PMREM filtering
  spread these into 29,034 non-finite components. A small GPU pass now repairs only
  invalid samples from finite neighbors before generating mipmaps/PMREM. A fresh
  readback finds zero invalid values in all six repaired faces and the PMREM;
  the interior is visibly lit again. This keeps HDR, room lighting, reflections
  and existing probe resolution. There is no production GPU-to-CPU readback.
  A separate native-GPU check of all three rooms compared original finite texels
  against the repaired captures: zero changed valid RGB texels across all 18 cube
  faces, and zero non-finite values in the resulting PMREMs. Arrange and Walk
  Preview captures at 1440×1000 were reviewed for White Cube, Warm Gallery and
  Grand Forum (`artifacts/ci-final-room-visuals.log`).
  The mobile smoke test now checks a rendered pale-wall patch as well as DOM
  controls, so this black-room failure cannot silently pass that journey again.

Camera poses, GLBs, images, materials, texture/probe/shadow resolutions, and Blender
sources are unchanged. The Blender camera and material/hash validator passed;
workflow YAML parsed and its failure-only artifact retention was checked. The
first targeted rerun with software rendering and 6× CPU throttling passed both
affected journeys. Final full-suite results follow.

Final source validation: `npm run check` passed (345 unit tests, 46 script tests,
six premium GLBs, lint/type checks and both builds). Default Chromium passed all
eight browser journeys in 26.5 seconds with retries disabled. Camera/material
validation again passed all 1,729 samples and original asset hashes. Production
gzip is 573,423 bytes JS, 52,806 CSS, 175,202 largest lazy JS, 302,195 entry JS and
31,790 entry CSS, within every existing enforced ceiling. Stretch targets remain
open.

The final production artifact also uses the actual public App Check site key
observed in the failed CI job, with the same functions/production telemetry
branches. This build is 573,433 bytes JS gzip and passes the same ceilings. All
eight browser journeys passed against it under SwiftShader and 6× CDP CPU
throttling in 3.5 minutes, with retries disabled. The mobile wall-color regression
passes and its 390×844 capture is visibly lit; the 1440×1000 story/material capture
was also reviewed. These are local macOS Chromium results, not a claim that the
next Linux GitHub run or deployment has already succeeded.

Final logs: ignored `artifacts/ci-final-check.log`, `ci-final-browser.log`,
`ci-final-public-build.log`, `ci-final-stress.log`, and
`ci-final-blender-validation.log`. The GPU diagnostic readback is confined to an
ignored comparison build; no debugging globals or readback code enter production.
No commit, push, workflow rerun, publishing action or live Firebase write occurred.


## CI trace correction after revision `5b2846e` · 10 September 2026

Inspected [GitHub run 34410049211](https://github.com/bbyw2hrnf6-boop/VirtualArtPlattform/actions/runs/34410049211),
production job `102662590679`, and downloaded its retained Chromium traces and
screenshots. Local HEAD matched the failed revision. Quality and policy jobs,
production configuration, Functions compilation and the production build passed.
Six browser tests passed; two long journeys exhausted their overall test budgets.
The release steps were correctly blocked. This was not the earlier heading or
material-selector failure.

The traces distinguish a missing control from exhausted test time:

- Desktop reached the correct Studio URL after the homepage loading, chapters,
  material edit, film playback/pause and skip checks. Only 12.1 seconds remained
  in the 90-second test on the first attempt, and about 4.7 seconds on retry.
  The Studio's 30-second arrival assertion never received its full allowance.
- Mobile successfully rendered the lit final chapter, passed the wall-luminance
  check, and entered Studio in 18.7 / 19.2 seconds. Two sheet-expansion clicks
  then took about 11–12 seconds each. The full panel and Floor control were
  present in the failure screenshot; the 60-second journey budget had expired.
- Unlike the stationary homepage, Arrange still submitted identical frames
  continuously. These draws competed with UI/compositor work on the software GPU.

Implemented in this follow-up:

- The editor's stationary Arrange view now retains its full-quality frame. The
  animation/input loop remains active and redraws on camera/projection changes,
  draft/selection edits, drag updates and rollback, shadows, reflections, resize,
  late texture completion, visibility return and WebGL context restoration.
  Walk, tours, interactive homepage navigation and public visitor rendering stay
  continuous. Adaptive-DPR sampling excludes idle time.
- Editor cutaway opacity now settles by elapsed time to an exact endpoint,
  allowing a resting room to stop drawing even on low-FPS hardware. Existing
  opacity targets, materials, shadow/probe sizes and asset resolutions remain.
- Split independent homepage film, chapter, material-handoff and mobile-editing
  concerns into focused browser tests with fresh contexts. Real desktop/mobile
  Studio handoffs remain covered; desktop still verifies the selected oak floor
  survives. No force-clicks, skipped tests, disabled WebGL, release-gate bypass or
  increase of existing 60/90-second journey and 30-second arrival budgets.
- Added assertions for stationary rendering in all three rooms, camera/roof
  redraw, Walk/Arrange transitions, and an intentionally delayed oak image that
  must redraw after completion. Mobile Done/focus restoration and Undo remain
  covered; every story/Studio test now checks uncaught browser errors.

The room GLBs, Blender source/beauty assets, camera score, material images and
independent relief maps are unchanged. The story validator refreshes only the
current runtime source hash: all 1,729 authored camera samples, source/output
hashes and concrete/limestone/oak detail buffers still match.

Final verification (Node 22.23.2 / npm 10.9.8):

- `npm run check`: passed; 345 unit tests, 46 script tests, six premium GLBs,
  lint/type checks, standard build and production-feature budget build.
- Final Chromium suite: 12/12 passed in 40.2 seconds, retries disabled.
- Final production build with the public App Check key from the failing job and
  functions/production telemetry: 12/12 passed in 4.9 minutes under SwiftShader
  and 6× CDP CPU throttling, retries disabled; successful traces retained locally.
- Three additional local room checks passed in 13.6 seconds: Arrange and Walk
  captures for White Cube, Warm Gallery and Grand Forum, plus a deliberate
  WebGL context loss/restoration while White Cube was idle. The restored canvas
  redraws; room screenshots and the desktop/mobile smoke captures were reviewed.
- Authored camera/material validator passed again: 1,729 identical camera samples,
  matching asset hashes and byte-exact concrete/limestone/oak detail maps.
- Final production gzip: JS 573,561 / 575,000 bytes; CSS 52,806 / 54,000;
  largest lazy JS 175,202 / 195,000; entry JS 302,195 / 305,000;
  entry CSS 31,790 / 32,500. Every existing enforced ceiling passes; lower
  aspirational targets remain open.

Evidence: ignored `artifacts/ci-run-34410049211/` contains the original runner
traces/screenshots; `artifacts/ci-344100-final-{check,native,software,public-build}.log`,
`ci-344100-camera-validation.log`, `ci-344100-room-qa.log`, and their screenshot/
trace directories contain local results. macOS software rendering is a useful
stress check, not an exact Linux runner or physical-mobile benchmark. The next
owner-triggered GitHub run must still confirm remote success.
No commit, push, remote workflow rerun, deployment or live Firebase write occurred.
