"""Author the runtime's 20-second White Cube camera as a separate beauty study.

First: npm exec --yes --package=node@22.23.2 -- node --experimental-strip-types
       blender/production/sample_story.mjs
Then: Blender -b --python blender/production/author_story.py
Only v3/story outputs are written. This script never exports runtime assets.
"""
import hashlib
import json
import math
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "v3/story"
SOURCE = OUT.parent / "white-cube.blend"
SAMPLES = OUT / "camera-samples.json"
OUTPUT = OUT / "white-cube-story.blend"
REUSE_PROOFS = "--reuse-story-proofs" in sys.argv
CAMERA_ONLY = "--camera-only" in sys.argv
old_readme = (OUT / "README.md").read_text() if (OUT / "README.md").exists() else ""


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def vec(point):
    """Browser (x,y,z) -> Blender (x,-z,y)."""
    return Vector((point[0], -point[2], point[1]))


def reveal(progress, start, end):
    amount = max(0, min(1, (progress - start) / (end - start)))
    return amount * amount * (3 - 2 * amount)


score = json.loads(SAMPLES.read_text())
assert sha256(ROOT / score["source"]["path"]) == score["source"]["sha256"], "Resample the changed runtime camera first."
assert score["fps"] == 86.4 and score["durationMs"] == 20_000
source_hash = sha256(SOURCE)
previous_manifest = json.loads((OUT / "render-manifest.json").read_text()) if REUSE_PROOFS else None
if REUSE_PROOFS:
    previous_validation = score.get("previousSampleValidation", {})
    same_pose_hash = previous_manifest.get("desktopPoseSha256") == score["desktopPoseSha256"]
    same_previous_samples = (
        previous_validation.get("source") == previous_manifest["cameraSource"]
        and previous_validation.get("desktopSamplesIdentical")
        and previous_validation.get("proofSamplesIdentical")
    )
    assert same_pose_hash or same_previous_samples, "Camera poses changed; render new story proofs."
    assert previous_manifest["status"] == "complete" and previous_manifest["sourceBlendSha256"] == source_hash
assert SOURCE.resolve() != OUTPUT.resolve()
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
assert scene.get("aura_template_id") == "white-cube"
OUT.mkdir(parents=True, exist_ok=True)

animation = bpy.data.collections.new("STORY_ANIMATION")
scene.collection.children.link(animation)
staging = list(bpy.data.collections["BEAUTY_STAGING"].objects)
art_names = sorted(o.name for o in staging if o.name.startswith(("Field study", "Arrival study")) and not o.name.endswith(" frame"))
assert len(art_names) == 4, "Inspect changed beauty staging before classifying it."


def controller(name, children, anchor, stage):
    parent = bpy.data.objects.new(name, None)
    animation.objects.link(parent)
    parent.location = anchor
    parent["lieuva_story_stage"] = stage
    bpy.context.view_layer.update()
    for child in children:
        world = child.matrix_world.copy()
        child.parent = parent
        child.matrix_world = world
        child["lieuva_story_stage"] = stage
    return parent, children, anchor.copy()


art_groups = []
for name in art_names:
    canvas = bpy.data.objects[name]
    children = [canvas, bpy.data.objects[name + " frame"]]
    art_groups.append(controller("STORY_ART_" + name, children, canvas.location.copy(), "artwork"))

decor_objects = [o for o in staging if not o.name.startswith(("Field study", "Arrival study"))]
assert {o.name for o in decor_objects} == {"Walnut bench seat", "Bench leg", "Bench leg.001"}
decor = controller("STORY_DECOR_Walnut bench", decor_objects, vec((-3, 0, 1.6)), "decor")
overhead = list(bpy.data.collections["OVERHEAD"].objects)
shells = {o["aura_surface_id"]: o for o in bpy.data.collections["SHELL"].objects if o.get("aura_role") == "shell"}
normals = {"north": Vector((0, 0, -1)), "south": Vector((0, 0, 1)), "west": Vector((-1, 0, 0)), "east": Vector((1, 0, 0))}
art_lights = [(bpy.data.objects[name + " wash"], bpy.data.objects[name + " wash"].data.energy) for name in art_names]

