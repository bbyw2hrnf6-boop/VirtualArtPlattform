# Final browser regression

Date: 2026-08-02  
Target: `http://127.0.0.1:5174`  
Viewports: 1440 × 1000 and 390 × 844  
Authoritative core result: **13 / 13 passed · 0 failed · 0 console diagnostics**  
Audit-closure result: **13 / 13 passed · 0 failed · 0 console diagnostics**
Scroll/Danny follow-up: **11 / 11 assertions passed · 0 unexpected page errors**

The current machine-readable core result is `browser-qa.json → latestRegression`. The repeatable test is `latest-regression.mjs`. New audit action points are covered separately by `audit-closure-qa.json` and `audit-closure-qa.mjs`.

The scroll-story and Danny-lighting follow-up is recorded in `scroll-story-pipe-qa.json` and can be repeated with `scroll-story-pipe-qa.mjs`. It samples all nine exact story phases in both scroll directions, captures representative desktop/mobile frames, verifies the final canvas controls and confirms the Danny lighting runtime metadata. This isolated run loads the built site and local GLBs directly; it does not touch Firebase or live data.

## Exact result

| Check | Result | Evidence |
| --- | --- | --- |
| Desktop landing, hero, and room-showcase markup | Pass | No overflow; hero loaded; three real room-image sources present |
| Mobile landing and touch CTAs | Pass | No overflow; both hero actions are at least 44 px high |
| Template picker uses actual previews | Pass | Three distinct 980 × 752 WebP renderer images; zero CSS mini-rooms |
| Direct template route | Pass | `#/create/white-cube` opens Arrange directly |
| Arrange → Walk Preview | Pass | Same canvas; scene mode `walk`; editing disabled; scoped walk interaction |
| Walk Preview → Arrange | Pass | Same canvas; editing restored; camera returned within 0.043 m after orbit damping |
| Publish cover capture | Pass | Current room view captured as non-blank 652 × 540 WebP; pixel deviation 76.1 |
| Direct refresh recovery | Pass | Refresh preserves `#/create/white-cube` and immediately focuses recovery; no picker step |
| Recovery fidelity | Pass | Exact title `Direct recovery QA` restored |
| Mobile editor | Pass | No overflow; Arrange/Walk controls remain available above the sheet |
| Danny mobile caption/hint | Pass | No overlap; caption is 11 px and `rgb(224, 223, 216)` |
| Danny mobile artwork metadata | Pass | Front artwork opens `wARTrobe · Front` via raycast with artist and description |
| Console regression | Pass | No errors, exceptions, or warnings in the tested routes and flows |

## Resolved findings from the earlier run

- Recovery no longer requires returning to the generic template picker.
- Danny's obvious front artwork now opens metadata on mobile.
- Mobile caption and movement guidance no longer overlap.
- Picker previews now use truthful, distinct renderer captures.
- Publish review now shows a captured room cover instead of deriving it from the first artwork.
- Arrange and Walk Preview share one persistent renderer and keep independent camera state.

## Audit-closure result

The additional 13/13 run verifies the instant three-work sandbox, exact centimetre dimensions, four frame options, lock/hide, transactional left/centre/right alignment, equal wall spacing, selected-artwork Walk Preview start, Reset View, one persistent canvas, five Grand Forum camera zones, the mobile editor header and 44 px controls, Danny's 45-second guided tour, 14 Smart Views, eight authored routes, Reset View, the seven-work accessibility directory, Escape close, and focus return.

Useful evidence: `audit-closure-qa.json`, `regression-editor-precision.png`, `regression-forum-zones.png`, `regression-editor-mobile-final.png`, and `regression-danny-directory.png`.

## Scope note

The regression did not publish live data or invoke Discover/Firebase. It therefore does not certify deployed Firestore rules or the production publishing path.

## Useful final screenshots

- `regression-landing-desktop.png`
- `regression-landing-mobile.png`
- `regression-template-picker.png`
- `regression-editor-arrange-desktop.png`
- `regression-editor-walk-desktop.png`
- `regression-publish-cover.png`
- `regression-direct-recovery.png`
- `regression-editor-mobile.png`
- `regression-danny-mobile.png`
- `regression-danny-mobile-metadata.png`
