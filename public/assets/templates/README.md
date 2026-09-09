# LIEUVA template environments and runtime previews

Updated 2026-09-09. White Cube, Warm Gallery (internal `nocturne`) and Grand Forum load `premium-v3` by default in Studio and the shared visitor renderer. `premium-v1` and `premium-v2` are archived review/previous runtime assets. Sources and reproducible Blender commands: [production README](../../../blender/production/README.md).

The three preview images below were captured by the real Studio capture function from each default sample collection in the shared visitor renderer, using Reset view at eye height in a local QA fixture. PNG captures were encoded as WebP at quality 88. No publication was submitted. They are actual browser renderings, not Cycles beauty images or generated UI concepts. Display URLs include `?v=premium-v3` to refresh browser caches. Native 4K Cycles masters remain separate in `blender/production/v3/`; earlier masters are archived in `v1/`.

| Preview | Pixels | Bytes | SHA-256 |
| --- | --- | --- | --- |
| `white-cube-preview.webp` | 1440 × 1000 | 69,480 | `fde92c44af77a9b483798683c9347b96b097fb42b40dd35904aa02fda43d9666` |
| `nocturne-preview.webp` | 1440 × 1000 | 68,824 | `1717138a2dabb7ec8da199b68bf733dc9bae99a71346d856f38311fceebc96f1` |
| `pavilion-preview.webp` | 1440 × 1000 | 78,314 | `fce1e3dcf85426b83913ad79be90a1de425bf8e812c11d8337d0b314e7be9075` |

## Runtime assets

Six self-contained GLBs ship under `premium-v3/`. Maximum texture dimensions are 1024 px desktop / 512 px mobile. Each retains exact template dimensions, 4/4/14 placement IDs, hidden colliders, navmesh, start/look and artwork/view anchors. Cosmetic meshes are batched separately from functional geometry. Geometry-only AO is in UV channel 1; editable albedo/detail uses metric UV channel 0. The current controller consumes colliders and canonical Studio surfaces, while exported navmesh/anchors remain contract evidence.

Run `npm run validate:premium` for exact current measurements in `audit/premium-glb-measurements.json`. File size is distinct from decoded texture memory. See [licenses](../../../ASSET_LICENSES.md) for project-generated geometry, existing albedo derivatives and fictional demo artwork.

## Editorial opening posters · 9 September 2026

`story/` contains two responsive captures of the actual White Cube opening camera. They are quiet homepage preparation images, not replacement templates or beauty masters. See `story/manifest.json` and `story/README.md`. No runtime GLB changed in this pass.
