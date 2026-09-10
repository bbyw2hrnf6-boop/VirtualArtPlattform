# Follow the work and playback release correction

## Design decisions

The supplied homepage reference is a layout direction, not a source of real posts. Adopt its large exhibition preview, artist attribution, an expandable note, Explore Spaces as the primary action, dark palette, fine dividers and stacked mobile composition. Use the existing Threshold capture and Danny Hirsch Arts artist destination. Label the room as a reference exhibition and the authored exhibition note as LIEUVA editorial content. Do not fabricate a Field Studies publication or attribute an invented post to Danny. Keep the established Explore dialog and Studio routes.

## Deployment diagnosis

GitHub Verify 34497759523, revision 4418b72, failed one of fifteen browser tests. The retained trace records multiple-second gaps on its software GPU. In the retry, the observed floor sequence went from concrete straight to black marble, while the Play button returned too late on the first attempt. Local passing tests on Apple/ARM were insufficient evidence of GitHub success.

The film now uses an absolute monotonic clock, preserving each authored material comparison when catching up after a delayed frame. Pending full-quality six-face reflection captures defer while the presentation moves and regenerate once it rests; manual previews still refresh. No room assets, material maps, probe resolutions, CI tests or timeout ceilings are reduced. The 24 camera shots and the 20-second timeline remain.

## Validation before promotion

- Unit regression simulates a frame resuming beyond every material phase, verifying all three floors and walls before completion.
- All 15 full-production Chromium browser journeys passed with SwiftShader and 2x CPU throttling on macOS.
- The critical full-playback journey passed three consecutive Ubuntu ARM64/SwiftShader runs with 2x CPU throttling.
- Homepage inspected at 1440, 390 and 320 pixels; no horizontal overflow. Explore dialog and note expansion work.
- Final locked checks, final artifact tests and GitHub/live verification are recorded after completion; this document does not itself assert publication.

## Final local artifact

`npm run check` passed: 350 tests across 61 files, repository script checks, asset validation and both ordinary/public-configuration production budgets. Exact-public build: JavaScript gzip 574,973 bytes; CSS gzip 53,407 bytes. Existing release ceilings are unchanged. The final artifact passed all 15 Chromium journeys under Ubuntu ARM64/SwiftShader with 2x CPU throttling, without retries.

The small telemetry sender is co-located with the Firebase adapter it already depends on; four safe minifier passes retain the existing ES2020 target. No SDK functionality is removed. Final homepage checks use the built artifact at 1440, 390 and 320 pixels.

## GitHub follow-up: probe callback race

The pushed `2b8ae4b` passed 14 of 15 browser journeys on GitHub Verify
`34528419790`; full playback still exceeded its unchanged 30-second assertion.
Retained traces are in `artifacts/failed-34528419790/`. A progress comparison alone
cannot distinguish a paused shot from a running film whose next RAF callback has
not executed. A pending six-face probe can run first, read the previous progress,
and enter the expensive bake.

The scene now reads the film's existing playback ref directly before baking.
This is the same source of truth used by Play, Pause, input cancellation and page
visibility, so it cannot lag one animation frame behind the controls. Pending
probes remain deferred until playback stops; probe resolution, scene assets,
shadows and smoke deadlines are unchanged. React's primitive state bailout
replaces a redundant updater around the shot number.

Verification evidence:

- `film-active-check-final.log`: complete check, 350 unit tests, release budgets.
- `film-active-stress.log`: three playback runs at 6x CPU throttle, no retries.
- `film-clock-regression.log`: deliberately delay the presentation clock 900 ms
  between callbacks; fixed playback passes with all six finishes and no probes.
- `film-clock-mutant.log`: same test and artifact, with only the playback guard
  removed in an isolated local copy, fails the new assertion with TEN probe bakes
  during playback. This confirms the regression check catches the exact race.
- Browser smoke now asserts no reflection bakes while playing and retains scene,
  transport, material and probe diagnostics even when an assertion fails.

The isolated mutation artifact is diagnostic only and must never be deployed.
The final production artifact remains `artifacts/ci-exact-public`.

Additional stress limitation: the complete 2x-CPU run passed 14 journeys including
film playback, but Google's third-party reCAPTCHA iframe raised `reCAPTCHA Timeout
(j)` during Nocturne's renderer preparation. Two isolated 2x repeats reproduced
that external iframe timeout. Scene arrival/idle assertions passed. The page-error
assertion, App Check configuration and all security behavior remain unchanged.
A fresh complete run with the actual CI settings (SwiftShader, no additional CDP
CPU multiplier, retries disabled) is recorded in `film-active-ci-all.log`.

Final CI-settings result: **15/15 passed, zero retries**, in 6.3 minutes. The exact
production build is within all enforced budgets (574,978 bytes total JS gzip;
fixture configuration 574,979). `npm run check` and the final lint pass also passed.
