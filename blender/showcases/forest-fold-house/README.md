# Forest Fold House — architecture showcase

Independent read-only showcase at `/#/showcase/forest-fold-house`. Both the homepage Architecture image and its action open this house. It is not a Studio template or Firebase publication. The source package is preserved in `source/`; its JSON dimensions take precedence over the illustrative AI images.

## Current delivery: revision 6

The reported lounge-wall posterization was reproduced in Day mode. The v5 JPEG
irradiance was amplified by the room's ×64 HDR scale. `day_reprocess.py` denoises
the retained raw day bakes into PNG16, and `day_package.py` encodes RGBM before
`refine_delivery.mjs` packages WebP at quality 100 with lossless alpha. This
removes the large JPEG colour steps without modifying wall geometry. The raw
day bake itself is PNG8; postprocessing does not recover unrecorded precision
or constitute a new Cycles lighting simulation. Night maps remain unchanged.

The concept hero informed denser grouped ferns at the courtyard, pond banks,
rocky ravine, side façades and roof beds: 1,161 additional instances in 23 local
4 m batches, sharing an existing licensed fern mesh and its images. Complete
rotated plant bounds exclude the house, pond, both terraces, waterfall and
circulation. `garden-dressing.json` retains every placement; the deterministic
recipe is in `refine_delivery.mjs`. This is a supplemental delivery dressing,
not a change to the retained architectural `.blend` or the ten v5 Cycles masters.
Those photographs therefore do not yet show the new planting. Offline re-render
and baked shadow integration of the supplement remain a separate authoring step;
new ferns use the existing live sun/shadow and leaf-shading path.

`verify_refinement.mjs` compares all original mesh/index/UV/normal arrays and
decoded non-lighting surface pixels with v5, checks RGBM alpha, and validates
every new planting bound before `promote_refinement.py` copies assets locally.
No original triangles or texture dimensions were reduced. Alpha foliage uses
lossless WebP with exact transparent RGB preservation. `delivery-refinement-report.json`
binds all delivered files to the comparison, and records the Night provenance
rebind: its original UVs and geometry remain byte-identical. Superseded v5 runtime
files move to ignored artifacts (and remain recoverable in Git), not a second
copy in `public/`. The report generator checks the complete dependency set and
the added triangle count, rather than claiming texture payloads match old JPEGs.

Forest rendering no longer forces desktop 1.5× supersampling on a 1× display;
desktop DPR is capped at 1.5. The mip-filtered, blurred pond reflection uses
1024 px desktop / 512 px mobile instead of 2048 / 1024. Other showcases, bathroom
mirrors and source material detail are unchanged. Short local 1440 × 1000 room
rotation samples measured approximately 18–21 FPS before and 29–30 FPS with the
final delivery/raster change. This is not a sustained benchmark or a physical
phone claim. Final desktop/mobile Day/Night views were reviewed separately.

Tradeoff: the corrected initial delivery is **165.82 MiB desktop / 86.96 MiB
mobile**, up from 144.04 / 81.39 MiB. Encoded file size and GPU memory are different:
decoded texture allocation remains approximately 1,952 / 448 MiB; only the
reflection/raster work is reduced. No claim of a smaller download or completed
photorealistic concept match is made. KTX2/LOD optimization still needs dedicated
visual/device qualification; the current package stays inside the existing release
ceiling without increasing any budget.

Build-only processing uses glTF-Transform 4.5.0 (`GLTF_TRANSFORM` executable),
Pillow/NumPy (`FOREST_PYTHON` executable) and Blender 5.2. After the retained v5
spatial export, run `day_reprocess.py` in Blender, `day_package.py` in Python,
then `refine_delivery.mjs` and `verify_refinement.mjs` with Node (`--expose-gc`
for the verifier). The migration helper `promote_refinement.py` requires an
unmodified v5 baseline and refuses to overwrite an existing recovery copy.
Subsequent regeneration should be verified in staging before replacing v6.

