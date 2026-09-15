"""OBSIDIAN: metric, closed three-room Cycles source. No Studio assets changed.
Blender -b --python blender/showcases/obsidian/build.py -- --width 1200 --samples 64
"""
import argparse
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
SOURCE = HERE / 'source'
OUT = ROOT / 'artifacts/obsidian'
args = argparse.ArgumentParser()
args.add_argument('--width', type=int, default=1200)
args.add_argument('--samples', type=int, default=64)
args.add_argument('--camera', default='R1-SW')
args.add_argument('--round', default='r1')
args.add_argument('--no-render', action='store_true')
opt = args.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
layout = json.loads((SOURCE/'layout.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = opt.samples
scene.cycles.use_denoising = True
scene.cycles.adaptive_threshold = .008
scene.cycles.max_bounces = 12
scene.cycles.diffuse_bounces = 6
scene.cycles.glossy_bounces = 6
scene.cycles.use_light_tree = True
scene.render.threads_mode = 'FIXED'
scene.render.threads = 6
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_depth = '16'
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = 0
scene.world = bpy.data.worlds.new('Closed interior · no daylight')
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0
scene['lieuva_showcase'] = 'obsidian'
scene['units'] = 'metres'
scene['source_layout_version'] = layout['version']

def material(name, color, rough=.5, metal=0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    return m

def node(m, kind, **values):
    n=m.node_tree.nodes.new(kind)
    for k,v in values.items(): n.inputs[k].default_value=v
    return n

def link(m,a,out,b,inp): m.node_tree.links.new(a.outputs[out],b.inputs[inp])

def noise_surface(m, scale, strength, distance):
    n=node(m,'ShaderNodeTexNoise',Scale=scale,Detail=3,Roughness=.7)
    pos=node(m,'ShaderNodeNewGeometry');link(m,pos,'Position',n,'Vector')
    b=node(m,'ShaderNodeBump',Strength=strength,Distance=distance)
    link(m,n,'Fac',b,'Height');link(m,b,'Normal',m.node_tree.nodes['Principled BSDF'],'Normal')
    return n

plaster=material('Anthracite · mineral plaster',(.046,.044,.040),.84)
noise_surface(plaster,185,.24,.0025)
ceiling=material('Charcoal · closed ceiling',(.025,.022,.018),.89)
noise_surface(ceiling,120,.15,.001)
bronze=material('Brushed dark bronze',(.25,.135,.049),.31,.78)
black=material('Blackened museum hardware',(.009,.010,.010),.37,.55)
leather=material('Taupe leather · fine grain',(.070,.055,.043),.48)
noise_surface(leather,220,.22,.001)
walnut=material('Quarter cut walnut · vertical grain',(.095,.038,.013),.4)
tex=node(walnut,'ShaderNodeTexCoord'); mapping=node(walnut,'ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(5,5,.24)
link(walnut,tex,'Object',mapping,0)
n=node(walnut,'ShaderNodeTexNoise',Scale=3,Detail=4,Roughness=.72);link(walnut,mapping,0,n,'Vector')
r=node(walnut,'ShaderNodeValToRGB');r.color_ramp.elements[0].position=.2;r.color_ramp.elements[0].color=(.016,.006,.002,1);r.color_ramp.elements[1].position=.8;r.color_ramp.elements[1].color=(.075,.031,.012,1)
link(walnut,n,'Fac',r,'Fac');link(walnut,r,'Color',walnut.node_tree.nodes['Principled BSDF'],'Base Color')
b=node(walnut,'ShaderNodeBump',Strength=.12,Distance=.002);link(walnut,n,'Fac',b,'Height');link(walnut,b,'Normal',walnut.node_tree.nodes['Principled BSDF'],'Normal')
stone=material('Honed black limestone · 1 metre',(.021,.023,.022),.34)
tc=node(stone,'ShaderNodeNewGeometry')
no=node(stone,'ShaderNodeTexNoise',Scale=2.2,Detail=3,Roughness=.65);link(stone,tc,'Position',no,'Vector')
amp=node(stone,'ShaderNodeVectorMath');amp.operation='SCALE';amp.inputs[3].default_value=.35;link(stone,no,'Color',amp,0)
mix=node(stone,'ShaderNodeVectorMath');mix.operation='ADD';link(stone,tc,'Position',mix,0);link(stone,amp,0,mix,1)
v=node(stone,'ShaderNodeTexVoronoi',Scale=.9);v.feature='DISTANCE_TO_EDGE';link(stone,mix,0,v,'Vector')
r=node(stone,'ShaderNodeValToRGB');r.color_ramp.elements[0].position=.001;r.color_ramp.elements[0].color=(.10,.092,.075,1);r.color_ramp.elements[1].position=.009;r.color_ramp.elements[1].color=(.016,.018,.017,1)
link(stone,v,'Distance',r,'Fac');link(stone,r,'Color',stone.node_tree.nodes['Principled BSDF'],'Base Color')
noise_surface(stone,170,.12,.001)
grout=material('Recessed two millimetre stone joints',(.012,.013,.012),.85)
glow=material('2700K cove diffuser',(.65,.37,.14),.5)
ps=glow.node_tree.nodes['Principled BSDF'];ps.inputs['Emission Color'].default_value=(1,.53,.23,1);ps.inputs['Emission Strength'].default_value=3
lamp=material('3000K spotlight lens',(.7,.55,.3),.2)
ps=lamp.node_tree.nodes['Principled BSDF'];ps.inputs['Emission Color'].default_value=(1,.65,.37,1);ps.inputs['Emission Strength'].default_value=4

room='R1'; group='architecture'
def tag(o):
    o['obsidian_room']=room; o['obsidian_group']=group
    return o
def box(name,loc,size,mat,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    o=bpy.context.object;o.name=name;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(mat)
    if bevel:
        mod=o.modifiers.new('Real edge radius','BEVEL');mod.width=bevel;mod.segments=3
        o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    return tag(o)

def plane(name,center,width,height,normal,mat):
    n=Vector(normal);right=Vector((0,0,1)).cross(n);up=Vector((0,0,1));c=Vector(center)
    vs=[c-right*width/2-up*height/2,c+right*width/2-up*height/2,c+right*width/2+up*height/2,c-right*width/2+up*height/2]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(vs,[],[(0,1,2,3)]);mesh.update()
    o=bpy.data.objects.new(name,mesh);scene.collection.objects.link(o);mesh.materials.append(mat)
    uv=mesh.uv_layers.new(name='UVMap')
    for l,co in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]):l.uv=co
    return tag(o)

def cylinder(name,loc,radius,depth,mat,direction=(0,0,1)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=radius,depth=depth,location=loc)
    o=bpy.context.object;o.name=name;o.rotation_euler=Vector(direction).to_track_quat('Z','Y').to_euler();o.data.materials.append(mat)
    mod=o.modifiers.new('Machined edges','BEVEL');mod.width=.003;mod.segments=2
    o.modifiers.new('Normals','WEIGHTED_NORMAL');return tag(o)

def light(name,pos,target,power,color,size=.2,kind='AREA',size_y=None):
    d=bpy.data.lights.new(name,kind);d.energy=power;d.color=color
    if kind=='AREA':
        d.shape='RECTANGLE' if size_y else 'DISK';d.size=size
        if size_y:d.size_y=size_y
    else:d.spot_size=math.radians(70);d.spot_blend=.65;d.shadow_soft_size=.075
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector(target)-Vector(pos)).to_track_quat('-Z','Y').to_euler();return o

for rm in layout['rooms']:
    room=rm['id'];x0,y0,x1,y1=rm['bounds_xy_m'];cx=(x0+x1)/2;w=x1-x0
    group='floor'
    box(f'{room} continuous floor substrate',(cx,4,-.14),(w,8,.18),grout)
    for x in range(x0,x1):
        for y in range(8):box(f'{room} limestone {x:02}-{y:02}',(x+.5,y+.5,-.025),(.998,.998,.05),stone,.0007)
    group='architecture'
    box(f'{room} north mineral wall',(cx,8.15,2.25),(w,.3,4.5),plaster,.003)
    box(f'{room} south mineral wall',(cx,-.15,2.25),(w,.3,4.5),plaster,.003)
    box(f'{room} opaque ceiling',(cx,4,4.62),(w,8,.24),ceiling,.003)
    for y in [.012,7.988]:box(f'{room} bronze skirting',(cx,y,.05),(w,.024,.1),bronze,.003)
    # Restrained inward lip conceals the strip; no luminous ceiling panels.
    for y in [.16,7.84]:
        box(f'{room} cove lip',(cx,y,4.33),(w,.18,.12),ceiling,.004)
        box(f'{room} cove diffuser',(cx,y,4.395),(w-.12,.026,.009),glow)
        light(f'{room} 2700K perimeter',(cx,y,4.39),(cx,y,4.5),w*45,(1,.66,.40),w-.2,size_y=.07)
        # Hidden wall wash points down the wall from the same continuous cove.
        light(f'{room} 2700K grazing',(cx,.035 if y<4 else 7.965,4.26),(cx,.035 if y<4 else 7.965,0),w*38,(1,.66,.40),w-.2,size_y=.07)
    for x in [x0+.16,x1-.16]:
        box(f'{room} cove end lip',(x,4,4.33),(.18,7.8,.12),ceiling,.004)
        box(f'{room} cove end diffuser',(x,4,4.395),(.026,7.7,.009),glow)
        light(f'{room} 2700K end cove',(x,4,4.39),(x,4,4.5),330,(1,.66,.40),.07,size_y=7.6)
    for y in [1.3,6.7]:
        box(f'{room} museum track',(cx,y,4.24),(w-1.3,.035,.05),black,.006)
        for x in [x0+1,cx,x1-1]:cylinder('Track suspension',(x,y,4.37),.009,.22,black)
    cylinder(f'{room} recessed downlight',(cx,4,4.485),.05,.016,black)
    light(f'{room} 3000K circulation',(cx,4,4.46),(cx,4,0),150,(1,.77,.52),size=.25)
    group='furniture'
    box(f'{room} walnut bench apron',(cx,4,.275),(3.16,.70,.17),walnut,.013)
    for dx in [-1.27,1.27]:box(f'{room} bench leg',(cx+dx,4,.12),(.17,.67,.24),walnut,.01)
    box(f'{room} bronze seat reveal',(cx,4,.368),(3.16,.71,.016),bronze,.005)
    for j in range(4):
        box(f'{room} stitched leather cushion {j}',(cx-1.2+j*.8,4,.410),(.796,.75,.08),leather,.023)
    group='architecture'

# Shared partitions with a genuine clear 3 x 3.2 metre opening.
for x,rid in [(0,'R1'),(12,'R2'),(22,'R3'),(34,'R3')]:
    room=rid
    if x==34:
        box('R3 east walnut wall',(34.15,4,2.25),(.3,8,4.5),walnut,.003)
        box('East bronze skirting',(33.99,4,.05),(.024,8,.1),bronze,.003)
    else:
        a,b,h=(3,5,2.8) if x==0 else (2.5,5.5,3.2)
        xc=-.15 if x==0 else x
        # At internal partitions wall-reference plane is maintained; thickness .24.
        for lo,hi in [(0,a),(b,8)]:
            box(f'Partition {x} walnut pier',(xc,(lo+hi)/2,2.25),(.24,hi-lo,4.5),walnut,.003)
            for face in [-.122,.122]:box('Interrupted bronze skirting',(xc+face,(lo+hi)/2,.05),(.014,hi-lo,.1),bronze,.003)
        box(f'Partition {x} rectangular lintel',(xc,4,(h+4.5)/2),(.24,b-a,4.5-h),walnut,.003)
        if x==0:
            for y in [3.5,4.5]:box('Closed walnut entry leaf',(-.04,y,1.4),(.08,.994,2.8),walnut,.004)
            for y in [3.91,4.09]:cylinder('Bronze entry pull',(.032,y,1.25),.012,.30,bronze)
        else:
            for yy in [a+.012,b-.012]:box('Walnut portal reveal',(x,yy,h/2),(.3,.024,h),walnut,.002)
            box('Walnut head reveal',(x,4,h-.012),(.3,b-a,.024),walnut,.002)

for art in layout['artworks']:
    room=art['room_id'];group='artwork';aid=art['id'];w,h=art['image_dimensions_wh_m'];c=Vector(art['image_plane_center_xyz_m']);n=Vector(art['front_normal_xyz']);right=Vector((0,0,1)).cross(n)
    m=material(f"{aid} · original image",(.5,.5,.5),.7)
    t=node(m,'ShaderNodeTexImage');t.image=bpy.data.images.load(str(SOURCE/art['texture_path']),check_existing=True)
    link(m,t,'Color',m.node_tree.nodes['Principled BSDF'],'Base Color')
    o=plane(aid,c,w,h,n,m);o['artwork_id']=aid;o['title']=art['title']
    group='architecture'
    for sign in [-1,1]:
        for vertical in [True,False]:
            pos=c+(right*(w/2+.01)*sign if vertical else Vector((0,0,sign*(h/2+.01))))
            dims=(.02,.035,h+.04) if vertical else (w+.04,.035,.02)
            if n.x:dims=(dims[1],dims[0],dims[2])
            box(f'{aid} 20mm bronze frame',pos,dims,bronze,.003)
    # Paper label and fine gallery number, readable in the close view.
    lp=c+right*(w/2+.22);lp.z=1.25
    plane(f'{aid} label',lp,.24,.10,n,material(f'{aid} label ivory',(.42,.35,.23),.8))
    # Neutral-warm high-CRI spot, physically decaying with distance.
    positions=[c+n*1.3+right*dx for dx in ([-.85,.85] if w>3 else [0])]
    for k,sp in enumerate(positions):
        sp.z=4.08;target=c+right*((k-.5)*1.25 if len(positions)>1 else 0)
        direction=(target-sp).normalized()
        cylinder(f'{aid} spotlight housing',sp,.068,.21,black,direction)
        cylinder(f'{aid} spotlight lens',sp+direction*.108,.049,.005,lamp,direction)
        light(f'{aid} 3000K art spot',sp+direction*.13,target,205,(1,.83,.65),kind='SPOT')

for spec in layout['cameras']:
    data=bpy.data.cameras.new(spec['id']);o=bpy.data.objects.new(spec['id'],data);scene.collection.objects.link(o)
    o.location=spec['position_m']
    forward=(Vector(spec['target_m'])-o.location).normalized();right=forward.cross(Vector(spec['world_up_xyz'])).normalized();up=right.cross(forward)
    o.rotation_euler=Matrix((right,up,-forward)).transposed().to_euler()
    data.lens=spec.get('focal_length_start_mm',22);data.sensor_width=36;data.clip_start=.02;data.clip_end=150
    if spec['projection']=='orthographic':
        data.type='ORTHO';data.sensor_fit='HORIZONTAL';data.ortho_scale=spec.get('blender_orthographic_scale_m',14)
    o['camera_spec']=json.dumps(spec)
scene.camera=bpy.data.objects[opt.camera]
scene.render.resolution_x=opt.width;scene.render.resolution_y=round(opt.width*2/3);scene.render.resolution_percentage=100
bpy.ops.object.select_all(action='DESELECT')
for workspace in bpy.data.workspaces:
    for screen in [workspace.screens[0]] if len(workspace.screens) else []:
        for area in screen.areas:
            if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.file.pack_all()
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(HERE/'obsidian.blend'))
OUT.mkdir(parents=True,exist_ok=True)
if not opt.no_render:
    scene.render.filepath=str(OUT/f'{opt.round}-{opt.camera}-{opt.width}.png');bpy.ops.render.render(write_still=True)
