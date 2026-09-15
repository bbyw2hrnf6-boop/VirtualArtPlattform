# Sculpture Pavilion — independent LIEUVA showcase

`/#/showcase/sculpture-pavilion` is the homepage Sculpture & 3D showcase. Both
its preview and “Explore Sculpture Pavilion” action open the same exhibition.
It is separate from Studio templates, publications, Firebase identities and the
Danny reference. Architecture remains the future showcase.

## Authoring source

The owner supplied the complete Sculpture-Pavilion reference package. All 65
concept images, sculpture specifications, source prompts/index and metric plans
are retained under `source/`. The references are declared AI-generated; they
are visual directions, not scans or a pre-existing coherent model. The five
works here are original procedural reconstructions with real geometry.

`prepare_plan.py` reads the metric layout with Shapely. `build.py` creates the
packed Blender 5.2 source and 36 cameras: 30 specified room views, a cover and
five sculpture portraits. Blender uses X east / Y north / Z up in metres;
the glTF viewer uses `(x, z, -y)`.

The elliptical 20 × 16 × 8 m Sculpture Atrium, rounded 14 × 12 × 5 m Glass
Gallery and 24 × 10 m vaulted Kinetic Hall form an A → B → C → A circuit.
Three four-metre passages join the rooms; the entrance ends at a closed flush
door. Daylight enters through the oval rooflight, one gallery strip and five
vault slits. Six vault ribs, continuous plaster, terrazzo, one curved bench,
low plinths, object labels, warm spots and recessed perimeter lighting complete
the envelope. Floor vertices are welded before slab thickness is applied;
there must be no internal triangular slab walls or disconnected lightmap islands.

- **Rooted Silence:** carved ivory face, closed eyes, smooth cheek, hollow rear
  and seven branching root forms.
- **Tidal Bronze:** three twisting bronze ribbons, negative openings and patina.
- **Growth Fold:** continuous five-lobed ash shell, spiral seam and crown tips.
- **Aerial Bloom:** twelve solid glass leaves, amber core, bronze hub and three
  suspension cables. Clearance prevents visitors walking beneath the object.
- **Gentle Engine:** ash spindle, eight ribs, eight articulated legs and two
  framed leaf wings. A twelve-second loop keeps the sculpture anchored.

## Beauty and interactive rendering

The three retained room masters are native 3840 × 2160 Cycles renders at 256
samples. Five independent 1200 px object portraits use 128 samples. Metal,
Light Tree, adaptive sampling, AgX, 16 total / 8 diffuse / 8 glossy / 12
transmission bounces and denoising are explicit in the source. Materials have
metric procedural grain, fine mineral relief, real edge radii and glass thickness.
The cover and directory WebPs are encodings of actual Blender renders, never
substituted concept images. Temporary inspection rounds belong in ignored artifacts.

Browser delivery is a separate approximation, not real-time Cycles. Nine diffuse
transport atlases are baked at 96 samples and denoised in linear light. A/C floors
retain 4K maps, architecture 2K and furniture 1K; mobile caps floors at 2K and other
maps at 1K. Architecture and furniture retain authored tessellation. Sculptures
retain independent baked albedo/normal maps and PBR metallic or transmission
shaders. Mesh simplification happens **before** UV packing and
baking, preserving atlas continuity. Meshopt compression reduces transfer without
replacing the high-resolution Blender source. Never simplify a baked atlas mesh
without rebaking its changed UVs.

The shared viewer captures one local environment probe on entry, adds runtime
sculpture lighting and one softened planar reflection over the exact floor mesh.
Glass refraction and reflective roughness are browser approximations; diffuse
shadows are baked in the sculpture's rest pose, so they do not dynamically track
the animated wings/legs. This is an intentional limitation of the showcase.
The existing 2K/1K reflection targets and measured slow-GPU fallback remain in
place. Asset bytes, triangle counts, animation count, checksums and decoded RGBA
texture estimates (including mipmaps, excluding framebuffers/temporary decode)
are recorded in [asset-manifest.json](./asset-manifest.json). Delivery is 8.57 MB
desktop / 5.79 MB mobile, with 614,476 triangles and approximately 453 / 149 MiB
decoded textures respectively. The separate route
adds an explicit 3 KB to the aggregate compressed-JS allowance (610 KB). Entry,
largest-lazy-chunk, CSS and Studio asset ceilings remain unchanged.

## Visitor behavior

Both bespoke exhibitions use the same renderer component and public Space
walking/menu primitives. Tap/click floor paths, look while walking, scoped WASD,
E/Q or vertical arrows, touch drag, pinch/wheel/tap zoom, pace, Reset and
Walk/Overview work through the existing controller. The pavilion navigation
follows the supplied metric room union with visitor clearance and object/bench
obstacles. Grid A* smooths only collision-free segments; collision substeps
prevent tunnelling. Room selection changes viewpoint without an automatic flight.
Overview cuts architecture, glazing and coves above one metre while retaining
complete sculptures, then restores the saved walk pose. Multi-material glTF
children inherit their artwork identity for both direct selection and cutaway.

Motion is confined to Gentle Engine while visiting the Kinetic Hall. Reduced
motion, Overview, artwork dialogs and hidden documents stop that animation.
The page requests a desktop/mobile model only after explicit entry. Data Saver
can keep the poster and five-object directory; failed WebGL/model loading leaves
that directory usable. These desktop/touch browser checks do not qualify real
iOS/Android GPU memory, thermal behavior or sustained frame rate.

## Reproduce

Use Blender 5.2 LTS and a Python environment with Pillow and Shapely. Run from
the repository root, with one GPU job at a time on a 16 GB Mac:

```sh
python3 blender/showcases/sculpture-pavilion/prepare_plan.py
/Applications/Blender.app/Contents/MacOS/Blender -b --python-exit-code 1 --python blender/showcases/sculpture-pavilion/build.py
/Applications/Blender.app/Contents/MacOS/Blender -b blender/showcases/sculpture-pavilion/sculpture-pavilion.blend --python-exit-code 1 --python blender/showcases/sculpture-pavilion/render.py -- --cameras Cover,B-SW,C-SE --width 3840 --samples 256 --out blender/showcases/sculpture-pavilion/masters
/Applications/Blender.app/Contents/MacOS/Blender -b blender/showcases/sculpture-pavilion/sculpture-pavilion.blend --python-exit-code 1 --python blender/showcases/sculpture-pavilion/render.py -- --cameras S01-Portrait,S02-Portrait,S03-Portrait,S04-Portrait,S05-Portrait --width 1200 --samples 128 --out blender/showcases/sculpture-pavilion/masters/objects
/Applications/Blender.app/Contents/MacOS/Blender -b blender/showcases/sculpture-pavilion/sculpture-pavilion.blend --python-exit-code 1 --python blender/showcases/sculpture-pavilion/export.py
/Applications/Blender.app/Contents/MacOS/Blender -b blender/showcases/sculpture-pavilion/sculpture-runtime.blend --python-exit-code 1 --python blender/showcases/sculpture-pavilion/polish.py
sh blender/showcases/sculpture-pavilion/compress.sh
python3 blender/showcases/sculpture-pavilion/prepare_images.py
python3 blender/showcases/sculpture-pavilion/manifest.py
```

`render.py --cameras all` supports all authored inspection cameras. Render/bake
reports record actual settings and times. `compress.sh` uses the pinned build-only
`@gltf-transform/cli@4.5.0` from npm; it is not a runtime dependency. Keep primary
sources, masters and bake inputs; no caches, logs, duplicate exploratory exports
or `.blend1` files belong in version control. No script deploys or changes live data.
