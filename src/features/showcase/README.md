# Bespoke visitor direction

Obsidian, Sculpture Pavilion and Forest Fold House reuse `ObsidianScene` and
the normal Walk/Overview controls. They remain separate from Studio templates.
Blender masters, licensing and asset reproduction stay in the corresponding
[`blender/showcases`](../../../blender/showcases/) contracts.

## Camera and motion

- `showcaseFlights.ts`: authored Y-up camera/subject positions, timing, FOV and
  guided stops. Forest stops come from `forestRooms.ts`. Blender positions map
  `(x,y,z)` to `(x,z,-y)`; check artwork IDs before changing a gaze target.
- `cameraFlight.ts`: time-aware cubic Hermite interpolation with continuous
  velocity and eased endpoints. Separate subject rails and a fixed Y-up horizon
  avoid camera roll and abrupt per-shot easing resets. Portrait widens FOV.
- `showcaseDirector.ts`: one camera owner. Guided visits use the existing
  collision/navigation graphs; only authored film rails deliberately cross the
  shell. Pause freezes the clock. Film exit/end restores the prior walk camera;
  tour exit retains a reachable position. Direct camera input cancels direction.
- All three rooms have guided visits, pause/resume, previous/next and exit.
  Reduced motion uses explicit still stops. Tab hiding/window blur pauses motion.

The Forest entrance offers an optional **36-second flight** through the garden,
glass bridge and rooms. Entering normally preserves free Walk. The flight's
scrubber permits inspection/replay; visitor HUD yields to a compact film dock.

`landing/ThreeWorldStory.tsx` adds the **64-second Three worlds journey** under
Beyond Studio: Obsidian 22 s → Sculpture 20 s → Forest 22 s. Play and native,
reversible scroll sample the same rails. Painting/bronze image transitions cover
scene loading. Loading pauses active film time, so slow devices can take longer.
The existing 20-second Studio introduction is unchanged.

## Loading and quality

No bespoke GLB loads until the visitor opts in. Only one bespoke scene/context
is mounted at a time; scene disposal releases geometries, textures and renderer.
Loading retains a poster, failure retains static navigation, and reduced motion
uses still chapters without loading bespoke 3D. Scene readiness waits for shader
warm-up draws. Native scrolling stays available; no scroll lock or wheel capture.

Flights use the existing full-detail assets, reflections and GPU calibration.
This feature does not replace or re-render the Blender masters. Aggregate release
allowances deliberately increase by **8 KB gzip JS and 2 KB gzip CSS** for rails,
direction and cinematic UI. Entry, largest-chunk, Studio-asset and product-target
budgets are unchanged; see `scripts/lib/performance-budgets.mjs`.

Direction references: [DJI Cine mode](https://repair.dji.com/help/content?customId=01700006544&lang=en&paperDocType=ARTICLE&re=US&spaceId=17)
informs gentler acceleration, braking and rotation; [Three.js curve sampling](https://threejs.org/docs/pages/Curve.html)
informs separating camera trajectory from gaze. Temporal Hermite rails preserve
the authored shot durations; guided paths instead interpolate by travelled distance.

## Verification

`showcaseDirector.test.ts` checks rail continuity, all guided stop reachability,
pause/resume, reduced motion and safe handback. `cinematic-fallback.spec.ts` keeps
entry, static chapters and no-eager-GLB behavior in the blocking smoke suite.

After building, run `npm run test:browser-cinematic` on a GPU-capable machine for
desktop/mobile visits, framing, scrubbing and cross-world scene disposal. These
new visual qualifications have a separate Playwright project; they do not extend
the four existing owner-approved advisory CI journeys. Review generated images
in ignored `artifacts/playwright-results/`. Physical mobile qualification remains
necessary before claiming device performance.
