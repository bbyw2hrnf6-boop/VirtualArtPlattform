# White Cube · 72-second camera study

Local beauty reference sampled from the actual desktop `scrollStoryModel.ts`.
`camera-samples.json` records the source hash, 24 fps samples and exact QA poses.
The packed `white-cube-story.blend` has a separate editable camera, four artwork
controllers and one bench controller. Timeline frames 1–1729 include the exact
72-second endpoint; a 24 fps movie excluding that duplicate endpoint has 1728 frames.

The camera follows all 24 shots from the v2 direction, holds during the three
material comparisons and closes the front cutaway only after entering the room.
Visibility keys are discrete. This is a camera study: browser clipping of rising
architecture, the three finish changes and the UI are not reproduced here.
Artwork groups arrive in sequence during shots 8–10; furniture arrives in shot 11. The source's four fictional panels
and walnut bench differ from the current runtime draft. A neutral original ground
plane is beauty-only. Source materials/lights remain editable and images packed.

Three 960×540, 16-sample CPU stills are QA references, not 4K marketing masters or
runtime screenshots. `render-manifest.json` records pending/completed status,
camera verification and file hashes. No runtime GLB or existing source is changed.
Existing LIEUVA fictional-artwork/material provenance applies; no external assets.

Rebuild: run `sample_story.mjs` with Node 22.23.2 `--experimental-strip-types`, then
Blender `-b --python blender/production/author_story.py` from the repository root.
Append `-- --reuse-story-proofs` to preserve existing stills only when the source
blend and every desktop camera/proof sample remain unchanged. This still rebuilds
the editable story and refreshes its source hash; material proofs render separately.

`material-library-closeup.blend` contains three metric studies on frames 1–3, with matching concrete, limestone and oak closeups. Albedo repeats every 3 / 3 / 2.4 m; independent bump repeats four times as often, with Blender distance parameters 1.5 / 1.5 / 1.2 mm. Oak relief follows the albedo's vertical grain. Roughness uses independent maps at albedo repeat, multiplied by .6 / .6 / .5. These are shading parameters, not measured displacement or a claim of pixel parity with Three.js. Original albedo tint is retained for source inspection. The original library and room source remain unchanged. The grayscale maps are original deterministic procedural project assets, derived from the runtime detail formula; no additional external assets or licenses. See `material-closeup-manifest.json` for maps, provenance and completed proof hashes.

After authoring, run the Node 22.23.2 sampler again with `--validate` to verify current camera code/samples, source and output hashes, and byte-exact independent detail maps against the current runtime function. It writes `final-validation.json` and does not replace the camera samples or render images.

Timing-only runtime changes may leave every sampled pose unchanged. Validation
compares all current frame/proof poses exactly, checks the saved render-code hash
against its authoring manifest, and records current and render-time code hashes
separately. It does not relabel an existing Blender source or image as a new render.

Provenance refresh: the runtime now restricts the new directional grain to oak. Revalidation confirms unchanged concrete, limestone and oak detail buffers; existing images and blends are preserved. The material manifest retains its render-time source hash and records the current runtime validation separately.


10 September CI follow-up: stationary Studio rendering and test scheduling changed;
no camera pose, material formula, source blend, image or GLB was replaced. Running
`--validate` refreshed `final-validation.json` against the current runtime source
and confirmed the original camera samples, asset hashes and detail buffers. This
is validation of the existing renders, not an additional Blender render round.
