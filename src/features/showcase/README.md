# Bespoke visitor direction

Obsidian, Sculpture Pavilion and Forest Fold House reuse `ObsidianScene` and
the normal Walk/Overview controls. They remain separate from Studio templates.
Blender masters, licensing and asset reproduction stay in the corresponding
[`blender/showcases`](../../../blender/showcases/) contracts.

## Camera and motion

- `showcaseFlights.ts`: authored Y-up camera/subject positions, timing, FOV and
  guided stops. Forest stops come from `forestRooms.ts`. Blender positions map
  `(x,y,z)` to `(x,z,-y)`; check artwork IDs before changing a gaze target.
- `cameraFlight.ts`: time-aware monotone cubic Hermite interpolation with continuous
  velocity and eased endpoints. Separate subject rails and a fixed Y-up horizon
  avoid camera roll and abrupt per-shot easing resets. Portrait widens FOV.
- `showcaseDirector.ts`: one camera owner. Guided visits use the existing
  collision/navigation graphs; film rails use the shipped doorways and stairs. Only two explicit world
  portals cross a surface. Pause freezes the clock. Film exit restores the prior walk camera; gallery flight completion
  lands at a reachable final view;
  tour exit retains a reachable position. Direct camera input cancels direction.
- All three rooms have guided visits, pause/resume, previous/next and exit.
  Reduced motion uses explicit still stops. Tab hiding/window blur pauses motion.

Each standalone showcase exposes the shared `SpaceShareMenu` with a canonical
hash-route link, native share where supported and an on-demand QR code. The
same stage toolbar targets that scene for Full screen, so share and exit-fullscreen
controls remain available while immersed. These showcase URLs are public demos,
not published Studio Spaces; do not route them through gallery IDs or ACLs.

Entering Obsidian or Sculpture Pavilion starts a **26/28-second opening flight**
once their scene is ready. Pause, scrub or Exit flight stays available; direct
camera input cancels the film. Reduced motion enters free Walk without autoplay.
Forest offers an optional **38-second flight**, approaching the real upper entry, visiting the glass bridge/studio,
descending the U stair and crossing both ground-floor doorways before the garden
reveal. It avoids the former cuts through walls and slabs and widens interior FOV.

`landing/ThreeWorldStory.tsx` is the **48-second Three worlds journey**:
Obsidian 12 s → Sculpture 14 s → Forest 22 s. Homepage header and Beyond Studio
buttons both open it. Play and native, reversible scroll sample the same rails.
`worldPortal.ts` places the next scene's matched first frame inside the actual
painting/entrance frame. The aperture expands in perspective as the camera
approaches; the same image covers the cut and expands into the incoming view.
Once the visitor opts in, the next world is loaded and GPU-warmed near the start
of the current chapter. At most two scenes are mounted; the prepared renderer
rests until the portal, then the old scene is disposed. This keeps the normal
48-second clock moving through ready transitions. On a slow connection, the
arrival image continues masking a late scene and the clock waits so no chapter
is skipped. The original 20-second Studio introduction is unchanged.

Portal previews under `public/assets/showcases/cinematic/` are UI-free captures of
the shipped full-detail scenes at their first film frame, at 1440 × 1000 and
390 × 844. Regenerate them if the incoming rail pose, lighting or scene changes.
They add about 197 KB total, not another set of room models.

## Loading and quality

No bespoke GLB loads until the visitor opts in. One current and at most one
prepared scene/context may be mounted during the homepage film; stand-alone
showcase pages retain one. Scene disposal releases geometries, textures and renderer.
Loading retains a poster, failure retains static navigation, and reduced motion
uses still chapters without loading bespoke 3D. Scene readiness waits for shader
warm-up draws. Native scrolling stays available; no scroll lock or wheel capture.

Flights use the existing full-detail assets, reflections and GPU calibration.
This feature does not replace or re-render the Blender masters. The original cinematic allowance is **8 KB gzip JS and 2 KB gzip CSS**.
Automatic gallery entries and matched world-space portals add **2 KB gzip JS**;
next-world GPU warm-up adds a documented 256 B aggregate allowance (626,512 B).
Entry, largest lazy chunk, CSS, Studio assets and quality settings remain fixed.
Retired Coming Soon compositions are removed, saving about 500 B gzip CSS. Entry, largest-chunk, Studio-asset and product-target
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
