"""Metric scanned surfaces and calibrated daylight, shared by source and delivery.

SurfaceUV survives joining; Lightmap is a separate bake chart. Source texture
coordinates must never depend on the origin of an export-time joined mesh.
"""
import bpy, json, math, hashlib
from pathlib import Path
from mathutils import Vector

H = Path(__file__).resolve().parent


def surface_uv(obj, tile):
    mesh = obj.data
    uv = mesh.uv_layers.get('SurfaceUV') or mesh.uv_layers.new(name='SurfaceUV')
    shift = int(hashlib.sha256(obj.name.encode()).hexdigest()[:6], 16) / 0xffffff
    wood = any(m.name.startswith('M03') for m in mesh.materials)
    for face in mesh.polygons:
        axis = max(range(3), key=lambda i: abs(face.normal[i]))
        for index in face.loop_indices:
            co = obj.matrix_world @ mesh.vertices[mesh.loops[index].vertex_index].co
            # Vertical veneer follows height; ceiling/floor grain follows the
            # long board direction. Independent offsets avoid repeated knots.
            if axis == 2:
                u, v = co.x, co.y
            elif axis == 1:
                u, v = co.x, co.z
            else:
                u, v = co.y, co.z
            uv.data[index].uv = (u / tile + (shift if wood else 0), v / tile + (shift * 3 if wood else 0))


def apply():
    s = bpy.context.scene
    bpy.context.view_layer.update()
    manifest = json.loads((H / 'materials/sources.json').read_text())
    maps = {(f['asset'], f['channel']): f['path'] for f in manifest['files']}
    living_ground = bpy.data.materials['Forest soil and humus'].copy()
    living_ground.name = 'Living woodland floor'
    for obj in s.objects:
        if obj.type == 'MESH' and obj.name.startswith(('Excavated woodland', 'Woodland horizon')):
            obj.data.materials.clear(); obj.data.materials.append(living_ground)
    specs = [
        ('M01', 'rock_08', 1.5, 0.85, .018),
        ('M03', 'oak_veneer_01', 1.83, .48, .0012),
        ('Forest soil', 'forest_ground_04', 3.15, 1.0, .055),
        ('Living woodland', 'leafy_grass', 2.0, .85, .025),
        ('Beech silver', 'bark_brown_02', 1.0, .85, .014),
        ('Moss cushions', 'mossy_rock', 3.0, .9, .020),
    ]
    for prefix, asset, tile, strength, relief in specs:
        material = next(m for m in bpy.data.materials if m.name.startswith(prefix))
        tree = material.node_tree
        tree.nodes.clear()
        shader = tree.nodes.new('ShaderNodeBsdfPrincipled')
        output = tree.nodes.new('ShaderNodeOutputMaterial')
        tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
        uv = tree.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'SurfaceUV'
        images = {}
        for channel in ['Diffuse', 'nor_gl', 'Rough', 'Displacement']:
            image = bpy.data.images.load(str(H / 'materials' / maps[asset, channel]), check_existing=True)
            image.filepath = '//materials/' + maps[asset, channel]
            image.colorspace_settings.name = 'sRGB' if channel == 'Diffuse' else 'Non-Color'
            tex = tree.nodes.new('ShaderNodeTexImage'); tex.image = image
            tree.links.new(uv.outputs['UV'], tex.inputs['Vector']); images[channel] = tex
        tree.links.new(images['Diffuse'].outputs['Color'], shader.inputs['Base Color'])
        if prefix == 'M03':
            # The brief calls for smoked, restrained oak rather than orange
            # raw veneer. Colour correction affects the authored finish only.
            finish = tree.nodes.new('ShaderNodeHueSaturation')
            finish.inputs['Saturation'].default_value = .65
            finish.inputs['Value'].default_value = .82
            tree.links.new(images['Diffuse'].outputs['Color'], finish.inputs['Color'])
            tree.links.new(finish.outputs['Color'], shader.inputs['Base Color'])
        tree.links.new(images['Rough'].outputs['Color'], shader.inputs['Roughness'])
        normal = tree.nodes.new('ShaderNodeNormalMap'); normal.uv_map = 'SurfaceUV'
        normal.inputs['Strength'].default_value = strength
        tree.links.new(images['nor_gl'].outputs['Color'], normal.inputs['Color'])
        bump = tree.nodes.new('ShaderNodeBump')
        bump.inputs['Distance'].default_value = relief; bump.inputs['Strength'].default_value = .35
        tree.links.new(images['Displacement'].outputs['Color'], bump.inputs['Height'])
        tree.links.new(normal.outputs['Normal'], bump.inputs['Normal'])
        tree.links.new(bump.outputs['Normal'], shader.inputs['Normal'])
        material['scanned_asset'] = asset
        material['surface_tile_m'] = tile
        # The runtime uses the source normal map directly for unbaked terrain.
        material['delivery_normal_strength'] = strength
        for obj in s.objects:
            if obj.type == 'MESH' and material in obj.data.materials[:]:
                surface_uv(obj, tile)

    # Anchor the remaining procedural grains in world space so atlas joining
    # cannot silently rescale limestone, plaster or upholstery during baking.
    anchor = bpy.data.objects.new('Material world origin', None)
    bpy.data.collections['00_REFERENCE'].objects.link(anchor)
    for material in bpy.data.materials:
        if not material.use_nodes: continue
        for node in material.node_tree.nodes:
            if node.type == 'TEX_COORD': node.object = anchor
        if material.name.startswith(('M06', 'M07')):
            shader = material.node_tree.nodes.get('Principled BSDF')
            shader.inputs['Sheen Weight'].default_value = .35
            shader.inputs['Sheen Roughness'].default_value = .65
        if material.name.startswith('Beech leaf'):
            shader = material.node_tree.nodes.get('Principled BSDF')
            shader.inputs['Roughness'].default_value = .54
            shader.inputs['Subsurface Weight'].default_value = .08
            shader.inputs['Subsurface Radius'].default_value = (.08, .13, .025)

    sun = bpy.data.objects['Southwest afternoon sun']
    sun.location = (-14, -16, 15)
    sun.rotation_euler = (-sun.location).to_track_quat('-Z', 'Y').to_euler()
    sun.data.energy = 3.0
    sun.data.angle = math.radians(.8)
    sun.data.color = (1, .86, .68)
    sky = next(n for n in s.world.node_tree.nodes if n.type == 'TEX_SKY')
    sky.sun_elevation = math.atan2(15, math.hypot(14, 16))
    sky.sun_rotation = math.atan2(-14, -16)
    s.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .15
    s.view_settings.exposure = .5
    s.cycles.samples = 512
    s.cycles.adaptive_threshold = .004
    s.cycles.max_bounces = 16
    s.cycles.diffuse_bounces = 8
    s.cycles.glossy_bounces = 8
    s.cycles.transmission_bounces = 16
    s.cycles.sample_clamp_indirect = 10
    s['quality_revision'] = 'scanned-surfaces-daylight-v2'
