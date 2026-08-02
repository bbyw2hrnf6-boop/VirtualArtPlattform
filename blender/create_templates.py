"""Build AURA's authored Blender template sources and export runtime-ready GLBs.

Run inside Blender 4.2+:
  blender --background --python blender/create_templates.py

The script is deterministic and encodes the node/extras contract documented in
blender/EXPORT_CONTRACT.md. Blender uses Z-up; the glTF exporter converts the
assets to the Y-up coordinate system used by Three.js.
"""

from pathlib import Path
import math
import bpy

ROOT = Path(__file__).resolve().parent
BLEND_DIR = ROOT / "templates"
GLB_DIR = ROOT.parent / "public" / "assets" / "templates"
BLEND_DIR.mkdir(parents=True, exist_ok=True)
GLB_DIR.mkdir(parents=True, exist_ok=True)

TEMPLATES = {
    "white-cube": {
        "size": (16.0, 12.0), "height": 5.3,
        "wall": (0.82, 0.80, 0.75, 1.0), "floor": (0.43, 0.42, 0.39, 1.0),
    },
    "nocturne": {
        "size": (15.5, 11.5), "height": 5.8,
        "wall": (0.055, 0.050, 0.043, 1.0), "floor": (0.035, 0.031, 0.027, 1.0),
    },
    "pavilion": {
        "size": (40.0, 60.0), "height": 5.6,
        "wall": (0.63, 0.57, 0.47, 1.0), "floor": (0.35, 0.31, 0.25, 1.0),
    },
}


def make_material(name, color, roughness=0.72, metallic=0.0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return material


def add_box(name, location, dimensions, material=None, *, role=None, extras=None, collection=None):
    bpy.ops.mesh.primitive_cube_add(location=location)
    item = bpy.context.object
    item.name = name
    item.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        item.data.materials.append(material)
    if role:
        item["aura_role"] = role
    for key, value in (extras or {}).items():
        item[key] = value
    if collection:
        for current in list(item.users_collection):
            current.objects.unlink(item)
        collection.objects.link(item)
    return item


def add_empty(name, location, *, role, extras=None, rotation=(0.0, 0.0, 0.0), collection=None):
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=location, rotation=rotation)
    item = bpy.context.object
    item.name = name
    item["aura_role"] = role
    for key, value in (extras or {}).items():
        item[key] = value
    if collection:
        for current in list(item.users_collection):
            current.objects.unlink(item)
        collection.objects.link(item)
    return item


def add_surface(name, location, dimensions, material, surface_id, zone="main", collection=None):
    return add_box(
        name, location, dimensions, material, role="surface",
        extras={"aura_surface_id": surface_id, "aura_zone": zone}, collection=collection,
    )


def add_collider(name, location, dimensions, collection):
    collider = add_box(
        name, location, dimensions, role="collider",
        extras={"aura_collision": "solid"}, collection=collection,
    )
    collider.display_type = "WIRE"
    collider.hide_render = True
    return collider


def add_wall_with_collider(surface_id, location, dimensions, wall_material, surfaces, colliders, zone="main"):
    add_surface(
        f"SURFACE_{surface_id}", location, dimensions, wall_material,
        surface_id, zone, surfaces,
    )
    add_collider(f"COLLIDER_{surface_id}", location, dimensions, colliders)


