"""Generate the three editable Blender source blueprints used by AURA's web editor."""
from pathlib import Path
import bpy
import math

ROOT = Path(__file__).resolve().parent / "templates"
ROOT.mkdir(parents=True, exist_ok=True)

TEMPLATES = {
    "white-cube": {"size": (11, 8), "wall": (0.78, 0.76, 0.70, 1), "floor": (0.19, 0.18, 0.16, 1)},
    "nocturne": {"size": (10, 7), "wall": (0.045, 0.05, 0.045, 1), "floor": (0.018, 0.02, 0.018, 1)},
    "pavilion": {"size": (13, 9), "wall": (0.55, 0.49, 0.40, 1), "floor": (0.28, 0.23, 0.18, 1)},
}

def material(name, color, roughness=.75, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    return mat

def cube(name, location, scale, mat):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj

def build(template_id, config):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene["aura_template_id"] = template_id
    scene["aura_schema_version"] = 1
    scene.render.engine = "BLENDER_EEVEE"
    w, d = config["size"]
    wall = material("AURA_Wall_Default", config["wall"])
    floor = material("AURA_Floor_Default", config["floor"], .62)
    frame = material("AURA_Frame_Bronze", (.32, .20, .08, 1), .3, .5)
    canvas = material("AURA_Artwork_Placeholder", (.55, .40, .22, 1), .7)

    cube("Floor", (0, 0, -.08), (w/2, d/2, .08), floor)
    cube("Wall_North", (0, -d/2, 2.4), (w/2, .06, 2.4), wall)
    cube("Wall_West", (-w/2, 0, 2.4), (.06, d/2, 2.4), wall)
    cube("Wall_East", (w/2, 0, 2.4), (.06, d/2, 2.4), wall)
    for index, x in enumerate((-2.2, 0, 2.2), 1):
        cube(f"Frame_{index:02}", (x, -d/2 + .10, 2.25), (.72, .05, 1.02), frame)
        art = cube(f"Artwork_Slot_{index:02}", (x, -d/2 + .045, 2.25), (.65, .025, .94), canvas)
        art["aura_artwork_slot"] = index
        art["aura_wall"] = "north"

    if template_id == "nocturne":
        cube("Central_Plinth", (0, .8, .45), (.7, .7, .45), wall)
    if template_id == "pavilion":
        cube("Architectural_Divider", (0, -.5, 1.75), (2.2, .09, 1.75), wall)
        cube("Gallery_Bench", (0, 2.5, .35), (1.2, .4, .35), frame)

    world = bpy.data.worlds.new("AURA_World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (.035, .038, .032, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = .25
    scene.world = world
    for index, x in enumerate((-3, 0, 3), 1):
        bpy.ops.object.light_add(type="AREA", location=(x, -1, 4.25))
        lamp = bpy.context.object
        lamp.name = f"Museum_Light_{index:02}"
        lamp.data.energy = 500 if template_id != "nocturne" else 350
        lamp.data.shape = "DISK"
        lamp.data.size = 1.5
        lamp.rotation_euler = (math.radians(25), 0, 0)

    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 1.68, d/2 - 1.2))
    bpy.context.object.name = "Walk_Start"
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 2.3, -d/2 + .3))
    bpy.context.object.name = "Walk_LookTarget"
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / f"{template_id}.blend"), compress=True)

for template_id, config in TEMPLATES.items():
    build(template_id, config)

print(f"Created {len(TEMPLATES)} AURA templates in {ROOT}")
