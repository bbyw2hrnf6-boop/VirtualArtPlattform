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

`landing/ThreeWorldStory.tsx` presents the **20-second Three worlds film**:
Art spaces 0–7 s (White Cube, Grand Forum and Obsidian), Sculpture Pavilion
7–13 s, Forest Fold House 13–20 s.
It is a pre-rendered montage in the visual style of the product-briefing intro,
with a warm original instrumental soundtrack and three brief English teaser lines.
It replaces the homepage's WebGL scroll journey. Its art chapter includes views of existing Studio templates and the bespoke
Obsidian gallery; the first Explore action is explicitly labelled Obsidian. It does
not change the standalone showcases or Studio story.

The header and Beyond Studio buttons start the film with sound on an explicit
click. A native HTML video receives its source only after Play. Desktop uses
1080p and narrow viewports use 720p; both share the exact chapter timing.
Pause/resume/replay, mute, a reversible scrubber and paused chapter selection
are available. Three persistent Explore links open the original showcase routes,
including before playback and when media loading fails. Scrolling remains native
and does not scrub or move with the film. Playback pauses when the section leaves
the viewport, the tab becomes hidden or the window loses focus.

Reduced motion keeps static chapter covers and Explore links, with no film
source or autoplay. Changing the preference while playing pauses and unloads
media. The film mounts no Three.js scene and downloads no showcase GLB.
Sources, shot timing, sound synthesis and encoding instructions live in
[`blender/showcases/three-world-film`](../../../blender/showcases/three-world-film/).

## Loading and quality

The homepage film requires no WebGL context. Standalone showcase pages load a
single scene after entry and retain their existing disposal/readiness boundary.
Scene disposal releases geometries, textures and renderer; readiness waits for
shader warm-up draws. Loading retains a poster, failure retains static navigation,
and reduced motion keeps still chapters without automatic motion.

The raster adapts to sustained slow frames and can recover after a cooldown and
sustained fast visitor-driven frames. It never renders idle frames to probe for
recovery. Texture filtering is set before the first upload and stays fixed while
raster/reflection sizes adapt. Forest materials marked `forest_irradiance` combine
their separate baked irradiance and tiled albedo in linear space, keeping live
specular highlights without adding a second diffuse-light contribution. Original
combined bakes and other showcases retain their existing material behavior.
Forest's Day/Night control atomically swaps twenty source-matched irradiance
RGBM lightmaps in lossless WebP loaded only on the first Night request; existing GPU texture allocations
are reused, while loading failure leaves the current view intact. Sky, exposure
and one cached environment per state follow the same switch. Bathroom mirrors
are bounded, viewpoint-correct passes with recursion protection and full disposal.
Their adaptive fallback retains 512 px desktop / 256 px mobile so nearby
reflections remain readable after a slow loading frame.
See the Forest source contract for bake reproduction and delivery approximations.
Forest's M09 water does not cast an opaque shadow. Its joined waterfall receives
area-weighted normals at coincident quantized positions; the flat pond normals,
positions, indices and source assets remain unchanged.
Its opaque StandardMaterial uses zero metalness and the original linear tint
multiplied by .45 once per shared material, preserving the former diffuse share.
Roughness stays at .13; this is a bounded non-transmissive browser approximation,
not physical refraction or a change to the Blender water.
Only the Forest pond uses a water Fresnel curve and mip-filtered planar target
to reduce distant foliage aliasing in its reflection. Other showcase floors
retain their original stone response and render-target filtering.
Forest revision 5 loads desktop dependencies from `desktop-v5/`; the mobile GLB,
house photographs and homepage cover use revision-5 URLs to invalidate cached
assets after the geometry and material export changes.

Standalone flights use the existing full-detail assets, reflections and GPU calibration.
The film derives from retained Blender masters and additional views of the existing
Obsidian scene; it does not replace runtime geometry or materials. The original
cinematic allowance is **8 KB gzip JS and 2 KB gzip CSS**.
Automatic gallery entries and matched world-space portals add **2 KB gzip JS**;
next-world GPU warm-up adds a documented 256 B aggregate allowance (626,512 B).
Forest's true night delivery, skies, foliage and mirrors add 4 KiB to that
aggregate ceiling (630,608 B); the production fixture measures 629,684 B.
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
static chapter entry, Explore links and no-eager-media/GLB behavior in the blocking
smoke suite. Homepage cases in `showcase-cinematics.spec.ts` cover sound controls,
chapter timing, reversible seeking, replay and off-screen pause without WebGL.

After building, run `npm run test:browser-cinematic` on a GPU-capable machine for
desktop/mobile visits, framing and film controls. These
new visual qualifications have a separate Playwright project; they do not extend
the four existing owner-approved advisory CI journeys. Review generated images
in ignored `artifacts/playwright-results/`. Physical mobile qualification remains
necessary before claiming device performance.
