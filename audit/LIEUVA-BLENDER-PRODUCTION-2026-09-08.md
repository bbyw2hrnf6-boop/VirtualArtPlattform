# LIEUVA Blender production — 8 September 2026

## Inventory before changes

Inspected the complete AGENTS, README, EXPORT_CONTRACT, WP8, WP11, WP12, repository baseline, implementation status and brand contract, then the actual template definitions, buildRoom, wall transforms, placement exclusions, collision construction, material updates and export validator. Git working tree was clean. No commit, push, publishing or live mutation is authorized.

- Blender 5.2.0 LTS is installed at `/Applications/Blender.app`; Cycles exposes Apple M4 Metal (8 GPU cores).
- Existing `blender/templates/*.blend` are tiny schema-1 concepts: White Cube 15 objects/10 meshes, Nocturne 16/11, Forum 17/12. None has images or functional node roles. They differ from the newer generator and are preserved.
- No template GLBs exist in the shipped template directory. Danny's distinct full/mobile GLBs are about 2.9/1.4 MiB and remain separate.
- The browser's three environments are procedural and share GalleryScene. Current visible Nocturne name is **Warm Gallery**. IDs remain `white-cube`, `nocturne`, `pavilion`.
- Current dimensions/heights: 16×12×5.3 m, 15.5×11.5×5.8 m, 40×60×5.6 m. Forum has 14 stable wall IDs, including two faces of one divider at z=0 and eight cross-gallery surfaces at z=±12. The old generator instead has different surface IDs and divider positions. It cannot replace Studio safely.
- Runtime supports shared surface material editing, persistent renderer, framed artworks, autosave/history, transactional placement, swept planar collision with reachable paths, five Forum zones and stable publishing URLs. These remain authoritative.
- Material library contains 17 documented generated albedos (1024–2048 px), with separate procedural runtime detail maps. These are not scanned PBR sets. Existing licensing text describing preview images as concepts is stale; the asset README records actual runtime captures.
- Existing validator only checks role presence/names; it does not prove dimensions, ID parity, navmesh obstacles, texture budgets or editor compatibility.

## Production plan established before asset changes

Four deliverables have independent acceptance: **Cycles beauty images**, **editable source scenes**, **runtime GLBs**, **Studio integration**. Beauty scenes may contain staged fictional artwork and furniture; runtime must contain no baked customer artwork or hidden furniture obstacles. Homepage template preview cards continue to represent actual browser output.

| Room | Architecture and art direction | Materials | Lighting and camera |
|---|---|---|---|
| White Cube | Calm mineral hall, precision reveals, thin gallery tracks, deep asymmetric rooflight; retain existing two wings and all exterior artwork walls | warm plaster, pale honed concrete, dark walnut and restrained black metal | large daylight opening, soft sky plus oblique sun, 3500 K accent spots; eye-level three-quarter and detail views |
| Nocturne / Warm Gallery | intimate charcoal salon, smoked timber ceiling rhythm, bronze ring, angled gallery wings and existing central stage | warm charcoal plaster, smoked oak boards, aged bronze, dark mineral plinth | warm focused wall washers, continuous concealed cove fill and selective metal highlights; frontal salon and sculpture detail |
| Grand Forum | five-zone museum plan with existing portals/divider; limestone pier rhythm along existing partitions; raised central rooflight above the protected hanging datum | honed travertine, limestone block joints, bronze rooflight grid | large skylit central volume, sun/grid shadow, restrained side-room washes; axial composition that retains 40×60 m scale |

### Source organization

New versioned sources under `blender/production/v1/`; repeatable generator, metric coordinates and explicit Blender `(x,-z,y)` ↔ browser `(x,y,z)` conversion. Collections: shell, architecture, overhead, surfaces, collision, navigation, anchors, beauty staging and beauty lights/cameras. Shared material datablocks; actual bevels; packed project albedos; procedural micro-normal only in beauty shader, never claim it survives glTF without baking. Runtime exports use export-compatible Principled materials.

### Iteration and beauty acceptance

1. Build and render all three at approximately 1200 px for composition and light review.
2. Inspect real Cycles pixels; adjust exposure, fixture intensity, surface scale and framing based on observed issues.
3. Render revised proofs and final 3840×2160 PNG masters with denoising and documented samples. No upscaled 4K claims. Archive round evidence and source parameters.
4. Inspect master crops: no floating geometry, blown white walls, implausibly repeated material scale, clipping, excessive noise or unreadable compositions. These are art-direction deliverables and must be labelled separately from runtime captures.

