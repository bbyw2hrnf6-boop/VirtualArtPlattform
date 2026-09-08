"""Bake geometry-only ambient occlusion into an independent glTF UV channel.

No artwork or movable furniture enters these bakes. Base color and lighting
remain editable. This is ambient occlusion, not a baked Cycles beauty image.
"""
import bpy
import re
from pathlib import Path

def prepare_runtime_charcoal(material, directory: Path):
    """Keep the project's plaster variation in the export's direct PBR input."""
    import numpy as np
    directory.mkdir(parents=True, exist_ok=True)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    source = next(node.image for node in nodes if node.type == 'TEX_IMAGE')
    pixels = np.empty(len(source.pixels), dtype=np.float32)
    source.pixels.foreach_get(pixels)
    pixels = pixels.reshape((-1, 4))
    pixels[:, :3] *= np.array([0.26, 0.23, 0.20], dtype=np.float32)
    image = bpy.data.images.new('Warm charcoal runtime albedo', width=source.size[0], height=source.size[1], alpha=False)
    image.colorspace_settings.name = 'sRGB'
    image.pixels.foreach_set(pixels.ravel())
    image.filepath_raw = str(directory / 'nocturne-charcoal-albedo.png')
    image.file_format = 'PNG'
    image.save()
    image.pack()
    texture = nodes.new('ShaderNodeTexImage')
    texture.image = image
    links.new(texture.outputs['Color'], nodes.get('Principled BSDF').inputs['Base Color'])

def bake_runtime_occlusion(scene, collections, directory: Path, room: str):
    directory.mkdir(parents=True, exist_ok=True)
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 16
    scene.render.bake.margin = 5
    scene.render.bake.use_clear = True
    scene.render.bake.use_selected_to_active = False
    group = bpy.data.node_groups.get('glTF Material Output')
    if group is None:
        group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        group.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    targets = []
    for collection in ['SHELL', 'ARCHITECTURE']:
        for obj in collections[collection].objects:
            if obj.type == 'MESH' and obj.data.materials:
                targets.append(obj)
    for obj in targets:
        # The first UV remains metric/repeating for editable materials.
        # AO uses a separate, non-overlapping atlas.
        for mod in list(obj.modifiers):
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        uv = obj.data.uv_layers.new(name='ArchitectureAO')
        obj.data.uv_layers.active = uv
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=.015)
        bpy.ops.object.mode_set(mode='OBJECT')
        name = room + '-' + re.sub(r'[^a-z0-9]+', '-', obj.name.lower()).strip('-')
        image = bpy.data.images.new(name + '-ao', width=1024, height=1024, alpha=False)
        image.colorspace_settings.name = 'Non-Color'
        mat = obj.data.materials[0].copy()
        mat.name = obj.data.materials[0].name + ' / ' + obj.name
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        # Explicitly bind existing image textures to the original metric UVs.
        base_uv = nodes.new('ShaderNodeUVMap')
        base_uv.uv_map = obj.data.uv_layers[0].name
        for node in list(nodes):
            if node.type == 'TEX_IMAGE' and not node.inputs['Vector'].is_linked:
                links.new(base_uv.outputs['UV'], node.inputs['Vector'])
        ao = nodes.new('ShaderNodeTexImage')
        ao.image = image
        nodes.active = ao
        # Unbounded AO turns a closed interior almost black. Bake a short-range
        # contact term explicitly, independent of the beauty illumination.
        contact = nodes.new('ShaderNodeAmbientOcclusion')
        contact.inputs['Distance'].default_value = 0.85
        contact.samples = 32
        emission = nodes.new('ShaderNodeEmission')
        links.new(contact.outputs['Color'], emission.inputs['Color'])
        surface = next(node for node in nodes if node.type == 'OUTPUT_MATERIAL')
        original_shader = surface.inputs['Surface'].links[0].from_socket
        links.new(emission.outputs[0], surface.inputs['Surface'])
        print('BAKE_AO_BEGIN', name, flush=True)
        bpy.ops.object.bake(type='EMIT')
        links.new(original_shader, surface.inputs['Surface'])
        nodes.remove(emission)
        nodes.remove(contact)
        image.filepath_raw = str(directory / (name + '-ao.png'))
        image.file_format = 'PNG'
        image.save()
        image.pack()
        ao_uv = nodes.new('ShaderNodeUVMap')
        ao_uv.uv_map = 'ArchitectureAO'
        links.new(ao_uv.outputs['UV'], ao.inputs['Vector'])
        output = nodes.new('ShaderNodeGroup')
        output.node_tree = group
        links.new(ao.outputs['Color'], output.inputs['Occlusion'])
        # Export primary UV first; glTF's occlusionTexture selects TEXCOORD_1.
        obj.data.uv_layers.active_index = 0
        obj.data.uv_layers[0].active_render = True
        print('BAKE_AO_COMPLETE', name, flush=True)
