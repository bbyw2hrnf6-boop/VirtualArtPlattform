# LIEUVA · Arrival, materials and product story

Production round requested 8 September 2026. Local implementation, render production
and acceptance completed 9 September 2026. No release, commit or deployment is implied.

## Observed baseline

The three Studio/visitor templates load six premium-v2 Blender GLBs. Editable
sources and independent 4K Cycles masters exist under blender/production. The
renderer, local drafts, placement validator and publication identities are shared.
The repository was clean at the beginning of this round.

Code findings: GalleryScene creates the cinematic intro before attaching the
environment. The accessible status is visually hidden and marks ready at GLB
settlement, before artwork textures, reflections and GPU warm-up. Grand Forum's
long multi-room intro is capped at 24 seconds. Generated guided tours allocate
equal time to unequal route segments, with a 45-second overall ceiling. These
explain early animation and inconsistent speed. Wall shimmer still requires a
geometry/material/depth investigation; a root cause is not yet claimed.

The homepage ScrollGalleryStory is an independent Danny GLB runtime. Its story
emphasizes construction of one named reference exhibition rather than the
creator's choose → arrange → customize → enter workflow. The owner's current
request explicitly permits replacing this homepage subject. Danny's standalone
demo, artwork metadata and URL remain supported.

## Production plan and acceptance

1. Arrival: show an accessible, restrained architectural loading screen. Track
   actual resource readiness, finish reflections/shaders and render initial frames
   behind it. Begin the introduction after reveal; retain fallback/retry semantics.
2. Camera: short room-specific introduction rather than a whole-building lap.
   Guided tours use physical distances, rotation limits and intentional holds.
   Retain pause, previous/next, skip, collision paths and reduced motion. Author
   matching editable camera paths in Blender and inspect rendered keyframes.
3. Geometry: inspect Forum source, exported meshes and runtime material state for
   overlapping faces or unstable transparency. Fix the demonstrated cause while
   preserving all 14 placement surfaces and navigation contracts.
4. Materials: generate neutral, seamless concrete, stone and oak studies. Inspect
   them, create separate physically motivated detail maps, and validate their real
   scale in Blender and in the largest runtime room. Keep the praised black marble
   and ceiling systems. Record prompts, files and provenance.
5. Blender: version this round separately. Render composition/material proofs,
   inspect and refine, then produce native 4K Cycles masters at higher sampling.
   Packed editable sources, camera sources, marketing renders, optimized GLBs and
   Studio integration remain distinct deliverables.
6. Homepage: one reversible product transformation with readable DOM copy, a
   compelling completed space, clear steps and a direct sandbox handoff. Keep
   normal document scroll, keyboard access, mobile layout and reduced-motion
   fallback. Use product geometry and documented artwork, not invented features.
7. Verification: targeted readiness/camera/geometry regression tests; full npm run
   check including the production-feature budget; all six GLB contracts; desktop
   1440×1000 and mobile 390×844 visual checks, all three rooms, Arrange/Walk,
   material edits, selection/history/recovery and publish review. No automatic
   commit, deployment or live-data mutation. Physical-phone performance is a
   separate measurement and will not be inferred from viewport emulation.

## Research

Official GPT-6 Astra documentation describes coding, computer use and tool-driven
image generation. It does not guarantee a Blender scene or a particular scroll
animation's quality: those require actual geometry, asset, rendering and browser
checks. Image generation is useful for material/art-direction inputs, followed by
Blender authoring and runtime validation.

- https://developers.openai.com/api/docs/models/gpt-6-astra
- https://developers.openai.com/api/docs/guides/image-generation
- https://developers.openai.com/showcase/websites

Implementation measurements and acceptance evidence follow below.

## Implemented local result · 9 September

### Room geometry and materials

The Grand Forum upper piers previously started at height 5.0 m while the lower
piers continued to 5.52 m. Their stone faces overlapped by 0.52 m. Upper piers now
meet that top plane; adjacent cross-wall ends and near-pier partitions are trimmed
to meet the pier faces. A GLB geometry check now compares exported overhead
vertices to the real pier collider bounds. All fourteen protected placement
surfaces and the 40 × 60 m layout remain intact. This resolves the demonstrated
coplanar geometry defect; it is not a claim that every possible GPU/driver shadow
artifact has been eliminated.