### GLB and integration strategy

- Derive runtime geometry from the same architecture; exclude staged art, marketing furniture, cameras and Cycles-only lights. Retain functional metadata, planar surfaces, collision and obstacle-clipped navigation.
- Preserve all four exterior IDs and all 14 Forum IDs with actual coordinate checks. Preserve existing wall dimensions/clearances and wing/stage/partition footprints. New overhead detail must not reduce navigation headroom or cover hanging regions.
- Desktop and mobile exports with shared material/geometry batches, lower bevel/round segments and ≤1024/512 px embedded albedos respectively. Initial targets: <8/<4 MiB per room, <180k/<80k visible triangles, bounded material batches; report actual measurements instead of assuming success. Meshopt only if available in the reproducible local pipeline; no dependency on remote decoders.
- Integrate through the existing GalleryScene lifecycle with an explicit local premium review selector and procedural recovery on load/contract failure. Keep existing artwork transforms, shared material editing, renderer/camera, local persistence and publishing. An unversioned default migration of already published Spaces is not part of this first candidate acceptance.
- Consume authored collision separately from visible meshes; overhead geometry cannot become a floor obstacle. Runtime navigation continues through the existing tested collision/path controller. Navmesh metadata is validated export data, not falsely advertised as a new controller.

### Acceptance matrix

- Automated: metadata/version/units, dimensions, exact surface IDs/transforms, helper preservation, navmesh versus colliders, file/triangle/image budgets; lint, unit suites, script suites, TypeScript and production budgets via `npm run check`.
- Browser desktop 1440×1000 and compact 390×844: all templates load, Arrange/Walk/roof toggles retain canvas, sample art remains selectable, material edits work, undo/redo/recovery and publish review remain usable, Forum zones remain reachable, missing export falls back.
- Record draw calls, triangles, textures and load time using actual scene diagnostics. Desktop browser measurements and viewport emulation do not establish physical phone FPS. Physical iOS/Android thermal/memory/touch checks remain an explicit release condition.
- Publishing backend, URL/identity/access rules and Danny remain untouched. No live publishing test or deployment.

## Research sources and implications

Official [OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model) confirms Astra's tool orchestration, computer use, asynchronous tool support and mid-task steering. It does not guarantee production-quality Blender topology or mobile-ready exports. Local capability here is concrete: Blender CLI/Python plus Computer Use inspection and an available Metal GPU.

