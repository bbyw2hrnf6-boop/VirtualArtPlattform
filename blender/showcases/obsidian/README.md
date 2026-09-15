# Obsidian — independent LIEUVA showcase

This is a bespoke, read-only three-room exhibition at `/#/showcase/obsidian`.
It is not a Studio template, publication, Firebase record or replacement for the
Danny reference. The homepage's Art exhibitions image opens it. Sculpture and
Architecture retain their future-showcase state.

## Source and geometry

The owner supplied `Obsidian-Three-Rooms`. `source/layout.json`, `plan.svg` and
`blender-brief.md` govern the reconstruction; the AI-generated room references
are atmosphere references, not photographs or a consistent pre-existing mesh.
Eleven original PNG artworks are retained byte-for-byte under `source/artworks`.
The source asset index records their supplied dimensions and SHA-256 values.

The closed 34 × 8 × 4.5 metre envelope contains rooms of 12, 10 and 12 metres.
Two rectangular 3 × 3.2 metre openings connect them. The entry is a closed walnut
double door. There are no windows, skylights or daylight. Each room has one
3.2 × .75 × .45 metre walnut and taupe-leather bench. Image centres, dimensions,
orientations and 20 mm bronze frames follow the supplied coordinates.

`build.py` creates the packed `obsidian.blend`, all 30 declared cameras and the
original procedural materials. Bevelled edges, independent metric micro-bump,
1 m honed limestone slabs with 2 mm joints, bronze skirting, suspended museum
tracks and separate cove/spot luminaires are real geometry. The generator never
opens or overwrites the three Studio sources.

## Render and browser boundary

Beauty masters use CPU Cycles, 12 total / 6 diffuse / 6 glossy bounces, Light Tree,
adaptive sampling, denoising and AgX. `render_views.py` renders inspection views
from the same geometry; temporary visibility changes are restored after each.

`export.py` bakes direct and indirect diffuse transport into nine atlases, keeping
all original physical shaders active until every bake completes.
`polish_lightmaps.py` applies Blender's OpenImageDenoise compositor to the raw
linear-light transport, then encodes the delivery textures without applying a
second AgX transform. It never filters the original artwork textures. The browser
uses these baked diffuse textures with three room-local reflection probes for
the floor's view-dependent specular lobe. It is not live path tracing: floor
reflections are an approximation, and fixture/light edits require a new bake.
The Cycles beauty render and browser presentation are separate deliverables.
Artwork textures remain independent, at their supplied aspect ratios. Browsing
the directory loads full-resolution WebP delivery derivatives; original PNGs
remain in the source and packed Blender file.

Desktop uses 2048 px architecture/floor atlases and 1024 px furniture atlases.
Mobile caps all maps at 1024 px. The visitor explicitly enters before the GLB is
requested. Data Saver can stay on the poster/directory. The renderer stops when
idle or hidden and is disposed when leaving. No automatic camera motion occurs.
Keyboard movement is scoped to the focused scene; touch movement uses held
44 px controls. Collision checks use the fixed closed shell, portals and benches
with small substeps to prevent tunnelling. Room buttons change viewpoint without
an automatic flight. Every artwork remains available without WebGL.

This experiment deliberately has a separate asset allowance from Studio's
editable-room budgets, as requested by the owner. Existing Studio GLB validators
and quality gates are retained. Exact exported bytes and source checksums are
recorded in [`asset-manifest.json`](./asset-manifest.json). The current desktop
GLB is 10.8 MB; mobile is 8.2 MB. Both contain 90,660 triangles. Estimated decoded
RGBA texture storage with mipmaps is 243 MB / 97 MB respectively, before reflection
targets, framebuffers and transient decoding memory. Physical iOS/Android
performance still needs review.

## Reproduce

From the repository root, using the installed Blender 5.2 LTS:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python blender/showcases/obsidian/build.py -- --width 1200 --samples 80 --round r4
/Applications/Blender.app/Contents/MacOS/Blender -b blender/showcases/obsidian/obsidian.blend --python blender/showcases/obsidian/export.py
/Applications/Blender.app/Contents/MacOS/Blender -b blender/showcases/obsidian/obsidian-runtime.blend --python blender/showcases/obsidian/polish_lightmaps.py
/Applications/Blender.app/Contents/MacOS/Blender -b blender/showcases/obsidian/obsidian.blend --python blender/showcases/obsidian/render_views.py -- --camera R1-SW --width 3840 --samples 256
/Applications/Blender.app/Contents/MacOS/Blender -b blender/showcases/obsidian/obsidian.blend --python blender/showcases/obsidian/render_views.py -- --proofs
python3 blender/showcases/obsidian/manifest.py
```

After the beauty master finishes, run `prepare_images.py` with a Python runtime
containing Pillow, then rerun `manifest.py`. It encodes a 1920 × 1280 WebP cover
from the 3840 × 2560, 256-sample, 16-bit Cycles master and independent WebP artwork
delivery copies. The PNG originals and master are retained unchanged.

Exploratory rounds and logs belong in ignored `artifacts/obsidian`. Retain the
packed source, original artwork, final masters and lightmaps. Nothing here
deploys or mutates production data.

## Research applied

- [Blender's sampling documentation](https://docs.blender.org/manual/fi/4.5/render/cycles/render_settings/sampling.html): Light Tree, adaptive sampling, and the cost/quality distinction; sample count alone does not repair blocked luminaires or geometry.
- [Blender's Cycles baking documentation](https://docs.blender.org/manual/de/4.5/render/cycles/baking.html): UV targets and direct/indirect diffuse transport for interactive lightmaps.
- [Blender's render passes](https://docs.blender.org/manual/en/4.5/render/layers/passes.html): keep diffuse and glossy contributions conceptually separate.
- [Reddit archviz critique](https://www.reddit.com/r/blender/comments/1d4yaml/what_could_i_improve_to_make_it_look_more/): practitioner suggestions on bevels, plausible roughness, scale and exposure. These are visual heuristics, not a measured guarantee or a replacement for render verification.

The four initial render rounds corrected a blocked cove emitter, coincident
floor surfaces, over-bright walnut and overly dense mineral veining before the
high-resolution render and lightmap bake. No online artwork, model or material
download was incorporated.
