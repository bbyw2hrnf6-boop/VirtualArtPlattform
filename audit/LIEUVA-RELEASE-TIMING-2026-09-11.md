# Production smoke timing and draft persistence — 2026-09-11

Starting revision: `ef9739e`. Failed Verify: `34534920861`, job `103064671484`.
The retained diagnostics show **zero reflection bakes during playback**, all six
materials, and eventual progress 1. Both attempts rendered only 28 frames in total
and remained at balanced quality. The previous probe fix is working; the remaining
30-second assertion was coupling a functional timeline check to Linux software-GPU
throughput.

## Changes

- Bound adaptive quality sampling by two seconds of active rendering as well as
  120 frames, with at least four samples. Very slow GPUs can now adapt during a
  short film. Idle/loading resets and sustained recovery remain intact.
- Drive the final Chromium integration journey with Playwright's controlled clock,
  installed before navigation. Assert all **24 rendered camera shots**, the correct
  floor/wall at each shot, playing at 19.98 seconds and stopped by the next frame
  after 20 seconds. Still check three floors, three walls, the final interior,
  absence of loading bars and no reflection bakes while playing. Production assets,
  Three.js rendering, material changes and the 30-second assertion limit remain real.
  The native-clock playback check is also retained as separate local evidence.
- Invalidate `data-render-idle` synchronously when the roof changes. It previously
  described the old stationary image after `Preview ceiling`, before its pending
  redraw. The strict four-frame stationary-scene assertion remains unchanged.
- Invalidate the Studio's Saved status in the layout phase of each edit/Undo/Redo,
  before the new draft is painted. The 450 ms write debounce remains. Request IDs
  now invalidate earlier completions before the updated UI is visible.
- Resolve IndexedDB operations only after `transaction.oncomplete`, rather than
  request success. An abort after a successful put now reaches the existing local
  fallback instead of falsely reporting a saved draft. Database names, schema,
  revision ordering, fallback keys and publication identities are unchanged.

The last two changes address a real failure found during full verification:
mobile upload → Undo → Redo → Saved → reload recovered only three of four artworks.
The browser journey now records the save label in the same DOM commit as Redo,
then checks persisted recovery and publication review.

## Verification evidence

- Clean locked installation, Node 22.23.2 / npm 10.9.8.
- `npm run check`: 353 tests in 61 files, script/GLB/build checks passed.
- Production-configured build uses the public live App Check site key and production
  telemetry settings. Enforced bundle ceilings stay unchanged.
- Native-clock 20-second playback on Chromium/SwiftShader passed the original
  30-second completion assertion, with all six finishes and no active probe bakes.
- Controlled-clock integration passed all 24 shots. A separate mutant artifact
  with a 30-second duration failed on the rendered timeline assertion.
- Both new storage tests fail against the old implementation and pass against the
  fix: save acknowledgement follows commit; aborted puts preserve fallback data.
- The pre-storage-fix full suite passed 14/15 and exposed the mobile recovery loss
  above. This was repaired rather than bypassed or retried into a success.
- The stale Saved-label regression also fails against the old production artifact
  and passes with the repair: the Redo DOM commit must already report Saving.
- Final full production Chromium/SwiftShader suite: **15/15 passed in 7.0 minutes,
  one worker, zero retries**. Includes desktop/mobile story, all room arrivals,
  Arrange/roof/Walk, touch controls, upload/history/recovery/publication review and
  the complete controlled 20-second film.
- Final production build and targeted ESLint passed. JavaScript gzip is 574,973 /
  575,000 bytes; CSS gzip is 53,407 / 54,000. No budget or timeout was relaxed.
- Remote publication is pending. The Mac is locked, so the authenticated GitHub
  Desktop push cannot yet run. The existing 15-minute follow-up remains active;
  remote Verify, deployment and live checks must still succeed before completion.

Evidence logs and deliberately broken comparison artifacts are ignored local
files under the isolated worktree's `artifacts/`; they are never release inputs.
Controlled clock rationale: https://playwright.dev/docs/clock

## Integration

The parallel repository cleanup is separate. No cleanup changes are staged or
committed by this repair. Publication requires successful Verify and automatic
`Deploy verified production artifact` for the resulting main SHA, followed by
live asset verification and the production HTTP smoke. A local pass alone does
not establish live success.
