# Forest Fold House — architecture showcase

Independent read-only showcase at `/#/showcase/forest-fold-house`. Both the homepage Architecture image and its action open this house. It is not a Studio template or Firebase publication. The source package is preserved in `source/`; its JSON dimensions take precedence over the illustrative AI images.

## Model and circulation

One coherent metric Blender model: west wing 7 × 8 m, east wing 5 × 5.5 m, floors at 0 and 3.4 m, one 4 × 1.6 m enclosed upper bridge. Gross concept area is 173.4 m², not a measured legal living area. The upper entrance, bedroom, compact shower room, architect's studio, lower living/kitchen, WC and water lounge are furnished. Roofs are planted and non-walkable; the shallow pond is separate from the dry courtyard route. There is no basement, third floor or underwater room.

`build.py` creates the source geometry, material shaders, furniture, beech woodland, cameras and collision schedule. The physical shell is segmented around each supplied opening, with separate interior finishes, 6 mm edge radii, bronze reveals and 12 mm glazing. The upper slab and lower ceiling are cut around the U stair. Twenty risers are 170 mm each. The supplied 2.5 m flight span and ten treads conflict with the nominal 278 mm tread depth; this model uses 250 mm goings to preserve the fixed landings and envelope. `refine.py` moves the two exterior cameras clear of foreground foliage, C07 clear of the stair enclosure, C08 clear of the wardrobe and C13 onto the upper stair landing. Five modelled circulation diffusers illuminate the hall, stair and compact bathrooms. The supplied lower LX03 recessed spot is omitted because its position lies in the stair opening with no supporting ceiling; the upper stair diffuser supplies the light instead. Other cameras retain their supplied poses.

The existing Space first-person controller supplies focused WASD, E/↑ and Q/↓ look, touch drag, floor click/tap routes, zoom, pace, acceleration and braking. A separate metric graph handles the two levels, continuous stair envelopes, furniture, door clearances, pond and bridge edges. Eye height is the supplied 1.70 m above the local floor. The controller's optional surface mode leaves existing flat Studio/Space movement unchanged. Overview shows the complete house externally and restores the previous walking position. Room selection is optional; no teleport is required to complete the route.

## Source and delivery

- `forest-fold-house.blend`: editable master; all materials are authored procedural shaders, with no external texture dependency.
- `render.py`: real Cycles images from this model, afternoon / neutral overcast / blue hour. `masters/` contains native 3840 × 2160 renders; proofs and logs belong in ignored `artifacts/forest/`.
- `export.py`: separate baked delivery scene. Four architectural atlases retain 4K, 128-sample diffuse transport; floor and furniture atlases use 2K. Camera-independent diffuse GI and contact shadows are baked before any shader is replaced. `denoise.py` applies linear-space OpenImageDenoise after all bakes, retaining raw maps. Dynamic hardware, vegetation, glass and water retain runtime shading.
- `lightmaps/`, `bake-report.json`: retained transport evidence. The large packed `forest-runtime.blend` is an ignored, reproducible delivery intermediate; the editable source is retained.
- `colliders.json`: generated physical wall/window/furniture bounds; copied to `src/features/showcase/forest-colliders.json` for runtime navigation.
- `public/assets/showcases/forest-fold-house/`: referenced desktop/mobile GLBs and WebP derivatives of actual renders only. Original AI concept images are never represented as completed Blender photographs.

Glazing uses physical transmission in Cycles, with transparent shadow rays for the thin clear architectural panes. Browser panes use alpha transparency instead of a costly thick screen-space transmission pass; this is an explicit delivery approximation. Water has a bounded planar reflection. Honed interior limestone is deliberately not mirror-polished. Vegetation and moving specular highlights use runtime illumination while room diffuse transport is fixed to the afternoon state. `delivery_materials.py` resolves unbaked procedural soil, bark and moss to their authored base colors and roughness; Blender-only noise and bump nodes cannot be exported as glTF shaders. Overcast and blue-hour states are offline render variants, not live lighting controls.

## Reproduce

Run at the repository root with Blender 5.2 LTS. Rendering/baking uses the local Metal device. Keep the master and delivery processes separate.

```sh
Blender -b --python blender/showcases/forest-fold-house/build.py
Blender -b blender/showcases/forest-fold-house/forest-fold-house.blend --python blender/showcases/forest-fold-house/render.py -- --cameras C01,C07,C08,C09,C10,C11,C12,C13 --width 3840 --samples 128 --out blender/showcases/forest-fold-house/masters
Blender -b blender/showcases/forest-fold-house/forest-fold-house.blend --python blender/showcases/forest-fold-house/render.py -- --cameras C01 --width 3840 --samples 128 --lighting overcast --out blender/showcases/forest-fold-house/masters
Blender -b blender/showcases/forest-fold-house/forest-fold-house.blend --python blender/showcases/forest-fold-house/render.py -- --cameras C01 --width 3840 --samples 128 --lighting evening --out blender/showcases/forest-fold-house/masters
Blender -b blender/showcases/forest-fold-house/forest-fold-house.blend --python blender/showcases/forest-fold-house/export.py
GLTF_TRANSFORM=/path/to/gltf-transform sh blender/showcases/forest-fold-house/compress.sh
python3 blender/showcases/forest-fold-house/prepare_images.py
python3 blender/showcases/forest-fold-house/asset_report.py
```

The compression script requires build-only `@gltf-transform/cli@4.5.0`; image/report scripts require Pillow. Use the actual Blender executable path on your machine. `render.py --lighting overcast` and `--lighting evening` generate the other light studies. Keep source references byte-identical; provenance is recorded in [ASSET_LICENSES.md](../../../ASSET_LICENSES.md).

## Performance and verification boundary

The house page and its 3D navigation are separate lazy chunks. Poster and room images remain available without WebGL; Data Saver offers the image directory and explicit 3D entry. No GLB downloads before entry. The existing adaptive showcase raster/reflection controls remain in use. Mobile transport textures are capped at 1K; desktop uses the detailed atlases. Geometry and shadows intentionally cost more than a Studio room.

The new route, page, collision graph and height-aware visitor extension explicitly add **6 KB** to the aggregate JS release allowance (610 → 616 KB gzip). Initial entry, largest-chunk, CSS and Studio asset ceilings stay unchanged. This is feature scope, not removal of a failed performance check. Physical-phone thermal/FPS qualification remains open; browser touch/viewport checks do not substitute for a real-device measurement. Current asset sizes, texture-memory estimates and retained master hashes are recorded in `asset-report.json`. `validate_delivery.py` rejects a staircase outside the source navigation envelope before export.

Local verification uses pinned Node 22.23.2 / npm 10.9.8: `npm run check` passed (421 unit tests, 68 script tests, lint and both build configurations). All 46 distinct Chromium smoke cases passed across the regression run and the final house/homepage rerun. The house was reviewed at 1440 × 1000 and 390 × 844, including real desktop/mobile model loading, floor destinations, vertical look, height restoration, overview and all eight render derivatives. Geometry validation checks the delivered stair envelope against the navigation levels. These checks do not constitute a production deployment or physical-phone performance qualification.
