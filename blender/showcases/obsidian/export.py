"""Bake Cycles diffuse transport, retain view-dependent browser reflections.
Load obsidian.blend before running. The editable source is never modified.
"""
import bpy
import json
import sys
import time
from pathlib import Path

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
OUT=ROOT/'public/assets/showcases/obsidian'
MAPS=HERE/'lightmaps/raw'
MAPS.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
scene.cycles.samples=48
scene.cycles.use_adaptive_sampling=False
scene.render.bake.use_pass_direct=True
scene.render.bake.use_pass_indirect=True
scene.render.bake.use_pass_color=True
scene.render.bake.margin=12
scene.render.bake.use_clear=True
scene.render.image_settings.color_depth='8'
scene.render.image_settings.file_format='PNG'
bpy.context.preferences.filepaths.save_version=0
report=[]
pending=[]

def select(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:o.select_set(True)
    bpy.context.view_layer.objects.active=objs[0]

# Apply physically modelled bevels before packing atlas UVs.
for o in list(scene.objects):
    if o.type!='MESH':continue
    select([o])
    for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)

for room in ['R1','R2','R3']:
    for group,size in [('architecture',2048),('floor',4096),('furniture',1024)]:
        objects=[o for o in scene.objects if o.type=='MESH' and o.get('obsidian_room')==room and o.get('obsidian_group')==group and not any('diffuser' in m.name or 'lens' in m.name for m in o.data.materials)]
        select(objects);bpy.ops.object.join();o=bpy.context.object;o.name=f'{room}_{group}_baked'
        if not o.data.uv_layers:o.data.uv_layers.new(name='Lightmap')
        bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.006);bpy.ops.object.mode_set(mode='OBJECT')
        image=bpy.data.images.new(o.name,width=size,height=size,alpha=False,float_buffer=True)
        image.colorspace_settings.name='sRGB'
        for slot in o.material_slots:
            # Make per-atlas materials to avoid changing another mesh's bake target.
            slot.material=slot.material.copy();m=slot.material
            for n in m.node_tree.nodes:n.select=False
            t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=image;t.select=True;m.node_tree.nodes.active=t
        print(f'BAKING {o.name} {size}',flush=True);start=time.time()
        raw = MAPS/f'{o.name}.png'
        if '--reuse-architecture' in sys.argv and group != 'floor' and raw.exists():
            # Identical mesh join/UV packing; reuse unchanged transport only.
            image.filepath = str(raw); image.source = 'FILE'; image.reload()
        else:
            scene.cycles.samples = 64 if group == 'floor' else 48
            bpy.ops.object.bake(type='DIFFUSE')
        if not ('--reuse-architecture' in sys.argv and group != 'floor' and raw.exists()):
            image.filepath_raw=str(raw);image.file_format='PNG';image.save()
        pending.append((o,image))
        report.append({'mesh':o.name,'size':size,'samples':64 if group=='floor' else 48,'reused':'--reuse-architecture' in sys.argv and group!='floor' and raw.exists(),'seconds':round(time.time()-start,2)})
        print(f'BAKED {o.name} {report[-1]["seconds"]}s',flush=True)

# Only replace shaders after every transport bake; emissive replacements would
# otherwise contaminate later rooms' indirect lighting.
for o,image in pending:
    m=bpy.data.materials.new(o.name);m.use_nodes=True;m.node_tree.nodes.clear()
    t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=image
    e=m.node_tree.nodes.new('ShaderNodeEmission');e.inputs['Strength'].default_value=1
    output=m.node_tree.nodes.new('ShaderNodeOutputMaterial')
    m.node_tree.links.new(t.outputs['Color'],e.inputs['Color']);m.node_tree.links.new(e.outputs[0],output.inputs['Surface'])
    o.data.materials.clear();o.data.materials.append(m)
    for p in o.data.polygons:p.material_index=0
    o['baked_diffuse']=True

# Full-resolution art stays independent and can be inspected outside WebGL.
for o in list(scene.objects):
    if o.get('artwork_id'):
        m=o.active_material
        t=next(n for n in m.node_tree.nodes if n.type=='TEX_IMAGE')
        out=m.node_tree.nodes.get('Material Output')
        e=m.node_tree.nodes.new('ShaderNodeEmission');e.inputs['Strength'].default_value=.72
        m.node_tree.links.new(t.outputs['Color'],e.inputs['Color']);m.node_tree.links.new(e.outputs[0],out.inputs['Surface'])

select([o for o in scene.objects if o.type=='MESH'])
for o in bpy.context.selected_objects:
    if o.get('obsidian_group')=='floor':o['reflective_floor']=True
bpy.ops.file.make_paths_relative()
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'obsidian-runtime.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'obsidian-desktop.glb'),export_format='GLB',use_selection=True,export_extras=True,export_image_format='JPEG',export_jpeg_quality=94,export_cameras=False,export_lights=False)
for image in bpy.data.images:
    cap = 2048 if '_floor_baked' in image.name else 1024
    if image.size[0]>cap or image.size[1]>cap:
        ratio=cap/max(image.size);image.scale(round(image.size[0]*ratio),round(image.size[1]*ratio))
bpy.ops.export_scene.gltf(filepath=str(OUT/'obsidian-mobile.glb'),export_format='GLB',use_selection=True,export_extras=True,export_image_format='JPEG',export_jpeg_quality=88,export_cameras=False,export_lights=False)
(HERE/'bake-report.json').write_text(json.dumps(report,indent=2)+'\n')
