# LIEUVA template environments and runtime previews

Updated 2026-09-08. White Cube, Warm Gallery (internal `nocturne`) and Grand Forum load `premium-v2` by default in Studio and the shared visitor renderer. `premium-v1` is retained as the archived first review candidate. Sources and reproducible Blender commands: [production README](../../../blender/production/README.md).

The three preview images below were captured by the real Studio capture function from each default sample collection's Walk Preview, via the local publish-review dialog. No publication was submitted. They are actual browser renderings, not Cycles beauty images or generated UI concepts. Display URLs include `?v=premium-v2` to refresh browser caches. The three native 4K Cycles masters remain separate in `blender/production/v1/`.

| Preview | Pixels | Bytes | SHA-256 |
| --- | --- | --- | --- |
| `white-cube-preview.webp` | 661 × 540 | 5,252 | `2bf809d69c366e819ee8a93cb9528cca05245627fa6ec675720583f2d74c4cc6` |
| `nocturne-preview.webp` | 661 × 540 | 8,974 | `d5f585ccd5c104714739578cfd16689b6f6ae77222b437f9663b6ab287b46694` |
| `pavilion-preview.webp` | 661 × 540 | 13,480 | `b6d982982e864f413fdf3af8e2d4900c15747348497d88e160e3e3bfba893a6f` |

## Runtime assets

Six self-contained GLBs ship under `premium-v2/`. Maximum texture dimensions are 1024 px desktop / 512 px mobile. Each retains exact template dimensions, 4/4/14 placement IDs, hidden colliders, navmesh, start/look and artwork/view anchors. Cosmetic meshes are batched separately from functional geometry. Geometry-only AO is in UV channel 1; editable albedo/detail uses metric UV channel 0. The current controller consumes colliders and canonical Studio surfaces, while exported navmesh/anchors remain contract evidence.

Run `npm run validate:premium` for exact current measurements in `audit/premium-glb-measurements.json`. File size is distinct from decoded texture memory. See [licenses](../../../ASSET_LICENSES.md) for project-generated geometry, existing albedo derivatives and fictional demo artwork.
