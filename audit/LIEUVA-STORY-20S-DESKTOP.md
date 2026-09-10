# 20-second story and desktop follow-through

Latest direction supersedes the earlier 72-second playback: preserve all 24 shot
compositions, retime playback to 20 seconds, and demonstrate both floor and wall
choices automatically. Native scroll follows the same reversible score. Manual
preview remains possible when paused; starting playback restores automatic styling.

Revisited all supplied desktop/mobile boards. Selected follow-through:
- Put the three-step explanation and three real room previews directly after the
  story. Remove the redundant giant warm-room proof block and five-step explanation.
- Keep material identity and a visible room action on each card; retain technical
  details in an accessible disclosure instead of crowding the editorial grid.
- Give the Creator Hub its own compact visual section using actual room imagery;
  preserve Explore, creator and create actions and all directory functionality.
- Desktop publishing: a full-height room cover beside a light sharing panel,
  clear publication status, space identity and My spaces navigation. Keep existing
  link, QR, access management, expiry and return-to-editor functions.
- Retain the new mobile editor dock/sheets and verify responsive layouts again.

The reference boards' invented people, comments and room renders are not production
content. Existing artwork, room assets, quality settings and compatibility IDs stay
in place. Desktop arrangement controls already expose Arrange/Walk, roof, camera,
selection and numeric transforms; avoid duplicating these as decorative controls.

## Implementation

The user confirmed three clearly distinguishable floors and three walls. The
20-second playback automatically selects Mineral, Oak and black Marble, followed
by Plaster, Clay limewash and Travertine. A visible Floor/Walls palette highlights
the current option. The film starts only after room arrival and demonstration
image decoding. Native scrolling runs the same reversible material score.
Manual choices pause playback and survive immediate Studio handoff; entering the
next material stage or explicitly playing resumes the authored demonstration.

Playback advances from its own clock instead of accumulating rounded scroll
positions. Every authored camera pose remains available. Material changes commit
before the next WebGL frame so React cannot combine away a short demonstration
stage while the GPU is busy. Stationary Arrange cameras use a micrometre-scale
roundoff tolerance relative to the last rendered pose; projection, material,
texture and real camera changes still request a full-quality redraw.

The Blender camera study retains all 1,729 sampled poses and 24 shots. Its timeline
now plays those original intervals in 20 seconds (86.4 samples per second). This
is an editable camera study, not a shipped prerendered video or a claim that every
device renders 86.4 frames per second. Its existing QA stills were reused only
after verifying exact camera poses and source scene/material hashes. Runtime
room GLBs, material resolution, lighting/shader quality, and 4K masters remain
unchanged. The existing opening posters remain valid because the first pose and
construction state have not changed; their manifest retains the actual capture
source hash. The Creator Hub banner reuses the existing licensed room preview.

## Verification

- `npm run check`: passed; 61 files / 349 unit tests, script tests, premium
  contracts, normal build and production-feature budget build. No lint errors;
  three existing Fast Refresh warnings are confined to scratch artifacts.
- Final public production configuration, pinned Chromium on macOS: **15/15**,
  no retries, 1.9 minutes. Includes all three room arrivals, Arrange/roof/Walk,
  native scroll, keyboard playback, real Studio handoff, reduced motion, mobile
  materials and sheet focus, upload, Undo/Redo/recovery and publication review.
- Same public production artifact, Ubuntu arm64 / pinned Chromium SwiftShader /
  2× CPU slowdown: **15/15**, no retries, 4.7 minutes. The full 20-second
  material demonstration additionally passed **3/3** consecutive Linux runs;
  the mobile material/redraw journey passed **3/3** consecutive native runs.
- The repeat checks reproduced and then verified two corrections: React deferred
  updates could omit Oak during timed playback; exact floating-point camera
  equality could keep the mobile Arrange renderer drawing unchanged frames.
  Acceptance checks were retained, including every demonstrated floor/wall,
  idle GPU frames and resumed drawing after texture load and camera movement.
- Actual UI captures inspected at 1440 × 1000, 390 × 844 and 320 × 667;
  no horizontal overflow. Homepage collection/details, Creator Hub section and
  mobile story actions remain readable and reachable.
- Publication-success JSX exercised through an isolated local fixture with the
  real sharing component and stylesheet order: Copy link and QR pass at desktop
  and mobile sizes. Success layout uses sample data; no Firebase write or live
  publication was performed. Live ACL/account combinations were not retested.
- Blender validation: all 1,729 camera samples and original source/material
  hashes verified, with byte-identical retained material-detail outputs.
- Final mobile Creator Hub spacing adjustment: image now begins below the last
  action. Rebuilt both configurations, re-ran `npm run check`, visually checked
  390 × 844 and re-ran the two public-shell/CSP smoke checks. Full journey results
  above precede this CSS-only image-height adjustment.
- `git diff --check`: passed.

Public production artifact, gzip bytes (existing ceilings unchanged):

| Measurement | Actual | Ceiling |
| --- | ---: | ---: |
| Total JavaScript | 574,779 | 575,000 |
| Total CSS | 53,125 | 54,000 |
| Largest lazy JavaScript | 175,028 | 195,000 |
| Entry JavaScript | 302,915 | 305,000 |
| Entry CSS | 31,854 | 32,500 |

The lower aspirational targets remain open and JS headroom is narrow. The local
Linux reproduction uses arm64; it does not claim a completed GitHub amd64 run.
Hardware Safari/Android validation remains separate. No commit, push, deployment
or live publication was performed.
