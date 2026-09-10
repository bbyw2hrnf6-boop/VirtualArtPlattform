# Production Chromium smoke timing · 10 September 2026

## Observed failure

Inspected [run 34454116851](https://github.com/bbyw2hrnf6-boop/VirtualArtPlattform/actions/runs/34454116851),
production job `102796891416`, including retained action traces, browser traces
and screenshots. Its revision `11f421d585c1cb62eb21ee5c25e4d15cd61d7ce8`
matched the clean local checkout. Quality, Firebase policy, Functions compilation
and the production build passed. Chromium reported ten passed tests, one flaky
film test and one failed Arrange/Walk test. Release remained correctly blocked.

The traces explain why earlier macOS-only verification was insufficient:

- After the film's Skip click, a browser query took 6.06 seconds to return. The
  polling assertion had already expired at five seconds. Its result arrived
  after the test had been marked failed; this was not a missing Skip button.
- The first Arrange attempt expired while waiting for a changed camera position.
  On retry, the same camera assertion succeeded after 7.48 seconds. Ceiling and
  Walk interactions then succeeded, but individual queries/clicks took roughly
  4.5–7.7 seconds. The overall 60-second test expired before the remaining frame
  and return-to-Arrange checks could finish.
- The material previews, real desktop/mobile Studio handoffs and the three room
  arrival checks passed in this run. No uncaught page errors were recorded.

## Reproduction and correction

A fresh isolated Ubuntu 24.04 ARM64 VM was created with Lima/Apple Virtualization
on the local Mac: four virtual CPUs, 4 GiB RAM, Node 22.23.2, npm 10.9.8,
Playwright 1.62.1 and its locked Chromium 151.0.7922.34. The VM uses an unchanged
production-feature build with the public App Check configuration from CI, actual
room GLBs and material assets. The project mount is read-only; test copies and
dependencies are isolated in the guest. A nested ignored artifact directory
holds results. This exercises Linux but does not claim identical hardware to
GitHub's x86_64 runner or performance on a physical phone.

Before changes, the two reported tests were repeated twice with their original
configuration: one film failure and three passes. The failed film's query took
5.44 seconds against its five-second deadline, reproducing the CI failure.
An A/B check disabling only trace-filmstrip screenshots still failed twice in
six runs. Continuous screenshot recording is therefore not treated as the root
cause, and full trace/screenshot diagnostics remain enabled.

The correction is confined to test configuration and removal of conflicting
per-file/per-test timeout overrides:

- Central assertion, action and navigation deadlines are 30 seconds. Each
  functional journey has a 180-second aggregate budget so several valid slow
  interactions can finish. Existing 30-second scene preparation checks remain.
  Polling still stops immediately on success; no fixed sleeps were added.
- CI explicitly selects SwiftShader with the pinned full Chromium. Local runs
  can select the same backend with `LIEUVA_BROWSER_SMOKE_SOFTWARE_GL=1`.
- All twelve tests and every behavioral/visual assertion remain. No force-clicks,
  test skips, retry increase, release-gate bypass, asset substitutions, pixel
  resolution reductions or room/rendering changes were introduced.

This supersedes earlier notes describing unchanged 60/90-second journey budgets
as part of the previous fix. The measured runner delays justify revising those
test deadlines; frontend asset/performance ceilings remain unchanged.

## Verification

All verification uses Node 22.23.2 / npm 10.9.8 and the locked browser:

| Check | Result |
| --- | --- |
| Full production-build suite in Ubuntu, SwiftShader, 2× CDP CPU throttling | 12/12 passed, 2.7 minutes; retries disabled |
| Film Skip and Arrange/roof/Walk, three independent repetitions each in Ubuntu, SwiftShader, 6× CPU throttling | 6/6 passed, 2.0 minutes; retries disabled; all traces retained |
| Full production-build suite on native macOS Chromium | 12/12 passed, 39.3 seconds; retries disabled |
| `npm run check` | Passed: lint, 345 unit tests, 46 script tests, six premium GLBs, type checks, standard and production-feature builds |
| Production-feature gzip budgets | JS 573,559 / 575,000; CSS 52,806 / 54,000; largest lazy JS 175,202 / 195,000; entry JS 302,194 / 305,000; entry CSS 31,790 / 32,500 bytes |

No test was skipped or required a retry in the final runs. Desktop 1440 × 1000
and mobile 390 × 844 captures were inspected; lit surfaces and controls remain
visible. The software renderer was queried directly and reported
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)`.
Lower aspirational frontend byte targets remain open; every enforced ceiling
passes. No product source, room/texture asset or Blender file changed.

For local repetition after installing the pinned toolchain/dependencies/browser
and building `dist/`, the same configuration supports:

```sh
CI=true LIEUVA_BROWSER_SMOKE_CPU_RATE=2 npm run test:browser-smoke -- --retries=0
CI=true LIEUVA_BROWSER_SMOKE_CPU_RATE=6 npm run test:browser-smoke -- --grep 'the film|Arrange redraws' --repeat-each=3 --retries=0
```

These commands only run local tests. Ubuntu is needed to reproduce the Linux
environment; setting `CI=true` on a Mac does not change its operating system.
The isolated VM was stopped after verification to release its allocated memory.

Local diagnostics are ignored under `artifacts/ci-run-34454116851/` and
`artifacts/ci-linux-share/`, with logs `artifacts/ci-linux-{baseline,no-filmstrip,final,stress}.log`.
The full project and native-browser logs are
`artifacts/ci-344541-final-{check,native}.log`.
No Git commit, push, remote workflow rerun, deployment or live Firebase write
is performed. A future owner-triggered GitHub run must confirm remote success.