New honed concrete, honed limestone and natural oak color inputs have restrained
variation. Metric floor UVs previously multiplied an already metric repeat by the
whole room size; imported floors now use authored repeat / requested tile size.
White Cube concrete uses a 3 m repeat, new limestone 3 m and natural oak 2.4 m.
Stone tables share the new limestone finish. Black marble, the ceiling geometry
and their source maps are preserved. Albedo, procedural microstructure and AO
remain separate. Raw imagegen inputs are 1254 px; shipping WebPs are 1024 px.
The editable material library packs all three studies; exact hashes and generation
briefs are in the material README and asset license notice.

### Arrival and camera behavior

An accessible architectural progress overlay follows real asset progress and
collection readiness. Scene-owned image requests (including hidden story artwork),
reflections, shader compilation and initial rendered frames complete behind it.
Only then does the 240 ms reveal finish and the introduction advance. Reduced
motion skips the animated reveal/intro. A 90 s overall deadline covers architecture,
hydration and GPU preparation; image waits have a 45 s bound and can be invalidated
when the draft changes. Retry reconstructs scene resources, gives GLB requests a
fresh retry key and restarts stalled artwork downloads without evicting completed
cache entries. A late failure from an older request cannot evict a successful retry.
No unfinished Space is automatically revealed at the timeout.

White Cube and Warm Gallery introductions each take 6.5 s of animation; Grand
Forum takes 11.072 s. Camera paths remain in free entrance lanes, accelerate and
settle gently, and end at the protected 1.75 m eye height. Editable 24 fps Blender
camera studies use the same sampled path, vertical FOV and small lens breathing.
They include fictional beauty staging where the beauty source contains it; runtime
artwork and furniture still come from the user's draft.

Guided routes use collision-aware paths, travel distance and angular change rather
than equal time per segment or a global 45 s ceiling. Smoothstep movement limits
peak translation to 1.45 m/s and rotation to approximately 25.7 degrees/s, with
1.8 s artwork holds. Tour start uses the current view. Previous/Next deliberately
select a stop with a short fade, avoiding an accelerated flight through intervening
walls. Pause, Resume, Skip and offscreen suspension remain available. Dynamic
user-generated tour paths are not presented as fixed Blender animations.

### Homepage product demonstration

The four-chapter scroll story now uses the actual White Cube Studio renderer:
empty room → collection → atmosphere → visitor experience. It uses LIEUVA's
fictional sample studies, never Danny's licensed artwork. Danny's standalone
exhibition and URL are retained. Live floor choices visibly alter the room.
"Open this Space in Studio" saves a new local draft containing the selected floor,
three works and three distinct objects; a one-use in-memory handoff avoids a
misleading recovery prompt. Ordinary later recovery remains intact.

Native page scrolling remains available over the canvas. Look around is explicit,
not automatically enabled on scrolling; mouse-wheel page scroll is preserved.
Mobile has a wider camera composition, readable DOM copy and 44 px or larger
controls. Reduced motion presents a completed static room and a text sequence.
Visibility endpoints invalidate both shadow and reflection caches when reversing
the reveal, avoiding stale object silhouettes. Offscreen/hidden rendering pauses.
DPR sampling excludes loading and suspension time so those gaps cannot trigger a
false performance downgrade.

### Asset measurements

| Room | Desktop GLB bytes | Mobile GLB bytes | Desktop visible triangles | Mobile visible triangles | Batches |
| --- | ---: | ---: | ---: | ---: | ---: |
| White Cube | 1,072,524 | 739,812 | 8,732 | 8,732 | 12 |
| Warm Gallery | 2,332,364 | 1,763,840 | 25,600 | 25,102 | 14 |
| Grand Forum | 2,904,748 | 2,414,272 | 18,140 | 18,140 | 13 |

All six pass the unchanged 8/4 MiB, 180k/80k visible-triangle and 60/40-batch
ceilings. Embedded maps stay within 1024/512 px. Decoded texture estimates are
50.3/12.6 MB, 67.1/16.8 MB and 55.9/14.0 MB respectively; these are asset-only
estimates, not a measured total browser GPU footprint. The same room quality
continues to serve Studio and the shared published viewer.

### Verification log

- Full `npm run check` uses the pinned Node 22.23.2 / npm 10.9.8 pair. It includes
  lint, unit tests, script contracts, six GLBs, default and production-feature builds.
- Read-only second review covered resource races, retry, input behavior, scene
  handoff, camera pacing and endpoint cache invalidation. Reported defects were
  corrected; the final targeted review returned no actionable findings.
