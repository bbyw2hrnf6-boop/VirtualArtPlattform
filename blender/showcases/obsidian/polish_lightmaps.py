"""Denoise diffuse atlases with Blender's compositor, then export delivery GLBs.

Run against obsidian-runtime.blend after export.py. Source art is never filtered.
Raw transport bakes remain in lightmaps/raw for repeatable comparisons.
"""
import json
from pathlib import Path
import bpy

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[2] / 'public/assets/showcases/obsidian'
source_scene = bpy.context.scene
polish = bpy.data.scenes.new('Atlas denoising')
polish.render.engine = 'CYCLES'
polish.cycles.samples = 1
polish.render.threads_mode = 'FIXED'
polish.render.threads = 4
polish.render.film_transparent = True
polish.render.image_settings.file_format = 'PNG'
polish.render.image_settings.color_depth = '8'
polish.render.image_settings.color_mode = 'RGB'
polish.view_settings.view_transform = 'Standard'
polish.view_settings.look = 'None'
camera = bpy.data.objects.new('Denoise camera', bpy.data.cameras.new('Denoise camera'))
polish.collection.objects.link(camera)
polish.camera = camera
tree = bpy.data.node_groups.new('Linear atlas denoising', 'CompositorNodeTree')
tree.interface.new_socket(name='Image', in_out='OUTPUT', socket_type='NodeSocketColor')
polish.compositing_node_group = tree
input_node = tree.nodes.new('CompositorNodeImage')
denoise = tree.nodes.new('CompositorNodeDenoise')
output_node = tree.nodes.new('NodeGroupOutput')
tree.links.new(input_node.outputs['Image'], denoise.inputs['Image'])
tree.links.new(denoise.outputs['Image'], output_node.inputs['Image'])

report = []
for raw in sorted((HERE / 'lightmaps/raw').glob('*.png')):
    image = bpy.data.images.load(str(raw), check_existing=False)
    input_node.image = image
    polish.render.resolution_x, polish.render.resolution_y = image.size
    polish.render.resolution_percentage = 100
    final = HERE / 'lightmaps' / raw.name
    polish.render.filepath = str(final)
    bpy.ops.render.render(scene=polish.name, write_still=True)
    for material in bpy.data.materials:
        if not material.use_nodes:
            continue
        for node in material.node_tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image and node.image.name == raw.stem:
                node.image.filepath = str(final)
                node.image.reload()
    report.append(raw.name)
    bpy.data.images.remove(image)
    print('DENOISED ' + raw.name, flush=True)

bpy.data.scenes.remove(polish)
bpy.data.node_groups.remove(tree)
bpy.ops.object.select_all(action='DESELECT')
for obj in source_scene.objects:
    if obj.type == 'MESH': obj.select_set(True)
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.file.make_paths_relative()
bpy.ops.wm.save_as_mainfile(filepath=str(HERE / 'obsidian-runtime.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'obsidian-desktop.glb'), export_format='GLB', use_selection=True, export_extras=True, export_image_format='JPEG', export_jpeg_quality=94, export_cameras=False, export_lights=False)
for image in bpy.data.images:
    if image.size[0] > 1024 or image.size[1] > 1024:
        ratio = 1024 / max(image.size)
        image.scale(round(image.size[0]*ratio), round(image.size[1]*ratio))
bpy.ops.export_scene.gltf(filepath=str(OUT/'obsidian-mobile.glb'), export_format='GLB', use_selection=True, export_extras=True, export_image_format='JPEG', export_jpeg_quality=88, export_cameras=False, export_lights=False)
(HERE / 'lightmaps/denoise-report.json').write_text(json.dumps({'algorithm': 'Blender compositor OpenImageDenoise', 'atlases': report}, indent=2) + '\n')