# An original neutral presentation ground catches the aerial model's shadow.
# It belongs only to this beauty study, not to the browser room or its GLB.
bpy.ops.mesh.primitive_plane_add(size=160, location=(0, 0, -.225))
ground = bpy.context.object
ground.name = "STORY_Backdrop · beauty only"
for collection in list(ground.users_collection):
    collection.objects.unlink(ground)
animation.objects.link(ground)
material = bpy.data.materials.new("STORY_Backdrop · warm charcoal")
material.use_nodes = True
shader = material.node_tree.nodes.get("Principled BSDF")
shader.inputs["Base Color"].default_value = (.055, .061, .047, 1)
shader.inputs["Roughness"].default_value = .95
ground.data.materials.append(material)
ground["lieuva_beauty_only"] = True

data = bpy.data.cameras.new("Story · sampled runtime camera")
camera = bpy.data.objects.new("Story · sampled runtime camera", data)
bpy.data.collections["CAMERAS"].objects.link(camera)
data.type = "PERSP"
data.lens_unit = "FOV"
data.sensor_fit = "VERTICAL"
data.sensor_height = 24
data.clip_start = .1
data.clip_end = 240
camera.rotation_mode = "QUATERNION"
scene.camera = camera

hidden_state = {}


def visibility(obj, hidden, frame):
    if hidden_state.get(obj.name) == hidden:
        return
    hidden_state[obj.name] = hidden
    obj.hide_render = obj.hide_viewport = hidden
    obj.keyframe_insert(data_path="hide_render", frame=frame)
    obj.keyframe_insert(data_path="hide_viewport", frame=frame)


# Include exact requested proof poses, even when they fall between 86.4 samples per second.
frames = {pose["frame"]: pose for pose in score["frames"]}
frames.update({pose["frame"]: pose for pose in score["proofs"]})
previous_rotation = None
for frame, pose in sorted(frames.items()):
    progress = pose["progress"]
    camera.location = vec(pose["position"])
    rotation = (vec(pose["target"]) - camera.location).to_track_quat("-Z", "Y")
    if previous_rotation is not None and previous_rotation.dot(rotation) < 0:
        rotation.negate()
    previous_rotation = rotation.copy()
    camera.rotation_quaternion = rotation
    data.lens = 12 / math.tan(math.radians(pose["fov"]) / 2)
    camera.keyframe_insert(data_path="location", frame=frame)
    camera.keyframe_insert(data_path="rotation_quaternion", frame=frame)
    data.keyframe_insert(data_path="lens", frame=frame)

    inside = abs(pose["position"][0]) < 7.8 and abs(pose["position"][2]) < 5.8 and pose["position"][1] < 5.05
    direction = Vector((pose["position"][0], 0, pose["position"][2])).normalized()
    for obj in overhead:
        visibility(obj, pose["cutaway"], frame)
    for side, obj in shells.items():
        visibility(obj, pose["cutaway"] and not inside and normals[side].dot(direction) > .42, frame)

    art = reveal(progress, 7/24, 10/24)
    for index, (parent, children, anchor) in enumerate(art_groups):
        art = reveal(progress, (7 + min(index, 2))/24, (7.85 + min(index, 2))/24)
        parent.location = anchor + Vector((0, 0, -(1 - art) * .2))
        parent.scale = (1, 1, 1)
        parent.scale *= .92 + .08 * art
        parent.keyframe_insert(data_path="location", frame=frame)
        parent.keyframe_insert(data_path="scale", frame=frame)
        for obj in children:
            visibility(obj, art <= .001, frame)
    for light, energy in art_lights:
        light.data.energy = energy * art
        light.data.keyframe_insert(data_path="energy", frame=frame)
    amount = reveal(progress, 10/24, 11/24)
    parent, children, _ = decor
    parent.scale = (amount, amount, amount)
    parent.keyframe_insert(data_path="scale", frame=frame)
    for obj in children:
        visibility(obj, amount <= .001, frame)

# Dense samples interpolate linearly; visibility changes are deliberately discrete.
# Blender 5 actions use layers/strips/channelbags rather than legacy action.fcurves.
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = "CONSTANT" if curve.data_path.startswith("hide_") else "LINEAR"

