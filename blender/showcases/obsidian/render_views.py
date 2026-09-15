"""Render consistent inspection cameras and high-resolution beauty masters.
Run against the saved beauty source. --proofs renders all 30 declared cameras.
"""
import argparse
import json
import sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector

HERE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--proofs',action='store_true');parser.add_argument('--camera',default='R1-SW');parser.add_argument('--width',type=int,default=3840);parser.add_argument('--samples',type=int,default=256)
opt=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
layout=json.loads((HERE/'source/layout.json').read_text());scene=bpy.context.scene
out=HERE/'proofs' if opt.proofs else HERE/'masters';out.mkdir(exist_ok=True)
scene.cycles.samples=24 if opt.proofs else opt.samples
scene.cycles.adaptive_threshold=.015 if opt.proofs else .004
scene.render.image_settings.color_depth='8' if opt.proofs else '16'
report=[]
for spec in layout['cameras']:
    if not opt.proofs and spec['id']!=opt.camera:continue
    cam=bpy.data.objects[spec['id']];scene.camera=cam
    forward=(Vector(spec['target_m'])-Vector(spec['position_m'])).normalized()
    right=forward.cross(Vector(spec['world_up_xyz'])).normalized();up=right.cross(forward)
    cam.rotation_euler=Matrix((right,up,-forward)).transposed().to_euler()
    if cam.data.type=='ORTHO':cam.data.ortho_scale=spec['blender_orthographic_scale_m']
    a,b=map(float,spec['render_aspect_ratio'].split(':'))
    width=720 if opt.proofs else opt.width
    scene.render.resolution_x=width;scene.render.resolution_y=round(width*b/a)
    hidden=[]
    if spec['projection']=='orthographic':
        # The inspection view is an isolated layer of the same scene: remove
        # foreground faces that lie between this camera and its target wall.
        for obj in scene.objects:
            if obj.type!='MESH':continue
            p=obj.matrix_world.translation
            is_ceiling='ceiling' in obj.name.lower()
            if (spec['id'].endswith('FLOOR') and (is_ceiling or 'track' in obj.name.lower() or obj.get('obsidian_group')=='furniture')) or (spec['id'].endswith('CEILING') and obj.get('obsidian_group')=='furniture'):
                if not obj.hide_render:obj.hide_render=True;hidden.append(obj)
    scene.render.filepath=str(out/f'{spec["id"]}.png')
    bpy.ops.render.render(write_still=True)
    for obj in hidden:obj.hide_render=False
    report.append({'camera':spec['id'],'width':width,'height':scene.render.resolution_y,'samples':scene.cycles.samples})
(out/f'manifest-{ "proofs" if opt.proofs else opt.camera}.json').write_text(json.dumps(report,indent=2)+'\n')
