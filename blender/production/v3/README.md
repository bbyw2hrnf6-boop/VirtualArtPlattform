# LIEUVA premium-v3 production files

Versioned local production, 8–9 September 2026. No automatic publication.

- `{id}.blend`: packed, editable architecture, staging, Cycles lights and Beauty 01 camera.
- `{id}-runtime.blend`: optimized static architecture, packed maps, independent metric/albedo and AO UVs, functional helpers.
- `{id}-arrival.blend`: separate editable 24 fps camera study from the browser's canonical introduction curves.
- `*-r5-3840.png`: three completed native 3840 × 2160, 16-bit Cycles marketing masters, maximum 96 samples. Proofs are not 4K masters.
- `*-camera-{arrival,architecture,enter}.png`: nine 960 × 540 camera inspection stills, 16 samples.
- `material-studies/`: original 1254-pixel generated PNG inputs; provenance and hashes in `public/assets/materials/README.md`.
- `runtime-maps/`: geometry-only AO and albedo export derivatives.
- `render-manifest.json`: verified dimensions, bit depth, byte sizes and SHA-256 for the 12 retained camera stills and 4K masters.
- `source-inspection.json`: read-only Blender inspection of all ten packed sources; runtime sources contain no lights or cameras, arrival cameras use vertical FOV.

Geometry, light setup, images and functions remain distinct. Runtime export strips beauty artworks, furniture, cameras and lamps, preserving the protected Studio dimensions, surfaces, collision and navigation helpers. The published browser uses its own dynamic lighting.

See `../README.md`, `../../EXPORT_CONTRACT.md` and `../../../audit/premium-glb-measurements.json` for reproduction and runtime measurements.

The separate `blender/production/v3/material-library.blend` packs all three new material studies, including natural oak, with editable Principled shaders, independent procedural microstructure and metric sample planes. Rebuild with `blender/production/build_material_library.py`; it does not replace any room source or claim a measured PBR scan.