scene.render.fps = round(score["fps"] * 10)
scene.render.fps_base = 10
scene.frame_start = score["frameStart"]
scene.frame_end = score["frames"][-1]["frame"]
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 16
scene.cycles.use_denoising = True
scene.render.threads_mode = "FIXED"
scene.render.threads = 2
scene.render.use_persistent_data = True
scene.render.resolution_x = 960
scene.render.resolution_y = 540
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_depth = "16"
scene.render.film_transparent = False
scene["lieuva_story_seconds"] = 20
scene["lieuva_story_source"] = score["source"]["path"]
scene["lieuva_story_source_sha256"] = score["source"]["sha256"]
scene["lieuva_story_desktop_pose_sha256"] = score["desktopPoseSha256"]
scene["lieuva_story_note"] = "Actual desktop runtime camera, vertical FOV. Four source beauty artworks and one walnut bench, not the runtime draft's staged assets. Cutaway visibility uses discrete keys; preview animation only."
for progress, label in [(0, "01 · Room"), (.25, "02 · Collection"), (.5, "03 · Atmosphere"), (.75, "04 · Interior"), (1, "End · 20 seconds")]:
    scene.timeline_markers.new(label, frame=round(1 + progress * (scene.frame_end - 1)))
for image in bpy.data.images:
    if image.source == "FILE" and not image.packed_file:
        image.pack()
scene.frame_set(1)
for obj in bpy.context.selected_objects:
    obj.select_set(False)
camera.select_set(True)
bpy.context.view_layer.objects.active = camera
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            area.spaces.active.region_3d.view_perspective = "CAMERA"

manifest = {
    "status": "rendering", "blender": bpy.app.version_string,
    "sourceBlend": str(SOURCE.relative_to(ROOT)), "sourceBlendSha256": source_hash,
    "cameraSource": score["source"], "durationSeconds": 20, "fps": score["fps"],
    "desktopPoseSha256": score["desktopPoseSha256"],
    "previousSampleValidation": score.get("previousSampleValidation"),
    "frameStart": scene.frame_start, "frameEnd": scene.frame_end, "inclusiveEndpoint": True,
    "render": {"width": 960, "height": 540, "samples": 16, "device": "CPU", "threads": 2, "bitDepth": 16, "viewTransform": scene.view_settings.view_transform},
    "staging": {"artworkGroups": art_names, "decorObjects": [o.name for o in decor_objects], "beautyOnlyBackdrop": ground.name},
    "proofs": [],
}
notice = """# White Cube · 20-second camera study

Local beauty reference sampled from the actual desktop `scrollStoryModel.ts`.
`camera-samples.json` records the source hash, 86.4 samples per second and exact QA poses.
The packed `white-cube-story.blend` has a separate editable camera, four artwork
controllers and one bench controller. Timeline frames 1–1729 include the exact
20-second endpoint; all 1,728 original intervals are retained and play in 20 seconds.

The camera follows all 24 shots from the v2 direction, holds during the three
material comparisons and closes the front cutaway only after entering the room.
Visibility keys are discrete. This is a camera study: browser clipping of rising
architecture, the floor/wall finish changes and the UI are not reproduced here.
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
"""
material_notes = old_readme[old_readme.index("`material-library-closeup.blend`"):] if "`material-library-closeup.blend`" in old_readme else ""
(OUT / "README.md").write_text(notice + "\n" + material_notes)
text = bpy.data.texts.new("STORY_README")
text.write(notice)
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT), compress=True)
manifest["editableBlend"] = {"path": OUTPUT.name, "sha256": sha256(OUTPUT)}