References used for the delivery approach:
[Three.js instancing](https://threejs.org/docs/pages/InstancedMesh.html) and
[glTF-Transform compression guidance](https://gltf-transform.dev/cli).
The following revision-5 bake/master details remain the source baseline.

## Model and circulation

One coherent metric Blender model: west wing 7 × 8 m, east wing 5 × 5.5 m, floors at 0 and 3.4 m, one 4 × 1.6 m enclosed upper bridge. Gross concept area is 173.4 m², not a measured legal living area. The upper entrance, bedroom, compact shower room, architect's studio, lower living/kitchen, WC and water lounge are furnished. Roofs are planted and non-walkable; the shallow pond is separate from the dry courtyard route. There is no basement, third floor or underwater room.

`build.py` creates the source geometry, material shaders, furniture, beech woodland, cameras and collision schedule. `shell_geometry.py` creates continuous manifold wall solids around the supplied openings. Only exposed corners receive bevels; coplanar construction subdivisions no longer form visible plaster joints. The shell closes the complete 3.4 m story height, including the band beside each slab. North/south walls own the outer corners; east/west walls and the separate interior linings meet them edge-to-edge. Bronze reveals and 12 mm glazing retain the supplied aperture dimensions. The 350 mm upper-floor/roof assembly reserves 25 mm for oak and 10 mm separation below 315 mm concrete, retaining the specified finished ceilings at +3.05/+6.45 m. The upper slab and lower ceiling are cut around the U stair. Twenty risers are 170 mm each. The supplied 2.5 m flight span and ten treads conflict with the nominal 278 mm tread depth; this model uses 250 mm goings to preserve the fixed landings and envelope. Joinery, shelf contents and bedside furniture are fitted to the finished wall faces; the bedroom entrance and studio slit window remain clear. `refine.py` moves the two exterior cameras clear of foreground foliage, C07 clear of the stair enclosure, C08 clear of the wardrobe and C13 onto the upper stair landing. Five modelled circulation diffusers illuminate the hall, stair and compact bathrooms. The supplied lower LX03 recessed spot is omitted because its position lies in the stair opening with no supporting ceiling; the upper stair diffuser supplies the light instead. Other supplied cameras retain their poses. `finish_details.py` adds the reference-inspired bronze island pendants, a supported kitchen task-light shelf, concealed warm grazing light over the lounge stone, and small tabletop folios. `clearance.py` rejects complete transformed plant/rock bounds against both wings, the bridge and dry circulation; checking only plant origins is insufficient. `validate_source.py` blocks rendering/export regressions in manifold walls, closed story bands, opening clearance, fitted joinery, ceiling heights, slab separation, overlapping wall corners and planting clearance.

`courtyard.py` aligns the terrain mesh with the actual excavation edges, replacing half-metre notches at foundations and paving. Individual honed gneiss slabs sit above a continuous recessed bed at the unchanged dry-route elevation. Low planting, partly buried stones and a planted ravine connect the path to the pond and woodland; additional shared canopy/groundcover meshes screen the distant ridge. They reuse the retained CC0 sources. C90 is a diagnostic camera at the reported lower crossing, not a new visitor route.

The existing Space first-person controller supplies focused WASD, E/↑ and Q/↓ look, touch drag, floor click/tap routes, zoom, pace, acceleration and braking. A separate metric graph handles the two levels, continuous stair envelopes, furniture, door clearances, pond and bridge edges. Eye height is the supplied 1.70 m above the local floor. The controller's optional surface mode leaves existing flat Studio/Space movement unchanged. Overview shows the complete house externally and restores the previous walking position. Room selection is optional; no teleport is required to complete the route.

## Source and delivery

- `forest-fold-house.blend`: editable master; metric architecture and furniture, with authored shaders and retained CC0 scanned material/plant sources under `materials/`. `quality.py` uses metre-scaled `SurfaceUV` mapping and a world anchor for procedural finishes so export joining cannot change their scale. `planting.py` adds scanned ferns, flowering groundcover and bounded understory tree derivatives; a final whole-plant clearance pass removes intersections with walls and walk routes. Scanned stone on the architecture is desaturated toward the concept’s silver gneiss; loose landscape rocks retain the original scanned PBR colour.
- `render.py`: real Cycles images from this model, afternoon / neutral overcast / blue hour. `masters/` contains native 3840 × 2160 renders; proofs and logs belong in ignored `artifacts/forest/`.
- `export.py`: separate baked delivery scene. Twenty irradiance groups cover rooms, ceilings, floors and furniture in the two wings on two levels, plus the exterior, upper bridge, stair and courtyard paving. Wall/exterior light atlases retain 4K and other groups 2K, at 256 non-adaptive samples. Colour is excluded from irradiance: `surface_delivery.py` retains metre-scaled scan albedo/normal/roughness on `SurfaceUV` (UV0), while lighting uses `Lightmap` (UV1). Unscanned finishes preserve a 1K procedural albedo chart plus up to 2K tangent normals and 1K roughness on UV1. Multiple surface materials may share one lighting atlas. Linear HDR irradiance is normalized by a recorded power-of-two scale, stored as PNG and restored through glTF emissive strength. Authored stone/oak colour adjustments are applied in linear light. The visitor multiplies decoded albedo and irradiance, then keeps runtime specular without adding diffuse light twice. Dynamic hardware, vegetation, glass and water retain runtime shading. `denoise.py` applies linear-space OpenImageDenoise, retains raw maps and reloads its encoded PNG output as sRGB. The ignored cache at `artifacts/forest/cache-irradiance-v5.json` requires the exact master SHA-256 and all expected maps for a group; per-group completion makes interrupted denoising resumable.
- `lightmaps/`, `bake-report.json`: retained transport evidence. The large packed `forest-runtime.blend` is an ignored, reproducible delivery intermediate; the editable source is retained.
- `night_export.py`, `night-bake-report.json`: separate 256-sample night irradiance from the unchanged source and its actual fixtures. Exact retained day UV charts are transferred only after topology and transform equality checks. The sun is off; the source blue-hour world and 2.5× practical-light profile match `render.py --lighting evening`. Night denoising retains 16-bit PNG without dithering. `night_package.py` creates versioned desktop 4K/2K and mobile 1K RGBM maps in lossless WebP, plus the manifest. The per-texel alpha multiplier preserves dim-light precision beside bright fixtures; RGB uses sRGB and alpha remains linear. Mobile irradiance is resized before encoding. Source, lighting-profile, UV, geometry-delivery and image hashes prevent stale combinations. Decoded-pixel validation rejects lossy delivery even when file hashes match.
- `colliders.json`: generated physical wall/window/furniture bounds; copied to `src/features/showcase/forest-colliders.json` for runtime navigation.
- `public/assets/showcases/forest-fold-house/`: referenced desktop glTF package, mobile GLB and WebP derivatives of actual renders only. Original AI concept images are never represented as completed Blender photographs.

Glazing uses physical transmission in Cycles, with transparent shadow rays for the thin clear architectural panes. Browser panes use alpha transparency instead of a costly thick screen-space transmission pass; this remains an explicit delivery approximation. Water has a bounded planar reflection. Honed interior limestone is deliberately not mirror-polished. The two bathroom mirrors add viewpoint-correct planar surfaces inside the retained frames, enabled only near the relevant bathroom in Walk; reflection peers never recursively capture each other. Full targets are 1024 px / 2× MSAA desktop and 512 px mobile, with mip filtering. Adaptive fallback retains 512 px desktop / 256 px mobile without MSAA, so nearby reflections remain readable after a slow frame.

Day/Night swaps independently baked room and exterior irradiance, with matching sky, exposure and cached reflection environments. Night maps download only on the first explicit Night request; all twenty must decode successfully before anything changes. Failure leaves Day intact and offers retry. The same GPU texture allocations are reused, with inactive images retained in CPU memory for immediate return; the renderer and model are not rebuilt. Actual diffuser emission is not dimmed. Browser exposure matches source AgX at +0.5 EV day / +1.3 EV night. Vegetation uses runtime light and a restrained, shadow-aware thin-leaf approximation on the three licensed foliage materials, not emissive fill. The metallic/specular base colour remains intact when suppressing duplicate diffuse lighting.

`delivery_materials.py` preserves photographed soil, bark and moss PBR maps, and converts imported vegetation shaders to explicit PBR with alpha-tested leaves. Blender-only height bump remains in the source while tangent normals survive delivery. The source afternoon uses a 0.8° sun with eight diffuse/glossy bounces; native 4K masters use 512 adaptive samples for the afternoon hero and 256 for the remaining nine views with a 0.004 noise threshold. Cycles uses 512 px tiles to bound live path-state memory. The real-time sun matches the Blender direction; its ±24 m shadow camera projection is explicitly updated, then its static 4K desktop / 2K mobile map is captured once. A 256 px desktop / 128 px mobile probe is captured once per lighting state, excluding previous environment light and planar peers. Overcast remains an offline render variant. No additional external assets or licences are required for these runtime lighting changes.

The delivery export preserves shared plant geometry. Compression preserves instancing, then `spatial_instances.mjs` partitions placements into 12 m culling cells. One-off woodland meshes are also grouped spatially before export, so looking into one room no longer submits the entire forest. No mesh decimation, texture reduction or placement changes occur during this packaging step. Revision 5 desktop delivery uses `desktop-v5/forest-fold-house-desktop.gltf` with relative binary/image dependencies; mobile remains one GLB. `asset-report.json` records the measured delivery revision and source hash after both exports and the retained masters pass validation. Splitting the desktop package avoids GitHub’s 100 MiB per-file limit without re-encoding textures or reducing geometry. Raw exports and the instancing intermediate live in ignored `artifacts/forest/`. Decoded RGBA/mipmap estimates exclude geometry and render targets.

## Reproduce

Run at the repository root with Blender 5.2 LTS. Rendering/baking uses the local Metal device. Keep the master and delivery processes separate.

```sh
Blender -b --python blender/showcases/forest-fold-house/build.py
python3 -m unittest discover -s blender/showcases/forest-fold-house -p test_master_contract.py
Blender -b --factory-startup --python blender/showcases/forest-fold-house/test_surface_delivery.py
Blender -b blender/showcases/forest-fold-house/forest-fold-house.blend --python blender/showcases/forest-fold-house/render.py -- --cameras C01 --width 3840 --samples 512 --out blender/showcases/forest-fold-house/masters
Blender -b blender/showcases/forest-fold-house/forest-fold-house.blend --python blender/showcases/forest-fold-house/render.py -- --cameras C07,C08,C09,C10,C11,C12,C13 --width 3840 --samples 256 --out blender/showcases/forest-fold-house/masters
Blender -b blender/showcases/forest-fold-house/forest-fold-house.blend --python blender/showcases/forest-fold-house/render.py -- --cameras C01 --width 3840 --samples 256 --lighting overcast --out blender/showcases/forest-fold-house/masters
Blender -b blender/showcases/forest-fold-house/forest-fold-house.blend --python blender/showcases/forest-fold-house/render.py -- --cameras C01 --width 3840 --samples 256 --lighting evening --out blender/showcases/forest-fold-house/masters
Blender -b blender/showcases/forest-fold-house/forest-fold-house.blend --python blender/showcases/forest-fold-house/export.py
GLTF_TRANSFORM=/path/to/gltf-transform sh blender/showcases/forest-fold-house/compress.sh
python3 blender/showcases/forest-fold-house/prepare_images.py
Blender -b blender/showcases/forest-fold-house/forest-fold-house.blend --python-exit-code 1 --python blender/showcases/forest-fold-house/night_export.py
Blender -b --factory-startup --python-exit-code 1 --python blender/showcases/forest-fold-house/night_reprocess.py
python3 blender/showcases/forest-fold-house/night_package.py
python3 -m unittest discover -s blender/showcases/forest-fold-house -p test_night_contract.py
python3 blender/showcases/forest-fold-house/asset_report.py
```

The compression script requires build-only `@gltf-transform/cli@4.5.0`; image/report scripts require Pillow, and night packaging additionally requires NumPy. `night_reprocess.py` can regenerate the encoding cache from validated retained 16-bit PNGs without rebaking. Use the actual Blender executable path on your machine. `render.py` defaults to a 1920 px, 96-sample proof; the explicit commands above produce the 4K release masters at 512 samples for the afternoon hero and 256 for interiors and alternative lighting. These render settings are independent of the 256-sample irradiance bake. `render.py --lighting overcast` and `--lighting evening` generate the other light studies. Keep source references byte-identical; provenance is recorded in [ASSET_LICENSES.md](../../../ASSET_LICENSES.md).

## Performance and verification boundary

The house page and its 3D navigation are separate lazy chunks. Poster and room images remain available without WebGL; Data Saver offers the image directory and explicit 3D entry. No model or model-dependency downloads before entry. The existing adaptive showcase raster/reflection controls remain in use. Mobile textures remain capped at 1K; desktop retains detailed lighting atlases and separately tiled scans. Geometry and shading intentionally cost more than a Studio room. The static desktop 4K / mobile 2K shadow pass is not repeated while walking. Revision 5 adds courtyard geometry, vegetation instances and per-surface materials; its payload, draw calls and texture memory are measured from the completed delivery. Spatial batching reduces submitted off-camera geometry rather than lowering texture quality. The versioned desktop directory and model URL revision invalidate old immutable asset caches. Night delivery is separately versioned and measured in `asset-report.json`, without duplicating geometry or initial downloads.

Revision 5 measures 144.0 MiB desktop / 81.4 MiB mobile and estimates 1,952 / 448 MiB decoded RGBA+mip texture storage. All ten retained 3840 × 2160 masters and twenty irradiance groups match the current source hash. Local Chromium captures at 1440 × 1000 and 390 × 844 completed without page/asset errors at full adaptive quality. Short visitor-driven samples across eight rooms measured 40.5–54.7 FPS desktop and 54.8–61.0 FPS in the mobile viewport on the authoring Mac; these are not sustained physical-phone measurements or proof that revision 5 is faster than revision 4. The final production build passed 40 browser smoke checks (11 environment-dependent checks skipped) and all 16 cinematic checks. Detailed payload and provenance evidence is retained in `asset-report.json`; disposable browser captures remain in ignored `artifacts/forest/`.

The new route, page, collision graph and height-aware visitor extension explicitly add **6 KB** to the aggregate JS release allowance (610 → 616 KB gzip). Initial entry, largest-chunk, CSS and Studio asset ceilings stay unchanged. This is feature scope, not removal of a failed performance check. Physical-phone thermal/FPS qualification remains open; browser touch/viewport checks do not substitute for a real-device measurement. Current asset sizes, texture-memory estimates and retained master hashes are recorded in `asset-report.json`. `validate_delivery.py` rejects a staircase outside the source navigation envelope before export.

True night-map loading, cached sky/reflection states, thin-leaf response and bathroom mirrors add a separate **4 KiB** feature allowance to aggregate JavaScript (626,512 → 630,608 B gzip). The production fixture measures 629,684 B after this addition; initial entry, largest lazy chunk, CSS and all Studio asset ceilings remain unchanged. High-precision night images add 63.98 MiB desktop / 14.71 MiB mobile only on request, plus a small manifest. Lossless RGBM intentionally costs more transfer than JPEG, which introduced amplified chroma blocks beside bright fixtures. Their 746.7 / 106.7 MiB decoded RGBA+mip allocation replaces the corresponding day textures rather than adding a second GPU set; inactive decoded images remain in CPU memory. This does not lower geometry, texture or rendering quality. `forestNight.test.ts` covers atomic swaps, repeated toggles, failures, cancellation, disposal and source compatibility; the browser journey verifies lazy loading, retry, Day restoration and desktop/mobile bathroom and courtyard views.

Verification uses pinned Node 22.23.2 / npm 10.9.8, `npm run check`, the Chromium smoke suite, and visual review at 1440 × 1000 and 390 × 844. The render-free `test_surface_delivery.py` checks HDR PNG/JPEG energy, linear finish correction, glTF UV channels and material metadata with an 8 px fixture. `asset_report.py` requires all 20 irradiance groups from the current master, matching normalization factors and atlas resolutions, UV1 lighting, UV0 scan detail, procedural UV1 surfaces, foliage masks, original asset hashes, the mobile cap and the per-file GitHub limit. Material counts are measured rather than equated with atlas counts. When raw exports are present it additionally compares expanded triangle counts and every texture payload hash before/after packaging, and records whether that comparison ran. `master_contract.py` requires exactly ten native 3840 × 2160 masters: C01 afternoon/overcast/evening and C07–C13 afternoon. Their sidecars must match camera, lighting, dimensions, current source hash, and 512 samples for C01 afternoon or 256 for the other nine. Missing, extra, proof-sized or stale masters block the report; `test_master_contract.py` covers those failures without rendering. The walking smoke test keeps keyboard input pressed until the camera responds, rather than depending on a fixed frame-rate-sensitive hold duration. These checks do not constitute a production deployment or physical-phone performance qualification.
