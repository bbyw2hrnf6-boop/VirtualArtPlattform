# LIEUVA — Screenshot review and production notes, 9 September 2026

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