def write_manifest():
    (OUT / "render-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


write_manifest()
for pose in score["proofs"]:
    frame = pose["frame"]
    scene.frame_set(math.floor(frame), subframe=frame % 1)
    expected = vec(pose["position"])
    vertical_fov = math.degrees(2 * math.atan(12 / camera.data.lens))
    position_error = (camera.location - expected).length
    direction_error = (camera.rotation_quaternion @ Vector((0, 0, -1))).angle((vec(pose["target"]) - expected).normalized())
    assert position_error < .0001 and abs(vertical_fov - pose["fov"]) < .001 and direction_error < .001, "Sampled camera mismatch."
    filename = f"white-cube-story-{round(pose['progress'] * 100):02d}.png"
    scene.render.filepath = str(OUT / filename)
    started = time.monotonic()
    previous_proof = None
    if REUSE_PROOFS:
        previous_proof = next(p for p in previous_manifest["proofs"] if p["path"] == filename)
        assert all(previous_proof[key] == value for key, value in pose.items())
        assert sha256(OUT / filename) == previous_proof["sha256"], "Existing proof changed."
    else:
        bpy.ops.render.render(write_still=True)
    manifest["proofs"].append({
        **pose, "path": filename,
        "seconds": previous_proof["seconds"] if previous_proof else round(time.monotonic() - started, 2),
        "reused": REUSE_PROOFS,
        "renderCameraSource": previous_proof.get("renderCameraSource", previous_manifest["cameraSource"]) if previous_proof else score["source"],
        "sha256": sha256(OUT / filename), "bytes": (OUT / filename).stat().st_size,
        "positionErrorMetres": position_error, "verticalFovDegrees": vertical_fov,
        "directionErrorRadians": direction_error,
        "hiddenShells": [side for side, obj in shells.items() if obj.hide_render],
        "overheadHidden": all(obj.hide_render for obj in overhead),
    })
    write_manifest()
    print("STORY_PROOF=" + json.dumps(manifest["proofs"][-1]), flush=True)
assert sha256(SOURCE) == source_hash, "Source changed while authoring."
assert sha256(ROOT / score["source"]["path"]) == score["source"]["sha256"], "Runtime score changed during authoring."
manifest["status"] = "complete"
write_manifest()
print("STORY_COMPLETE=" + str(OUTPUT), flush=True)

# Reopen the deliverable: validate all keyed desktop poses, not only render poses.
bpy.ops.wm.open_mainfile(filepath=str(OUTPUT))
scene = bpy.context.scene
camera = scene.camera
maximum_position_error = maximum_fov_error = maximum_direction_error = 0
for pose in [*score["frames"], *score["proofs"]]:
    scene.frame_set(math.floor(pose["frame"]), subframe=pose["frame"] % 1)
    expected = vec(pose["position"])
    maximum_position_error = max(maximum_position_error, (camera.location - expected).length)
    maximum_fov_error = max(maximum_fov_error, abs(math.degrees(2 * math.atan(12 / camera.data.lens)) - pose["fov"]))
    maximum_direction_error = max(maximum_direction_error, (camera.rotation_quaternion @ Vector((0, 0, -1))).angle((vec(pose["target"]) - expected).normalized()))
    assert all(obj.hide_render == pose["cutaway"] for obj in bpy.data.collections["OVERHEAD"].objects)
assert maximum_position_error < .0001 and maximum_fov_error < .001 and maximum_direction_error < .001
manifest["savedFileValidation"] = {
    "sampleCount": len(score["frames"]), "additionalExactProofPoses": len(score["proofs"]),
    "maximumPositionErrorMetres": maximum_position_error,
    "maximumVerticalFovErrorDegrees": maximum_fov_error,
    "maximumDirectionErrorRadians": maximum_direction_error,
    "allOverheadVisibilitySamplesMatch": True,
    "currentCameraCodeSha256": sha256(ROOT / score["source"]["path"]),
}
assert manifest["savedFileValidation"]["currentCameraCodeSha256"] == score["source"]["sha256"]
write_manifest()

if CAMERA_ONLY:
    print("STORY_CAMERA_ONLY_COMPLETE", flush=True)
    sys.exit(0)

# Companion studies retain the library's metric UV planes and generated albedos.
# Independent grayscale relief mirrors createSurfaceDetailMaps, never color height.
library_source = OUT.parent / "material-library.blend"
library_hash = sha256(library_source)
surface_source = ROOT / "src/features/gallery/GalleryScene.tsx"
surface_hash = sha256(surface_source)
bpy.ops.wm.open_mainfile(filepath=str(library_source))
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.context.scene
studies = [
    {"material": "honed-concrete", "kind": "concrete", "tileMetres": 3, "bumpDistanceMetres": .0015, "baseRoughness": .6},
    {"material": "honed-limestone", "kind": "travertine-floor", "tileMetres": 3, "bumpDistanceMetres": .0015, "baseRoughness": .6},
    {"material": "natural-oak", "kind": "oak", "tileMetres": 2.4, "bumpDistanceMetres": .0012, "baseRoughness": .5},
]


def independent_maps(kind):
    """256-square runtime detail formula, including JS float seed/byte rounding."""
    seed_value = 97.0
    for letter in kind:
        seed_value = seed_value * 31 + ord(letter)
    seed = int(seed_value) & 0xFFFFFFFF
    heights, roughness = bytearray(), bytearray()
    wood = kind == "oak"
    stone = kind == "travertine-floor"
    for y in range(256):
        for x in range(256):
            if wood:
                wave = math.sin(x * .59 + math.sin(y * math.pi / 128) * 2.4) * 12
            elif stone:
                wave = math.sin(x * .07) * 5 + math.cos(y * .09) * 5
            else:
                wave = math.sin(x * .032) * 3 + math.cos(y * .041) * 3
            seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF
            grain = (seed / 4294967296 - .5) * (28 if stone else 18 if wood else 14)
            height = round(max(0, min(255, 128 + wave + grain)))
            rough = round(max(24, min(245, (218 if wood else 234 if stone else 228) + grain * .7 - wave * .25)))
            heights.extend((height, height, height, 255))
            roughness.extend((rough, rough, rough, 255))
    return heights, roughness


def packed_data_image(name, pixels):
    image = bpy.data.images.new(name, width=256, height=256, alpha=True, is_data=True)
    image.colorspace_settings.name = "Non-Color"
    # Browser CanvasTexture flips the image rows on upload; Blender UV origin is bottom-left.
    flipped = bytearray().join(pixels[y * 1024:(y + 1) * 1024] for y in reversed(range(256)))
    image.pixels.foreach_set([channel / 255 for channel in flipped])
    image.update()
    image.pack()
    return image


for study in studies:
    material = bpy.data.materials[study["material"]]
    nodes, links = material.node_tree.nodes, material.node_tree.links
    shader = nodes.get("Principled BSDF")
    albedo = next(node for node in nodes if node.type == "TEX_IMAGE" and node.image.colorspace_settings.name == "sRGB")
    for node in list(nodes):
        if node.type in {"BUMP", "TEX_NOISE"}:
            nodes.remove(node)
    uv = nodes.new("ShaderNodeTexCoord")
    uv.location = (-1100, -200)
    links.new(uv.outputs["UV"], albedo.inputs["Vector"])
    mapping = nodes.new("ShaderNodeVectorMath")
    mapping.operation = "SCALE"
    mapping.inputs["Scale"].default_value = 4
    mapping.label = "Independent bump repeats 4× each albedo tile"
    mapping.location = (-870, -250)
    links.new(uv.outputs["UV"], mapping.inputs[0])
    heights, roughness = independent_maps(study["kind"])
    bump_texture = nodes.new("ShaderNodeTexImage")
    bump_texture.image = packed_data_image(study["kind"] + " · independent relief", heights)
    bump_texture.location = (-600, -180)
    bump_texture.extension = "REPEAT"
    bump_texture.interpolation = "Linear"
    links.new(mapping.outputs["Vector"], bump_texture.inputs["Vector"])
    bump = nodes.new("ShaderNodeBump")
    bump.location = (-240, -80)
    bump.inputs["Distance"].default_value = study["bumpDistanceMetres"]
    bump.inputs["Strength"].default_value = 1
    links.new(bump_texture.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], shader.inputs["Normal"])
    rough_texture = nodes.new("ShaderNodeTexImage")
    rough_texture.image = packed_data_image(study["kind"] + " · independent roughness", roughness)
    rough_texture.location = (-600, -520)
    rough_texture.extension = "REPEAT"
    rough_texture.interpolation = "Linear"
    links.new(uv.outputs["UV"], rough_texture.inputs["Vector"])
    multiply = nodes.new("ShaderNodeMath")
    multiply.operation = "MULTIPLY"
    multiply.inputs[1].default_value = study["baseRoughness"]
    multiply.label = "Runtime base roughness × independent roughness map"
    multiply.location = (-270, -350)
    links.new(rough_texture.outputs["Color"], multiply.inputs[0])
    links.new(multiply.outputs[0], shader.inputs["Roughness"])
    shader.inputs["Metallic"].default_value = .005
    shader.inputs["Coat Weight"].default_value = .1 if study["kind"] == "oak" else .01
    shader.inputs["Coat Roughness"].default_value = .72
    material["lieuva_bump_repeat_per_albedo"] = 4
    material["lieuva_bump_distance_metres"] = study["bumpDistanceMetres"]
    material["lieuva_base_roughness"] = study["baseRoughness"]
    material["lieuva_detail_kind"] = study["kind"]
    material["lieuva_relief_note"] = "Independent Non-Color detail, never albedo-driven height; oak grain runs along V. Blender Bump is a shading approximation, not identical Three.js pixel output or displaced geometry."
    study.update({"bumpRepeatsPerAlbedo": 4, "roughnessRepeatsPerAlbedo": 1,
                  "heightRgbaSha256": hashlib.sha256(heights).hexdigest(),
                  "roughnessRgbaSha256": hashlib.sha256(roughness).hexdigest(),
                  "grainDirection": "V (vertical in albedo)" if study["kind"] == "oak" else "mineral"})