- Browser: real Studio handoff with oak and 3 works/3 distinct objects; numeric
  artwork placement changed 1.75 → 1.90 m, Undo returned 1.75 m. Reload showed the
  normal 3-artwork recovery prompt and restored oak plus all works. Walk Preview
  and local publish review reported valid geometry, zero warnings and an actual
  captured image. No account sign-in or publication was submitted.
- Browser: Grand Forum and Warm Gallery show loading/waiting before content is
  available, then finish at their authored arrival poses. Guided playback, Pause,
  Resume, Previous and Next were exercised. Desktop viewport 1440 × 1000 and mobile
  390 × 844 were verified from DOM dimensions. Mobile has no horizontal overflow
  and its canvas retains native vertical pan/pinch behavior.
- One full test attempt during CPU rendering had worker startup timeouts (no test
  assertion failures). The full suite passed after temporarily pausing the owned
  render jobs; both jobs resumed afterward. Physical-phone FPS and network timing
  have not been inferred from this Mac's loaded/emulated browser session.

The final pinned release check passed after the last mobile layout and preview
cache-version changes: 60 test files / 344 unit tests, 46 script tests, all six GLB
contracts, lint, default build and production-feature fixture build. The latter
measures 570,473 bytes total JS gzip (ceiling 575,000), 52,834 CSS (54,000),
183,349 largest lazy JS (195,000), 301,300 entry JS (305,000), and 32,098 entry
CSS (32,500). Aspirational JS/CSS/entry targets remain open; no enforced ceiling
was raised. A fresh visit to the final preview build reached capture-ready and
reported no browser console errors.

All nine final Blender camera proofs were visually inspected after correcting the
camera to match Three.js's vertical FOV. Actual 1440 × 1000 browser captures now
supply all three template preview images; homepage, Explore menu and Creator
directory use the v3 cache key. The final mobile material controls sit below the
artworks, with the explicit Look around button above them.

Additional failure-path acceptance: the local fixture deliberately held collection
readiness beyond 90 s. The overlay exposed Try again and kept the introduction at
waiting. Retry restarted the real scene and succeeded with Grand Forum ready in
6,282 ms in that particular cached local run, followed by the complete intro. A
prepared frame is submitted behind the overlay before awaiting parallel shader
completion; omitting that submission had stalled the tested retry at Lighting.
This is a local functional result, not a network or mobile loading-time guarantee.

The overlap regression was also run against archived premium-v2 Forum geometry
with only its version tag adapted for the current validator. It failed with
"Overhead geometry overlaps a Forum pier"; both current v3 tiers pass.

### Completed Blender production

All three round-5 masters are native 3840 × 2160, 16-bit PNGs. Each was rendered
locally in Blender 5.2.0 LTS with CPU Cycles, maximum 96 samples, adaptive threshold
0.006, denoising, 10 maximum bounces and AgX. The final Forum render completed at
08:54 local time on 9 September. No upscaling or imagegen substitution was used
for these room renders. The 1254-pixel imagegen studies are material inputs only.

| Master | Bytes | SHA-256 |
| --- | ---: | --- |
| white-cube-r5-3840.png | 45,287,331 | `cf9b75e658e20b87a35fd70e6fe40bd20f4ada3269fb5d680925e95994102190` |
| nocturne-r5-3840.png | 44,827,839 | `1afa9a63153a4bb54488859649ee160b8f5204e56172a1a945f8d79c194101aa` |
| pavilion-r5-3840.png | 45,389,828 | `6e7f0a1bd28b20f5375788df8f068e1830fc728c4d7cf1dbdde0c8037b788bf4` |

Two complete proof rounds, nine final camera keyframes and all three masters were
visually inspected. PNG headers/end markers and hashes were checked for all 18
images. All ten editable Blender sources opened successfully; file textures are
packed. Runtime sources have zero lamps/cameras. Arrival sources retain separate
editable 24 fps paths and vertical FOV. See `blender/production/v3/render-manifest.json`
and `source-inspection.json` for the recorded results.

The final handoff keeps marketing masters, editable sources, browser GLBs and
Studio integration separate. The visual review explicitly switches between Cycles
previews and real Studio captures. Beauty images are not installed as a substitute
for interactive rooms, and native 4K masters are not automatically downloaded by
the homepage. Browser quality remains dependent on device capability and dynamic
lighting; real handset FPS and live deployment were not part of this local acceptance.
