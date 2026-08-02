# AURA Blender → GLB contract

This is the authored-space contract for future GLB-backed AURA templates. One Blender unit equals one metre. Blender sources are Z-up; exported glTF files are Y-up for Three.js.

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