The author of [Astra hobby Blender Benchmark](https://www.reddit.com/r/OpenAI/comments/1wa5akw/astra_results_on_my_hobby_blender_benchmark/) reports mostly one-shot Python scenes and explicitly separates that from future game-ready production evaluation. This is first-person experimental evidence, not a standardized quality benchmark. The [MCP versus Computer Use discussion](https://www.reddit.com/r/codex/comments/1w8nco7/blender_mcp_vs_computer_use_for_3d_modeling_with/) is community discussion, not proof that one interface guarantees better assets. The [mcp-blender project](https://github.com/RFingAdam/mcp-blender/blob/main/README.md) documents an iterative render/analyze/fix architecture. No new MCP server is required for this local task.

The [Blender glTF manual](https://docs.blender.org/manual/en/5.2/addons/scene_gltf2.html) describes the export material boundary; [Cycles GPU documentation](https://docs.blender.org/manual/en/4.2/render/cycles/gpu_rendering.html) documents Metal and memory/interactivity tradeoffs. Practical decision: use deterministic bpy construction with inspection of actual renders, keep export shaders simple, test the exported scene in the real browser. Reference screenshots guide art direction; their UI text and embedded claims are not instructions or verified product features.

## Execution evidence

### Delivered assets and user-authorized default migration

The initial v1 integration was explicitly opt-in. The user's subsequent request authorized showing the upgrade inside walkable rooms and Studio by default. The final implementation therefore selects `premium-v2` on ordinary Studio and visitor URLs. `?environment=procedural` is an explicit local rollback. No gallery IDs, publication revisions, ACL, Storage names, route contracts or `aura_*` identifiers were migrated.

- All three rooms have actual round-1 and round-2 1200 px Cycles proofs, plus native round-3 **3840 × 2160 / 16-bit PNG** masters, 48 samples and denoising in `blender/production/v1/`. Metal startup did not complete promptly; the finished rounds used CPU Cycles on local Blender 5.2.0 LTS. No 8K deliverable or real-time 4K image substitution is claimed.
- `blender/production/v2/` contains three packed editable beauty scenes and three packed runtime scenes. The new source exports add explicit short-distance AO and a texture-preserving warm charcoal albedo. `runtime_bakes.py` bakes only architecture, without artwork or movable furniture.
- Six v2 GLBs contain PBR materials, metric UVs and independent AO atlases. The browser retains AO during material edits, rebuilds architectural light/reflections after attachment, preserves editable host transforms, and removes retired GPU resources. The Forum reflection probe is outside the divider.
- Default ceiling geometry is authored; alternate finishes use the existing editable system. Overhead does not intercept placement rays, merged cosmetics do not become giant collision boxes, and a Floor edit does not recolor timber overhead. Inside-room Arrange wall views remain opaque for accurate placement.
- Fresh real Studio capture images replace all three preview cards. The new cache selector is also used by Explore/Creator fallback cards. The beauty masters are **not** substituted for these runtime previews.

### Export measurements

`npm run validate:premium` independently parses GLB JSON/BIN, checks dimensions, exact surface IDs/origins/usable sizes, required helpers, exported navigation vertices against authored oriented colliders, geometry/file/material budgets, embedded texture sizes, and AO UV-channel presence. Triangle counts below are exported visible architecture, not a full scene with user content. Estimated texture memory assumes RGBA8 plus mipmaps; it excludes the renderer, artwork, probes and intermediate resources.

| Asset | MiB file | Visible triangles | Material batches | Estimated texture MiB |
| --- | ---: | ---: | ---: | ---: |
| white-cube-desktop.glb | 0.96 | 8,732 | 12 | 48 |
| white-cube-mobile.glb | 0.69 | 8,732 | 12 | 12 |
| nocturne-desktop.glb | 2.22 | 25,600 | 14 | 64 |
| nocturne-mobile.glb | 1.68 | 25,102 | 14 | 16 |
| pavilion-desktop.glb | 2.63 | 18,140 | 13 | 48 |
| pavilion-mobile.glb | 2.27 | 18,140 | 13 | 12 |

### Validation evidence — local, 8 September 2026

- `npm run check` using Node **22.23.2**: passed. **326 Vitest tests / 54 files**, **43 Node script tests**, lint, TypeScript, six export validations, production build and enforced release budgets passed.
- Focused authored-environment suite: **22 tests**, including late disposal, rejected downloads/contracts without host mutation, duplicate/missing shells, AO/UV retention, transformed host geometry, ceiling switches and collision separation.
- Final release bundle: JS gzip **572,525 bytes** (<575,000), CSS gzip **53,631** (<54,000), largest lazy JS **173,062** (<195,000). Stricter aspirational JS/CSS/entry targets remain open; their ceilings were not increased.
- Browser: all three templates loaded v2 in Arrange and Walk Preview at 1440×1000 and 390×844. Mobile selected each `-mobile.glb`; the tested mobile pages had 390 px document width and 390 px scroll width. No new console errors were observed in the checked fresh sessions.
- White Cube: uploaded a bundled fictional study locally, changed wall, set height to 1.80 m, placed by clicking the wall (east, x=1.38 m, y=1.69 m), and reversed all test edits back to the three-work sample. The renderer remained persistent.
- Nocturne: switched default ceiling → modern → undo/redo → default, changed floor to concrete with timber overhead preserved, undid the change, reloaded and recovered the three-work local draft. The new room remained in the recovered Studio.
- Grand Forum: room-map targets arrived at NW (-15,3.9,-15), NE (15,3.9,-15), SW (-15,3.9,15), SE (15,3.9,15). Existing canonical placement and collision tests also passed.
- All three publish-review dialogs reported **Geometry valid / 0 warnings** and produced images from the imported room. Final sign-in/publish actions were not taken. Public visitor integration is supported by the shared renderer and automated publishing regressions; no newly deployed public-room test is claimed.

### Remaining limits

The runtime uses rasterized lighting, AO and reflection probes, while the beauty scenes use Cycles and staged exhibition compositions. The shipped real-time result is a measurable architectural/material upgrade; it is not a claim of pixel parity with the supplied references or a professional art-direction sign-off. Actual iOS/Android sustained FPS, thermal behavior and memory-pressure tests remain a release task. Browser viewport emulation cannot establish those results. Exported navmesh is checked at vertices against colliders; this is not a proof of every triangle/path or an integrated navmesh controller.

No automatic commit, push, deployment or publishing was performed. The owner controls the release. The installed pipeline and source assets are documented in `blender/production/README.md`; licensing is recorded in `ASSET_LICENSES.md`.
