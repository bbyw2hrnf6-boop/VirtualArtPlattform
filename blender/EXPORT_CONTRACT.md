# LIEUVA Blender → GLB contract

This is the authored-space contract for LIEUVA templates. Legacy `aura_*` keys remain compatibility identifiers. One Blender unit equals one metre. Blender sources are Z-up; exported glTF files are Y-up for Three.js.


## Current production path — 9 September 2026

The shared Studio/visitor renderer loads `public/assets/templates/premium-v3/{id}-{desktop,mobile}.glb` by default. Use `blender/production/build_premium.py` and `npm run validate:premium`; see [production instructions](./production/README.md). The older `create_templates.py` and `blender/templates/` files below are retained historical concepts and are not the current Studio-compatible export path.

Additional required metadata: `lieuva_production_version=premium-v3`, `aura_dimensions=[width, depth, hanging-height]`. Exactly four exterior `shell` meshes plus one `floor`; stable IDs come from `galleryWalls()` (4/4/14). `architecture` and `ceiling` are visual batches; `lieuva_overhead` controls their visibility independently from hidden collision geometry. Overhead visual height may exceed the protected hanging datum (Grand Forum rooflight 8.9 m).

Architecture AO uses `occlusionTexture.texCoord=1` with a separate atlas; albedo remains sRGB and metric/repeating. Imported materials preserve AO, normal and alpha state. Functional helpers never render. The existing placement planes and collision/path controller remain authoritative: imported colliders are consumed; navmesh and anchors are verified export data, not an alternative controller. Current Studio artwork eye line and WALK_START are 1.75 m; the older 1.55–1.60 m recommendation below is historical, not the current default.

## Required scene metadata

- `aura_template_id`: `white-cube`, `nocturne`, or `pavilion`
- `aura_schema_version`: currently `2`
- `aura_units`: `metres`

## Node roles

Every functional node carries an `aura_role` custom property. Blender exports these properties into glTF `extras`.

| `aura_role` | Naming pattern | Runtime use |
| --- | --- | --- |
| `surface` | `SURFACE_<surface-id>` | Selectable artwork wall; also carries `aura_surface_id` and `aura_zone`. |
| `floor` | `SHELL_Floor` | Walk target and floor-material surface. |
| `collider` | `COLLIDER_<id>` | Solid Walk collision. Hidden from rendering, never discarded on load. |
| `navmesh` | `NAVMESH_<zone>` | Valid click-to-walk and nearest-point projection. Hidden from rendering. |
| `art-anchor` | `ART_ANCHOR_<surface>_<nn>` | Suggested artwork placement and eye line. |
| `walk-start` | `WALK_START` | Initial visitor position at 1.75 m eye height. |
| `walk-look` | `WALK_LOOK` | Initial visitor look target. |
| `view` | `VIEW_<zone>_<nn>` | Smart overview/wall views. |
| `room` | `ROOM_<zone>` | Room jump and minimap label. |
| `light` | `LIGHT_<id>` | Authored light; runtime may replace or bake it by quality tier. |

Collider and navmesh nodes must remain in the GLB. The runtime hides their meshes after deriving collision/navigation geometry.

## Surface requirements

- Surface IDs are stable API identifiers, not presentation labels.
- A surface is a single planar artwork region with predictable local axes.
- Its origin is centered on the usable area.
- Door, reveal, corner, plinth, and ceiling clearances are excluded from the usable surface.
- Grand Forum surfaces also carry a stable `aura_zone`.
- Art anchors store `aura_eye_line` in metres; the default target is 1.55–1.60 m.

## Material requirements

- Base color textures use sRGB.
- Normal, roughness, metallic, and AO maps use linear color space.
- A base-color image must never be reused as a bump map.
- Texture scale is authored in real metres and checked on the largest room.
- Artwork materials are separate from architectural lighting and calibrated for color fidelity.
- Repeated materials and textures share datablocks before export.

## Export and validation

Generate sources and GLBs with Blender 4.2 or newer:

```bash
blender --background --python blender/create_templates.py
```

Then validate the node/extras contract:

```bash
npm run validate:glb -- public/assets/templates/white-cube.glb
```

Before replacing a runtime space, visually compare Arrange, Walk, Overview, and reduced-motion fallbacks on desktop and mobile. Compress the approved GLB with Meshopt and textures with KTX2 or WebP without stripping names, extras, anchors, or animations.
