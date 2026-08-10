# Danny Hirsch demo delivery files

`danny-gallery.glb` is the full authored exhibition. `danny-gallery-mobile.glb` is its low-tier delivery derivative; the app selects it only when runtime quality detection returns `low`.

The `danny-emil-finale-v2` desktop and mobile captures are the scroll story's loading/first-frame posters. They show the corrected material contract: matte plaster walls and marble only on the floor. The poster yields to the live GLB during the build; WebGL stays live through the 360° flight and the in-place walk finale. The older non-v2 captures remain reference renders only.

The mobile derivative keeps all 191 nodes, 179 node metadata records, 84 meshes, 31 materials, 12 animations, 27 colliders, 16 view anchors, seven artwork hotspots, and eight route waypoints. Geometry was simplified to roughly half the triangles. Material textures are at most 512 px, artwork textures are at most 768 px, and embedded WebP images use quality 72. Meshopt compression remains enabled and decoding uses up to two Web Workers.

Recreate it with glTF-Transform 4.4.2 by simplifying the full GLB to ratio `0.45` with error `0.003` and locked borders, resizing all textures to 768 px, resizing `black-marble-gallery`, `saddle-leather`, `dark-limestone`, and `smoked-walnut` to 512 px, recompressing WebP at quality 72 / effort 100, then applying medium-level Meshopt compression. Verify the metadata and node inventory before replacing the runtime file.

SHA-256:

- Full GLB: `2901b6c7de51612ee21e3c85e6d42bc81697c1978df707b1e9110b3b65fc7a1b`
- Mobile GLB: `8421fb83e0e74737d5be24d6d096623126cfc9e7f4faf891aa9722b3e465a4cf`
- Cover: `ed9d32cb2fcef6f3d5b39119ab3955f0222b3b3b37a02b68b2b16db8356b5c1d`
- Emil finale, desktop: `4035d20e55d9c0ddf9b1d7d2d368f3ae245074466bc66ef9a0765c2e06ff171d`
- Emil finale, mobile: `cb1a2c9abf758d11f2a1e5fc985f95d723256ba31f716d0ce257a0972ae699a4`

The project-specific rights restrictions in [`ASSET_LICENSES.md`](../../../ASSET_LICENSES.md) apply to both GLBs and the derived stills.
