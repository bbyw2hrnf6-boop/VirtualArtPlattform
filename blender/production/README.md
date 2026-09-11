# LIEUVA Blender production

The three template environments now use `premium-v3` by default in the shared Studio and visitor renderer. This is a local implementation awaiting the owner's normal release workflow. Nothing here deploys or publishes.

## Four separate deliverables

| Deliverable | Location | Purpose |
| --- | --- | --- |
| Cycles beauty masters | `v3/{white-cube,nocturne,pavilion}-r5-3840.png` | Three completed native 3840 × 2160, 16-bit PNGs, maximum 96 samples, denoised, AgX. Art direction/marketing; staged fictional artworks and furniture. Not browser screenshots. |
| Editable Blender sources | `v3/{id}.blend`, `{id}-runtime.blend`, `{id}-arrival.blend`, `material-library.blend` | Ten packed files: metric architecture, beauty staging, editable materials/lights, separate runtime batches/AO and camera studies. |
| Runtime GLBs | `../../public/assets/templates/premium-v3/*.glb` | Six desktop/mobile assets with optimized architecture and validated placement/collision contracts; excludes beauty staging/lights/cameras. |
| Studio integration | `src/features/gallery/GalleryScene.tsx` and `scene/premiumEnvironment.ts` | Shared real-time rendering in Arrange, Walk Preview, homepage and published viewer; arrival readiness, editable materials and navigation. |

Historical v1/v2 `.blend` sources and the v1 4K masters remain available. Generated
preview rounds, backups and logs were removed; Git history retains them. Round 5
refines daylight direction, framing and bronze highlights. All three native 4K
round-5 masters are retained. Dimensions, bit depth, byte sizes and SHA-256 hashes
are recorded in `v3/render-manifest.json`.
CPU Cycles uses 96 maximum
samples, a 0.006 adaptive threshold, denoising, 10 maximum bounces and AgX.
Metal compatibility probes stalled on this installation; no GPU speedup is claimed.

The `v3/{id}-arrival.blend` files contain editable 24 fps cameras sampled from
`src/features/gallery/scene/roomIntroductions.json`. Nine 960 × 540 Cycles
keyframe proofs accompany them. These short arrival paths use the same geometry
as the runtime; guided routes are computed dynamically around the user's decor.
Run `node blender/production/sample_arrivals.mjs` followed by Blender's
`--python blender/production/author_arrivals.py` to regenerate these studies.

## Reproduce

Run from the repository root, once per room (`white-cube`, `nocturne`, `pavilion`):

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python blender/production/build_premium.py -- --room white-cube --round 5 --width 3840 --samples 96 --device CPU --export --bake-ao
npm run validate:premium
npm run check
```

Use `--no-render --export --bake-ao` for runtime/source production without a new beauty render. Use `--width 1200 --samples 24` for a composition proof. Outputs go into `v3/`; export commands overwrite that room's v3 generated outputs. Node 22.23.2 is the repository's required version.

## Export boundary

Collections are `SHELL`, `ARCHITECTURE`, `OVERHEAD`, `SURFACES`, `COLLISION`, `NAVIGATION`, `ANCHORS`, `BEAUTY_STAGING`, `BEAUTY_LIGHTS`, and `CAMERAS`. The last three are excluded from GLB exports. One metre remains one unit; Blender `(x,-z,y)` becomes browser `(x,y,z)`.

AO is a geometry-only, 0.85 m ambient-occlusion term baked through an explicit Ambient Occlusion shader and emission bake (16 Cycles samples, 32 AO samples). It is not a lighting/beauty bake and contains no artwork or movable furniture. `glTF Material Output/Occlusion` exports the independent `TEXCOORD_1`; the original metric UV channel remains available for editable albedo/detail maps. Desktop maps are at most 1024 px, mobile at most 512 px. Textures are embedded JPEG; no remote decoder, Meshopt or KTX2 requirement is introduced.

Architecture is batched by material/overhead policy. Functional nodes stay separate. The three protected footprints, surface IDs, eye height, room zones and publication identities are unchanged. The current navigation controller consumes authored hidden colliders and the existing canonical placement surfaces; exported navmesh/anchor data is validated for future use and is not presented as a newly integrated navigation controller.

## Browser behavior

- Normal URLs load v3 automatically, including old published drafts using these template IDs. No data migration or revision change occurs.
- `?environment=procedural` before the hash selects the existing procedural environment for local diagnosis/rollback. A loading or validation failure retains that environment.
- Desktop uses desktop GLBs. Compact viewports, coarse pointers and low hardware tiers use mobile GLBs; renderer quality still adapts independently.
- Materials preserve AO while replacing editable albedo/bump/roughness. Timber overhead cannot be changed by the Floor control.
- Default ceiling choices show authored overhead; alternate ceiling choices use the existing editable ceiling system. Arrange hides overhead and fades partitions. Invisible collision/ceiling helpers do not intercept wall placement.
- Room lighting and reflection probes are rebuilt after attachment. The Forum probe sits in a free aisle rather than inside its central divider.
- Artwork remains separate, color managed and editable; the same renderer/camera survives view and material changes. Preview capture waits for the room asset and scene textures. The visible arrival overlay also waits for collection hydration, reflections, shader compilation and two rendered frames before the camera introduction begins.

See `../../audit/premium-glb-measurements.json` for current runtime measurements and limits. Existing project asset provenance applies; see `../../ASSET_LICENSES.md`. The supplied reference screenshots guide art direction, not product functionality or reproduction rights.

The separate `blender/production/v3/material-library.blend` packs all three new material studies, including natural oak, with editable Principled shaders, independent procedural microstructure and metric sample planes. Rebuild with `blender/production/build_material_library.py`; it does not replace any room source or claim a measured PBR scan.

## Editorial camera and material studies · 9 September 2026

`v3/story/` adds an independent 72-second camera source, three 960×540 camera
proofs, a separate packed material library and three surface closeups. The camera
samples the actual desktop homepage score; the source beauty staging differs
from the runtime collection and is explicitly labelled. None of the original
room sources, six runtime GLBs or three 4K masters is overwritten. See the
[study README](v3/story/README.md) for authoring, provenance and verification.
