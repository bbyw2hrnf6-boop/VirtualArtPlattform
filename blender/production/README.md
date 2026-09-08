# LIEUVA Blender production

The three template environments now use `premium-v2` by default in the shared Studio and visitor renderer. This is a local implementation awaiting the owner's normal release workflow. Nothing here deploys or publishes.

## Four separate deliverables

| Deliverable | Location | Purpose |
| --- | --- | --- |
| Cycles beauty masters | `v1/{white-cube,nocturne,pavilion}-r3-3840.png` | Native 3840 × 2160, 16-bit PNG, 48 samples, denoised, AgX. Art direction/marketing; staged fictional artworks and furniture. Not browser screenshots. |
| Editable beauty sources | `v2/{id}.blend` | Packed project images, metric architecture, named collections, bevels, Cycles materials/lights/cameras and separate staging. |
| Editable runtime sources | `v2/{id}-runtime.blend` | Static batches, original metric UVs plus independent AO UV atlas and packed baked maps. No beauty staging/lights/cameras. |
| Runtime and integration | `../../public/assets/templates/premium-v2/*.glb` and `src/features/gallery/scene/premiumEnvironment.ts` | Six desktop/mobile assets; actual geometry in Arrange, Walk Preview and shared published viewer. |

The archived v1 proof rounds document composition, exposure and geometry iteration. The v2 beauty sources preserve round-3 architecture; v2 export changes concern contact AO and real-time materials. No v2 4K rerender is claimed. CPU Cycles was used on the installed Blender 5.2.0 LTS; Metal was available but initial kernel compilation stalled, so the completed renders do not claim GPU acceleration.

## Reproduce

Run from the repository root, once per room (`white-cube`, `nocturne`, `pavilion`):

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python blender/production/build_premium.py -- --room white-cube --round 3 --width 3840 --samples 48 --device CPU --export --bake-ao
npm run validate:premium
npm run check
```

Use `--no-render --export --bake-ao` for runtime/source production without a new beauty render. Use `--width 1200 --samples 24` for a composition proof. Outputs go into `v2/`; export commands overwrite that room's v2 generated outputs. Node 22.23.2 is the repository's required version.

## Export boundary

Collections are `SHELL`, `ARCHITECTURE`, `OVERHEAD`, `SURFACES`, `COLLISION`, `NAVIGATION`, `ANCHORS`, `BEAUTY_STAGING`, `BEAUTY_LIGHTS`, and `CAMERAS`. The last three are excluded from GLB exports. One metre remains one unit; Blender `(x,-z,y)` becomes browser `(x,y,z)`.

AO is a geometry-only, 0.85 m ambient-occlusion term baked through an explicit Ambient Occlusion shader and emission bake (16 Cycles samples, 32 AO samples). It is not a lighting/beauty bake and contains no artwork or movable furniture. `glTF Material Output/Occlusion` exports the independent `TEXCOORD_1`; the original metric UV channel remains available for editable albedo/detail maps. Desktop maps are at most 1024 px, mobile at most 512 px. Textures are embedded JPEG; no remote decoder, Meshopt or KTX2 requirement is introduced.

Architecture is batched by material/overhead policy. Functional nodes stay separate. The three protected footprints, surface IDs, eye height, room zones and publication identities are unchanged. The current navigation controller consumes authored hidden colliders and the existing canonical placement surfaces; exported navmesh/anchor data is validated for future use and is not presented as a newly integrated navigation controller.

## Browser behavior

- Normal URLs load v2 automatically, including old published drafts using these template IDs. No data migration or revision change occurs.
- `?environment=procedural` before the hash selects the existing procedural environment for local diagnosis/rollback. A loading or validation failure retains that environment.
- Desktop uses desktop GLBs. Compact viewports, coarse pointers and low hardware tiers use mobile GLBs; renderer quality still adapts independently.
- Materials preserve AO while replacing editable albedo/bump/roughness. Timber overhead cannot be changed by the Floor control.
- Default ceiling choices show authored overhead; alternate ceiling choices use the existing editable ceiling system. Arrange hides overhead and fades partitions. Invisible collision/ceiling helpers do not intercept wall placement.
- Room lighting and reflection probes are rebuilt after attachment. The Forum probe sits in a free aisle rather than inside its central divider.
- Artwork remains separate, color managed and editable; the same renderer/camera survives view and material changes. Preview capture waits for the room asset to settle.

See `../../audit/LIEUVA-BLENDER-PRODUCTION-2026-09-08.md` and `../../audit/premium-glb-measurements.json` for evidence and limits. Existing project asset provenance applies; see `../../ASSET_LICENSES.md`. The supplied reference screenshots guide art direction, not product functionality or reproduction rights.