def add_area_light(name, location, energy, size, color, lights, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.object.light_add(type="AREA", location=location, rotation=rotation)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.data.color = color
    light["aura_role"] = "light"
    for current in list(light.users_collection):
        current.objects.unlink(light)
    lights.objects.link(light)
    return light


def build_shell(config, materials, collections):
    width, depth = config["size"]
    height = config["height"]
    thickness = 0.22
    surfaces = collections["surfaces"]
    colliders = collections["colliders"]
    add_box(
        "SHELL_Floor", (0, 0, -0.10), (width, depth, 0.20), materials["floor"],
        role="floor", extras={"aura_surface_id": "floor-main", "aura_zone": "main"},
        collection=surfaces,
    )
    add_collider("COLLIDER_Floor", (0, 0, -0.14), (width, depth, 0.20), colliders)
    add_wall_with_collider("north", (0, -depth / 2, height / 2), (width, thickness, height), materials["wall"], surfaces, colliders)
    add_wall_with_collider("west", (-width / 2, 0, height / 2), (thickness, depth, height), materials["wall"], surfaces, colliders)
    add_wall_with_collider("east", (width / 2, 0, height / 2), (thickness, depth, height), materials["wall"], surfaces, colliders)
    # The entrance wall is split so Walk always has a real, authored opening.
    entrance_width = min(3.2, width * 0.25)
    side_width = (width - entrance_width) / 2
    for suffix, x in (("left", -(entrance_width + side_width) / 2), ("right", (entrance_width + side_width) / 2)):
        add_wall_with_collider(
            f"south-{suffix}", (x, depth / 2, height / 2), (side_width, thickness, height),
            materials["wall"], surfaces, colliders,
        )
    add_box("DETAIL_Plinth_North", (0, -depth / 2 + 0.14, 0.07), (width - 0.3, 0.08, 0.14), materials["detail"], role="detail", collection=surfaces)
    add_box("DETAIL_Plinth_West", (-width / 2 + 0.14, 0, 0.07), (0.08, depth - 0.3, 0.14), materials["detail"], role="detail", collection=surfaces)
    add_box("DETAIL_Plinth_East", (width / 2 - 0.14, 0, 0.07), (0.08, depth - 0.3, 0.14), materials["detail"], role="detail", collection=surfaces)


def build_white_cube(config, materials, collections):
    width, depth = config["size"]
    height = config["height"]
    add_box("CEILING_WhiteCube", (0, 0, height + 0.10), (width, depth, 0.20), materials["ceiling"], role="ceiling", collection=collections["shell"])
    track = materials["metal"]
    for x in (-3.8, 0.0, 3.8):
        add_box(f"DETAIL_Track_{x:+.1f}", (x, 0, height - 0.18), (0.06, depth - 1.2, 0.06), track, role="detail", collection=collections["shell"])
        add_area_light(f"LIGHT_WhiteCube_{x:+.1f}", (x, 0, height - 0.32), 550, 2.6, (1.0, 0.94, 0.86), collections["lights"])
    for index, x in enumerate((-4.8, -1.6, 1.6, 4.8), 1):
        add_empty(f"ART_ANCHOR_north_{index:02}", (x, -depth / 2 + 0.16, 1.58), role="art-anchor", extras={"aura_surface_id": "north", "aura_eye_line": 1.58}, collection=collections["anchors"])


def build_nocturne(config, materials, collections):
    width, depth = config["size"]
    height = config["height"]
    add_box("CEILING_Nocturne", (0, 0, height + 0.10), (width, depth, 0.20), materials["ceiling"], role="ceiling", collection=collections["shell"])
    # Two angled wings create a legible focal chamber without blocking Walk.
    for side, x, angle in (("west", -3.7, math.radians(-16)), ("east", 3.7, math.radians(16))):
        wing = add_surface(f"SURFACE_niche-{side}", (x, -1.0, 2.25), (4.2, 0.20, 4.5), materials["wall"], f"niche-{side}", side, collections["surfaces"])
        wing.rotation_euler[2] = angle
        collider = add_collider(f"COLLIDER_niche-{side}", (x, -1.0, 2.25), (4.2, 0.20, 4.5), collections["colliders"])
        collider.rotation_euler[2] = angle
    add_box("OBJECT_Sculpture_Plinth", (0, 0.45, 0.45), (1.35, 1.35, 0.90), materials["detail"], role="decor", collection=collections["shell"])
    add_collider("COLLIDER_Sculpture_Plinth", (0, 0.45, 0.45), (1.35, 1.35, 0.90), collections["colliders"])
    for index, x in enumerate((-4.4, 0.0, 4.4), 1):
        add_area_light(f"LIGHT_Nocturne_{index:02}", (x, -0.6, height - 0.30), 310, 1.7, (1.0, 0.63, 0.36), collections["lights"])
        add_empty(f"ART_ANCHOR_north_{index:02}", (x, -depth / 2 + 0.16, 1.55), role="art-anchor", extras={"aura_surface_id": "north", "aura_eye_line": 1.55}, collection=collections["anchors"])


def build_pavilion(config, materials, collections):
    width, depth = config["size"]
    height = config["height"]
    surfaces = collections["surfaces"]
    colliders = collections["colliders"]
    # Cross walls define five connected zones; generous portals keep the axis open.
    divider_width = 14.0
    for z, zone in ((-10.0, "north-cross"), (10.0, "south-cross")):
        for suffix, x in (("west", -(divider_width + (width - divider_width) / 2) / 2), ("east", (divider_width + (width - divider_width) / 2) / 2)):
            segment_width = (width - divider_width) / 2
            add_wall_with_collider(
                f"{zone}-{suffix}", (x, z, height / 2), (segment_width, 0.24, height),
                materials["wall"], surfaces, colliders, zone,
            )
    add_wall_with_collider("divider-front", (0, -2.8, height / 2), (14.0, 0.28, height), materials["wall"], surfaces, colliders, "central")
    add_wall_with_collider("divider-back", (0, 2.8, height / 2), (14.0, 0.28, height), materials["wall"], surfaces, colliders, "central")
    # Two diffuse skylight coffers remain visible in Arrange and final preview.
    for index, z in enumerate((-14.0, 14.0), 1):
        add_box(f"SKYLIGHT_Frame_{index:02}", (0, z, height + 0.12), (15.0, 9.0, 0.24), materials["metal"], role="skylight-frame", collection=collections["shell"])
        add_box(f"SKYLIGHT_Diffuser_{index:02}", (0, z, height + 0.02), (13.8, 7.8, 0.08), materials["diffuser"], role="skylight", collection=collections["shell"])
        add_area_light(f"LIGHT_Skylight_{index:02}", (0, z, height - 0.12), 2600, 11.0, (0.83, 0.90, 1.0), collections["lights"])
    zones = (("north", (0, -21, 2.2)), ("west", (-12, 0, 2.2)), ("central", (0, 0, 2.2)), ("east", (12, 0, 2.2)), ("south", (0, 21, 2.2)))
    for zone, location in zones:
        add_empty(f"ROOM_{zone}", location, role="room", extras={"aura_zone": zone}, collection=collections["anchors"])


def add_navigation(config, collections):
    width, depth = config["size"]
    add_empty("WALK_START", (0, depth / 2 - 1.5, 1.75), role="walk-start", collection=collections["anchors"])
    add_empty("WALK_LOOK", (0, depth / 2 - 5.5, 1.75), role="walk-look", collection=collections["anchors"])
    for index, (x, y, z) in enumerate(((0, depth * 0.22, 2.0), (0, 0, 2.0), (0, -depth * 0.22, 2.0)), 1):
        add_empty(f"VIEW_main_{index:02}", (x, y, z), role="view", extras={"aura_zone": "main"}, collection=collections["anchors"])
    navmesh = add_box("NAVMESH_Main", (0, 0, 0.025), (width - 0.8, depth - 0.8, 0.05), role="navmesh", collection=collections["navmesh"])
    navmesh.display_type = "WIRE"
    navmesh.hide_render = True


def configure_world(template_id):
    world = bpy.data.worlds.new("AURA_World")
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (0.018, 0.020, 0.018, 1.0)
    background.inputs["Strength"].default_value = 0.18 if template_id == "nocturne" else 0.32
    bpy.context.scene.world = world


def build(template_id, config):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = f"AURA_{template_id}"
    scene["aura_template_id"] = template_id
    scene["aura_schema_version"] = 2
    scene["aura_units"] = "metres"
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    configure_world(template_id)

    collections = {}
    for key, label in (("shell", "AURA_SHELL"), ("surfaces", "AURA_SURFACES"), ("colliders", "AURA_COLLIDERS"), ("navmesh", "AURA_NAVMESH"), ("anchors", "AURA_ANCHORS"), ("lights", "AURA_LIGHTS")):
        collection = bpy.data.collections.new(label)
        scene.collection.children.link(collection)
        collections[key] = collection

    materials = {
        "wall": make_material("AURA_Wall_Default", config["wall"], 0.84),
        "floor": make_material("AURA_Floor_Default", config["floor"], 0.68),
        "ceiling": make_material("AURA_Ceiling_Default", tuple(min(1.0, channel * 1.06) for channel in config["wall"][:3]) + (1.0,), 0.88),
        "detail": make_material("AURA_Mineral_Detail", tuple(channel * 0.82 for channel in config["wall"][:3]) + (1.0,), 0.78),
        "metal": make_material("AURA_Blackened_Metal", (0.035, 0.038, 0.034, 1.0), 0.36, 0.18),
        "diffuser": make_material("AURA_Skylight_Diffuser", (0.72, 0.79, 0.84, 1.0), 0.42),
    }

    build_shell(config, materials, collections)
    if template_id == "white-cube":
        build_white_cube(config, materials, collections)
    elif template_id == "nocturne":
        build_nocturne(config, materials, collections)
    else:
        build_pavilion(config, materials, collections)
    add_navigation(config, collections)

    blend_path = BLEND_DIR / f"{template_id}.blend"
    glb_path = GLB_DIR / f"{template_id}.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=True)
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path), export_format="GLB", export_extras=True,
        export_lights=True, export_cameras=True, export_animations=True,
        export_apply=True, export_yup=True,
    )
    print(f"AURA exported {template_id}: {blend_path} -> {glb_path}")


for identifier, template_config in TEMPLATES.items():
    build(identifier, template_config)

print(f"Created {len(TEMPLATES)} authored AURA templates.")