data = bpy.data.cameras.new("Material closeup · metric relief QA")
camera = bpy.data.objects.new(data.name, data)
scene.collection.objects.link(camera)
camera.location = (0, -1, 1.4)
camera.rotation_euler = Vector((0, 1, -1.4)).to_track_quat("-Z", "Y").to_euler()
data.sensor_fit = "VERTICAL"
data.sensor_height = 24
data.lens = 60
scene.camera = camera
lamp_data = bpy.data.lights.new("Material QA · soft grazing light", "AREA")
lamp_data.energy = 250
lamp_data.shape = "DISK"
lamp_data.size = 1.8
lamp = bpy.data.objects.new(lamp_data.name, lamp_data)
scene.collection.objects.link(lamp)
lamp.location = (-2, -2, 1.4)
lamp.rotation_euler = (-lamp.location).to_track_quat("-Z", "Y").to_euler()
world = bpy.data.worlds.new("Material QA · neutral sky")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (.7, .7, .7, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = .18
scene.world = world
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = 16
scene.cycles.use_denoising = True
scene.render.threads_mode = "FIXED"
scene.render.threads = 2
scene.render.use_persistent_data = True
scene.render.resolution_x = 960
scene.render.resolution_y = 540
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_depth = "16"
scene.view_settings.view_transform = "AgX"
scene["lieuva_material_qa_note"] = "Frames 1 concrete, 2 limestone, 3 oak: original metric planes and generated albedos, independent 4× micro-bump. Blender shading approximation; not a scan or runtime capture."
scene["lieuva_material_runtime_source_sha256"] = surface_hash
scene.frame_start = 1
scene.frame_end = 3
planes = [obj for obj in scene.objects if obj.type == "MESH"]
for frame, study in enumerate(studies, 1):
    plane = next(obj for obj in planes if obj.name.startswith(study["material"]))
    camera.location = plane.location + Vector((0, -1, 1.4))
    lamp.location = plane.location + Vector((-2, -2, 1.4))
    camera.keyframe_insert(data_path="location", frame=frame)
    lamp.keyframe_insert(data_path="location", frame=frame)
    for obj in planes:
        obj.hide_render = obj.hide_viewport = obj != plane
        obj.keyframe_insert(data_path="hide_render", frame=frame)
        obj.keyframe_insert(data_path="hide_viewport", frame=frame)
    scene.timeline_markers.new(study["material"], frame=frame)
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for key in curve.keyframe_points:
                        key.interpolation = "CONSTANT"
scene.frame_set(1)
closeup_blend = OUT / "material-library-closeup.blend"
bpy.ops.wm.save_as_mainfile(filepath=str(closeup_blend), compress=True)
material_manifest = {
    "status": "rendering", "source": str(library_source.relative_to(ROOT)),
    "sourceSha256": library_hash, "blend": closeup_blend.name,
    "blendSha256": sha256(closeup_blend), "pixels": [960, 540],
    "runtimeCodeSource": str(surface_source.relative_to(ROOT)), "runtimeCodeSourceSha256": surface_hash,
    "samples": 16, "device": "CPU", "threads": 2,
    "note": "Same independent detail formula and metric intent; Blender and Three.js bump/shading are not pixel-identical. Original albedo tint retained for source inspection. No geometry displacement.",
    "proofs": [],
}


def write_material_manifest():
    (OUT / "material-closeup-manifest.json").write_text(json.dumps(material_manifest, indent=2) + "\n")


write_material_manifest()
for frame, study in enumerate(studies, 1):
    scene.frame_set(frame)
    closeup_image = OUT / (study["material"] + "-closeup.png")
    scene.render.filepath = str(closeup_image)
    started = time.monotonic()
    bpy.ops.render.render(write_still=True)
    material_manifest["proofs"].append({**study, "frame": frame, "image": closeup_image.name,
        "imageSha256": sha256(closeup_image), "seconds": round(time.monotonic() - started, 2)})
    write_material_manifest()
    print("MATERIAL_PROOF=" + json.dumps(material_manifest["proofs"][-1]), flush=True)
assert sha256(library_source) == library_hash
assert sha256(SOURCE) == source_hash
assert sha256(ROOT / score["source"]["path"]) == score["source"]["sha256"], "Runtime score changed; refresh the final source validation."
bpy.ops.wm.open_mainfile(filepath=str(closeup_blend))
scene = bpy.context.scene
saved_studies = []
for frame, study in enumerate(studies, 1):
    scene.frame_set(frame)
    visible = [obj for obj in scene.objects if obj.type == "MESH" and not obj.hide_render]
    assert len(visible) == 1 and visible[0].name.startswith(study["material"])
    assert abs(max(visible[0].dimensions) - study["tileMetres"]) < .00001
    material = visible[0].data.materials[0]
    nodes = material.node_tree.nodes
    shader = nodes.get("Principled BSDF")
    bump = shader.inputs["Normal"].links[0].from_node
    assert bump.type == "BUMP" and abs(bump.inputs["Distance"].default_value - study["bumpDistanceMetres"]) < 1e-8
    bump_texture = bump.inputs["Height"].links[0].from_node
    assert bump_texture.type == "TEX_IMAGE" and bump_texture.image.colorspace_settings.name == "Non-Color" and bump_texture.image.packed_file
    mapping = bump_texture.inputs["Vector"].links[0].from_node
    assert mapping.operation == "SCALE" and mapping.inputs["Scale"].default_value == 4
    multiply = shader.inputs["Roughness"].links[0].from_node
    assert multiply.operation == "MULTIPLY" and abs(multiply.inputs[1].default_value - study["baseRoughness"]) < 1e-7
    rough_texture = multiply.inputs[0].links[0].from_node
    assert rough_texture.image.colorspace_settings.name == "Non-Color" and rough_texture.image.packed_file
    assert rough_texture.inputs["Vector"].links[0].from_socket.name == "UV"
    albedo = shader.inputs["Base Color"].links[0].from_node
    assert albedo.image.colorspace_settings.name == "sRGB" and albedo.image.packed_file
    assert albedo.image != bump_texture.image and albedo.image != rough_texture.image
    saved_studies.append({"material": study["material"], "metricPlane": True,
                          "separatePackedBumpAndRoughness": True, "bumpRepeatAndDistanceMatch": True,
                          "roughnessBaseAndRepeatMatch": True, "singleVisibleStudyAtFrame": frame})
material_manifest["savedFileValidation"] = saved_studies
material_manifest["status"] = "complete"
write_material_manifest()
with (OUT / "README.md").open("a") as readme:
    readme.write("\n`material-library-closeup.blend` contains three metric studies on frames 1–3, with matching concrete, limestone and oak closeups. Albedo repeats every 3 / 3 / 2.4 m; independent bump repeats four times as often, with Blender distance parameters 1.5 / 1.5 / 1.2 mm. Oak relief follows the albedo's vertical grain. Roughness uses independent maps at albedo repeat, multiplied by .6 / .6 / .5. These are shading parameters, not measured displacement or a claim of pixel parity with Three.js. Original albedo tint is retained for source inspection. The original library and room source remain unchanged. The grayscale maps are original deterministic procedural project assets, derived from the runtime detail formula; no additional external assets or licenses. See `material-closeup-manifest.json` for maps, provenance and completed proof hashes.\n\nAfter authoring, run the Node 22.23.2 sampler again with `--validate` to verify current camera code/samples, source and output hashes, and byte-exact independent detail maps against the current runtime function. It writes `final-validation.json` and does not replace the camera samples or render images.\n")
print("MATERIAL_PROOFS_COMPLETE=" + str(closeup_blend), flush=True)
