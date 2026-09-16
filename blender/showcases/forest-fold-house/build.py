"""Forest Fold House. Metric source, authored from the supplied JSON, never image planes.
Blender -b --python blender/showcases/forest-fold-house/build.py
"""
import bpy, json, math, random, runpy
from pathlib import Path
from mathutils import Vector

H=Path(__file__).resolve().parent
D=H/'source/data'
plan=json.loads((D/'scene.json').read_text())
random.seed(160926)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version=0
s=bpy.context.scene;s.unit_settings.system='METRIC';s.render.engine='CYCLES'
s.cycles.samples=256;s.cycles.use_denoising=True;s.cycles.adaptive_threshold=.008
s.cycles.max_bounces=12;s.cycles.diffuse_bounces=6;s.cycles.glossy_bounces=6;s.cycles.transmission_bounces=12
s.render.image_settings.file_format='PNG';s.render.image_settings.color_depth='16'
s.render.resolution_x=3840;s.render.resolution_y=2160;s.render.resolution_percentage=100
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast'
s['lieuva_showcase']='forest-fold-house';s['source_revision']=plan['revision'];s['gross_concept_area_m2']=173.4
collections={}
for name in ['00_REFERENCE','01_TERRAIN','02_SHELL_W','03_SHELL_E','04_BRIDGE','05_STAIRS','06_JOINERY','07_FURNITURE','08_PLANTING','09_WATER','10_LIGHTS','11_CAMERAS','12_COLLIDERS']:
 c=bpy.data.collections.new(name);s.collection.children.link(c);collections[name]=c
collection='02_SHELL_W';group='W0';floor_level=0;obstacles=[]

def linear(hex):
 vals=[int(hex[i:i+2],16)/255 for i in (1,3,5)]
 return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in vals)
def mat(name,color,rough=.6,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
 p.inputs['Base Color'].default_value=(*linear(color),1);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 return m
def node(m,t,**args):
 n=m.node_tree.nodes.new(t)
 for k,v in args.items():n.inputs[k].default_value=v
 return n
def link(m,a,out,b,inp):m.node_tree.links.new(a.outputs[out],b.inputs[inp])
def texture(m,scale=1,stretch=(1,1,1),contrast=.1,bump=.001):
 coord=node(m,'ShaderNodeTexCoord');v=node(m,'ShaderNodeVectorMath');v.operation='MULTIPLY';v.inputs[1].default_value=stretch;link(m,coord,'Object',v,0)
 n=node(m,'ShaderNodeTexNoise',Scale=scale,Detail=4,Roughness=.7);link(m,v,0,n,'Vector')
 p=m.node_tree.nodes.get('Principled BSDF');col=p.inputs['Base Color'].default_value[:]
 r=node(m,'ShaderNodeValToRGB');r.color_ramp.elements[0].position=.15;r.color_ramp.elements[1].position=.85
 r.color_ramp.elements[0].color=tuple(c*(1-contrast) for c in col[:3])+(1,)
 r.color_ramp.elements[1].color=tuple(min(1,c*(1+contrast)) for c in col[:3])+(1,)
 link(m,n,'Fac',r,'Fac');link(m,r,'Color',p,'Base Color')
 b=node(m,'ShaderNodeBump',Strength=.25,Distance=bump);link(m,n,'Fac',b,'Height');link(m,b,'Normal',p,'Normal')
 return n
materials={}
for x in json.loads((D/'materials.json').read_text()):materials[x['id']]=mat(x['id']+' '+x['name'],x['base_color_srgb_hex'],x['roughness'],x['metallic'])
stone,concrete,oak,bronze,limestone,linen,olive,glass,water,plaster=[materials['M%02d'%i] for i in range(1,11)]
texture(stone,4,(.7,1,7),.38,.006);texture(concrete,115,contrast=.08);texture(oak,3,(18,.6,3),.28,.001)
texture(limestone,9,contrast=.10,bump=.0006);texture(plaster,180,contrast=.03,bump=.0005)
texture(linen,1200,contrast=.05,bump=.0007);texture(olive,950,contrast=.08,bump=.0007)
for m,ior in [(glass,1.45),(water,1.333)]:
 p=m.node_tree.nodes['Principled BSDF'];p.inputs['Transmission Weight'].default_value=1;p.inputs['IOR'].default_value=ior
glass.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.008
glass.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.96,.98,.96,1)
water.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.69,.79,.72,1)
texture(water,2,(1,5,1),.015,.002)
grout=mat('Recessed fine joints','#605b50',.85);soil=mat('Forest soil and humus','#393b2b',.98);texture(soil,35,contrast=.32,bump=.018)
moss=mat('Moss cushions','#4f6040',.97);texture(moss,160,contrast=.25,bump=.005)
bark=mat('Beech silver grey bark','#7d8073',.9);texture(bark,3,(15,15,1),.3,.008)
leaves=[mat('Beech leaf '+str(i),c,.85) for i,c in enumerate(['#536236','#738246','#8f9257','#3b522b'])]
petals=[mat('Flower '+str(i),c,.8) for i,c in enumerate(['#e5dfc8','#9484b1'])]
ceramic=mat('Glazed chalk ceramic','#c5bdab',.25);paper=mat('Paper and book pages','#e4ddc9',.83)
bookmats=[mat('Book cloth '+str(i),c,.88) for i,c in enumerate(['#b4aa89','#697365','#876d52','#4e5954','#cab996'])]
black=mat('Blackened hardware','#242923',.35,.65)
lamp=mat('3000K diffuser','#fff0cc',.25);p=lamp.node_tree.nodes['Principled BSDF'];p.inputs['Emission Color'].default_value=(1,.68,.38,1);p.inputs['Emission Strength'].default_value=3

def attach(o,material=None):
 for c in list(o.users_collection):c.objects.unlink(o)
 collections[collection].objects.link(o);o['forest_group']=group
 if material:o.data.materials.append(material)
 return o
def mesh(name,verts,faces,material):
 m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new(name,m);attach(o,material);return o
def box(name,loc,size,material,bevel=.006):
 x,y,z=[v/2 for v in size]
 o=mesh(name,[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)],[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],material);o.location=loc
 if bevel:
  mod=o.modifiers.new('True edge radius','BEVEL');mod.width=min(bevel,min(size)/3);mod.segments=3
  mod=o.modifiers.new('Corner normals','WEIGHTED_NORMAL')
 return o
def rect(name,bounds,z,depth,material,walk=False):
 x0,y0,x1,y1=bounds;o=box(name,((x0+x1)/2,(y0+y1)/2,z-depth/2),(x1-x0,y1-y0,depth),material)
 if walk:o['walk_surface']=True
 return o
def cylinder(name,pos,radius,depth,material,vertices=32):
 vs=[]
 for z in [-depth/2,depth/2]:vs.extend([(radius*math.cos(i*2*math.pi/vertices),radius*math.sin(i*2*math.pi/vertices),z) for i in range(vertices)])
 faces=[tuple(reversed(range(vertices))),tuple(range(vertices,2*vertices))]+[(i,(i+1)%vertices,(i+1)%vertices+vertices,i+vertices) for i in range(vertices)]
 o=mesh(name,vs,faces,material);o.location=pos
 for p in o.data.polygons:p.use_smooth=len(p.vertices)==4
 mod=o.modifiers.new('Turned edge','BEVEL');mod.width=min(.003,depth/5);mod.segments=2
 return o
def rod(name,a,b,r,material):
 a,b=Vector(a),Vector(b);o=cylinder(name,(a+b)/2,r,(b-a).length,material,12);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
def curve(name,points,r,material):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=2;c.bevel_depth=r;c.bevel_resolution=2
 sp=c.splines.new('POLY');sp.points.add(len(points)-1)
 for p,co in zip(sp.points,points):p.co=(*co,1)
 return attach(bpy.data.objects.new(name,c),material)
def cushion(name,pos,size,material):
 o=box(name,pos,size,material,min(size)*.33)
 # The seam is an actual stitched welt, kept off the walk envelope.
 x,y,z=size;pts=[]
 for i in range(65):
  a=2*math.pi*i/64;pts.append((pos[0]+math.copysign(abs(math.cos(a))**.24,math.cos(a))*x*.46,pos[1]+math.copysign(abs(math.sin(a))**.24,math.sin(a))*y*.46,pos[2]+z*.13))
 curve(name+'_welt',pts,.0018,material);return o
def light(name,pos,target,power,size=.2,kind='AREA',color=(1,.78,.55)):
 d=bpy.data.lights.new(name,kind);d.energy=power;d.color=color
 if kind=='AREA':d.shape='DISK';d.size=size
 if kind=='SPOT':d.spot_size=math.radians(45);d.spot_blend=.65;d.shadow_soft_size=.05
 o=attach(bpy.data.objects.new(name,d));o.location=pos;o.rotation_euler=(Vector(target)-Vector(pos)).to_track_quat('-Z','Y').to_euler();return o
def obstacle(bounds,level):obstacles.append({'bounds':bounds,'level':level})

# Walls are tiled around explicit openings, avoiding coplanar Boolean debris.
for wing in plan['wings']:
 wid=wing['id'];collection='02_SHELL_W' if wid=='W' else '03_SHELL_E';x0,y0,x1,y1=wing['bounds_xy']
 for level,z in [('L0',0),('L1',3.4)]:
  group=wid+level[-1];floor_level=z
  for side in ['N','S','E','W']:
   horizontal=side in ['N','S'];lo,hi=(x0,x1) if horizontal else (y0,y1)
   wall=(y1-.15 if side=='N' else y0+.15) if horizontal else (x1-.15 if side=='E' else x0+.15)
   ops=[o for o in plan['openings'] if o['wing']==wid and o['level']==level and o['side']==side]
   us=sorted(set([lo,hi]+[o[k] for o in ops for k in ['along_start','along_end']]))
   zs=sorted(set([z,z+3.05]+[o[k] for o in ops for k in ['z_bottom','z_top']]))
   for a,b in zip(us,us[1:]):
    for c,d in zip(zs,zs[1:]):
     if any(o['along_start']<=(a+b)/2<=o['along_end'] and o['z_bottom']<=(c+d)/2<=o['z_top'] for o in ops):continue
     pos=((a+b)/2,wall,(c+d)/2) if horizontal else (wall,(a+b)/2,(c+d)/2)
     size=(b-a,.3,d-c) if horizontal else (.3,b-a,d-c)
     box(f'{wid}_{level}_WALL_{side}',pos,size,stone if side in ['N','W'] or wid=='E' and level=='L0' else concrete)
     # Separate 12 mm inner finish, with the same apertures.
     inward=-1 if side in ['N','E'] else 1;pl=list(pos);pl[1 if horizontal else 0]+=inward*.156
     sz=list(size);sz[1 if horizontal else 0]=.012
     box(f'{wid}_{level}_LINING_{side}',pl,sz,stone if wid=='E' and level=='L0' and side in ['N','E'] else plaster,.002)
    # Collision only along solid wall or window, doors stay genuinely open.
    if not any(o['type']=='door' and o['along_start']<=(a+b)/2<=o['along_end'] for o in ops):
     obstacle([a,wall-.15,b,wall+.15] if horizontal else [wall-.15,a,wall+.15,b],z)
   for o in ops:
    a,b,c,d=o['along_start'],o['along_end'],o['z_bottom'],o['z_top'];w=b-a
    def panel(n,u,h,du,dh,dep,ma):
     return box(o['id']+'_'+n,(u,wall,h) if horizontal else (wall,u,h),(du,dep,dh) if horizontal else (dep,du,dh),ma,.002)
    for u in [a+.0225,b-.0225]:panel('jamb',u,(c+d)/2,.045,d-c,.10,bronze)
    for h in [c+.0225,d-.0225]:panel('head_sill',(a+b)/2,h,w,.045,.10,bronze)
    if o['type']!='door':
     count=max(1,math.ceil(w/1.5))
     for i in range(count):
      aa=a+i*w/count;bb=a+(i+1)*w/count
      if i:panel('mullion',aa,(c+d)/2,.038,d-c,.09,bronze)
      panel('glass',(aa+bb)/2,(c+d)/2,bb-aa-.045,d-c-.09,.012,glass)
    else:
     # Door leaves are parked parallel to the wall, never across a walkthrough.
     panel('open_leaf',a-.48,(c+d)/2,.85,d-c-.09,.045,oak if o['id']=='D01' else glass)
  # Upper slab is cut around the stair void; no hidden ceiling across the run.
  parts=[(x0,y0,x1,y1)]
  if wid=='W' and level=='L1':parts=[(x0,y0,x1,-.85),(-5.45,-.85,x1,y1),(x0,2.7,-5.45,y1),(x0,-.85,-7.7,2.7)]
  for j,bounds in enumerate(parts):rect(f'{wid}_{level}_SLAB_{j}',bounds,z,.35,concrete)
  # Narrow oak boards upstairs; limestone tiles downstairs. Actual 2 mm joints.
  for bounds in parts:
   a,b,c,d=bounds;dx,dy=(.16,2.4) if z else (.6,1.2)
   xx=a
   while xx<c-.001:
    yy=b
    while yy<d-.001:
     rect(f'{wid}_{level}_FLOOR', [xx+.001,yy+.001,min(xx+dx,c)-.001,min(yy+dy,d)-.001],z+.003,.018,oak if z else limestone,True);yy+=dy
    xx+=dx
  # Ceiling strips track slab openings below the U stair.
  ceiling_parts=parts if level=='L1' else ([(x0,y0,x1,-.85),(-5.45,-.85,x1,y1),(x0,2.7,-5.45,y1)] if wid=='W' else [(x0,y0,x1,y1)])
  if level=='L1':ceiling_parts=[(x0,y0,x1,y1)]
  for a,b,c,d in ceiling_parts:
   xx=a
   while xx<c-.001:
    rect(f'{wid}_{level}_CEILING',[xx+.001,b,min(c,xx+.16)-.001,d],z+3.075,.025,oak);xx+=.16
 group='exterior';rect(wid+'_ROOF_SLAB',(x0,y0,x1,y1),6.8,.35,concrete)
 for side,bounds in [('S',(x0,y0,x1,y0+.18)),('N',(x0,y1-.18,x1,y1)),('W',(x0,y0,x0+.18,y1)),('E',(x1-.18,y0,x1,y1))]:
  rect(wid+'_PARAPET_'+side,bounds,7.15,.35,concrete);rect(wid+'_COPING_'+side,bounds,7.165,.025,bronze)
 rect(wid+'_ROOF_SUBSTRATE',(x0+.35,y0+.35,x1-.35,y1-.35),7.03,.22,soil)
 # Thin stone sill bands and rain chains give the façade a real construction scale.
 for z in [.03,3.43]:rect(wid+'_SILL',(x0-.04,y0-.06,x1+.04,y0+.3),z,.06,stone)
 for xx in [x0+.22,x1-.22]:rod(wid+'_DRAIN',(xx,y1-.2,3.5),(xx,y1-.2,6.8),.035,bronze)

collection='06_JOINERY'
for i,p in enumerate(plan['interior_partitions']):
 z=plan['levels'][p['level']];group='W'+p['level'][-1];a,b=p['from'],p['to'];horizontal=abs(a[1]-b[1])<.001;axis=0 if horizontal else 1
 cuts=sorted(set([a[axis],b[axis]]+[v for gap in p['door_gaps'] for v in gap]))
 for lo,hi in zip(cuts,cuts[1:]):
  gap=any(u<=(lo+hi)/2<=v for u,v in p['door_gaps']);bottom=z+2.4 if gap else z
  pos=((lo+hi)/2,a[1],(bottom+z+3.05)/2) if horizontal else (a[0],(lo+hi)/2,(bottom+z+3.05)/2)
  box('PARTITION_%02d'%i,pos,(hi-lo,.12,z+3.05-bottom) if horizontal else (.12,hi-lo,z+3.05-bottom),plaster)
  if not gap:obstacle([lo,a[1]-.06,hi,a[1]+.06] if horizontal else [a[0]-.06,lo,a[0]+.06,hi],z)
  else:
   for u in [lo,hi]:box('OAK_DOOR_REVEAL', (u,a[1],z+1.2) if horizontal else (a[0],u,z+1.2),(.025,.15,2.4) if horizontal else (.15,.025,2.4),oak,.002)

collection='04_BRIDGE';group='bridge'
rect('BR01_FLOOR',[-1,-.1,3,1.5],3.403,.2,oak,True)
for y in [-.06,1.46]:
 box('BR01_SIDE_GLASS',(1,y,4.7),(4,.012,2.5),glass,.001)
 for z in [3.43,4.45,5.9]:box('BR01_SIDE_RAIL',(1,y,z),(4,.045,.045),bronze,.002)
 for x in [-.98,0,1,2,2.98]:box('BR01_POST',(x,y,4.7),(.045,.07,2.5),bronze,.002)
box('BR01_ROOF_GLASS',(1,.7,5.98),(4,1.6,.024),glass,.001)
for x in [-1,0,1,2,3]:box('BR01_ROOF_BEAM',(x,.7,5.91),(.045,1.6,.07),bronze,.002)
collection='05_STAIRS';group='stairs'
rect('ST01_HALF_LANDING',[-7.7,-.8,-5.5,.2],1.7,.18,oak,True)
for j in range(10):
 # Ten 250mm goings fit the fixed flight span; twenty exact 170mm risers.
 y=2.7-(j+.5)*.25;z=(j+1)*.17
 rect('ST01_FLIGHT_A_%02d'%j,[-7.7,y-.125,-6.7,y+.125],z,.17,oak,True)
 y=.2+(j+.5)*.25;z=1.7+(j+1)*.17
 rect('ST01_FLIGHT_B_%02d'%j,[-6.5,y-.125,-5.5,y+.125],z,.17,oak,True)
for x,z1,z2 in [(-6.68,2.75,1.05),(-6.52,2.75,4.45)]:
 rod('ST01_HANDRAIL',(x,.2,z1),(x,2.7,z2),.025,bronze)
 for j in range(11):
  t=j/10;y=.2+t*2.5;z=z1+(z2-z1)*t
  rod('ST01_BALUSTER',(x,y,z-1.05),(x,y,z),.008,bronze)
rod('ST01_LANDING_RAIL',(-6.55,2.7,4.45),(-7.65,2.7,4.45),.025,bronze)
for x in [-7.65,-7.35,-7.05,-6.75]:rod('ST01_GUARD',(x,2.7,3.4),(x,2.7,4.45),.008,bronze)

# Furniture at the supplied metric positions, with component joinery and upholstery.
collection='07_FURNITURE'
def books(x,y,z,width=.65):
 for i in range(max(2,int(width/.065))):
  h=random.uniform(.18,.31);m=random.choice(bookmats);o=box('Bound volume',(x+i*.063,y,z+h/2),(.045,.19,h),m,.003)
  box('Book page block',(x+i*.063,y-.003,z+h/2),(.032,.195,h-.018),paper,.001)
def vessel(x,y,z,r=.07,h=.18):
 # Lathed ceramic with an open throat and inner wall.
 profile=[(r*.5,0),(r,.025),(r*.95,h*.55),(r*.5,h*.9),(r*.49,h),(r*.40,h),(r*.4,h*.85),(r*.75,.04),(0,.035)]
 vs=[(x+rr*math.cos(i*math.tau/32),y+rr*math.sin(i*math.tau/32),z+zz) for rr,zz in profile for i in range(32)]
 fs=[(j*32+i,j*32+(i+1)%32,(j+1)*32+(i+1)%32,(j+1)*32+i) for j in range(len(profile)-1) for i in range(32)]
 o=mesh('Wheel-thrown vessel',vs,fs,ceramic)
 for p in o.data.polygons:p.use_smooth=True
 return o
for f in json.loads((D/'furniture.json').read_text()):
 id=f['id'];x,y,z=f['center_xyz'];w,d,h=f['size_xyz'];base=3.4 if f['zone'].startswith('L1') else 0;group=('E' if 'LOUNGE' in f['zone'] or 'STUDIO' in f['zone'] else 'W')+('1' if base else '0')+'_furniture'
 start=set(bpy.data.objects);kind=f['kind'].lower()
 obstacle([x-w/2,y-d/2,x+w/2,y+d/2],base)
 if 'sofa' in kind:
  rot=id=='F01';ww,dd=(d,w) if rot else (w,d)
  box(id+'_oak_base',(x,y,base+.19),(ww,.80,.15),oak,.03)
  for j in range(3):
   xx=x-ww/2+(j+.5)*ww/3;cushion(id+'_seat',(xx,y-.04,base+.44),(ww/3-.024,.69,.23),linen)
   cushion(id+'_back',(xx,y+.29,base+.70),(ww/3-.025,.21,.42),linen)
  for xx in [x-ww/2+.08,x+ww/2-.08]:cushion(id+'_arm',(xx,y,base+.55),(.16,.83,.30),linen)
  for xx in [x-ww*.30,x+ww*.24]:
   o=cushion(id+'_pillow',(xx,y+.06,base+.73),(.42,.19,.39),olive if xx<x else linen);o.rotation_euler.x=.16
  if rot:
   for o in set(bpy.data.objects)-start:o.location=Vector((x,y,0))+Vector((-(o.location.y-y),o.location.x-x,o.location.z));o.rotation_euler.z+=math.pi/2
 elif 'chair' in kind:
  dining='dining' in kind;ww=.48 if dining else .76;dd=.48 if dining else .72
  for dx in [-ww*.39,ww*.39]:
   for dy in [-dd*.38,dd*.38]:rod(id+'_leg',(x+dx,y+dy,base+.02),(x+dx*.92,y+dy*.92,base+.46),.022,oak)
  cushion(id+'_seat',(x,y,base+.46),(ww,dd,.12),olive if not dining else linen)
  cushion(id+'_back',(x,y+dd*.44,base+.7),(ww,.11,.43),olive if not dining else oak)
  if not dining:
   for dx in [-ww*.48,ww*.48]:rod(id+'_arm',(x+dx,y-dd*.33,base+.64),(x+dx,y+dd*.40,base+.68),.028,oak)
  angle=math.atan2(-2-y,-2.7-x)+math.pi/2 if dining else math.radians(f.get('rotation_z_degrees',0))
  for o in set(bpy.data.objects)-start:
   q=o.location-Vector((x,y,0));o.location=(x+q.x*math.cos(angle)-q.y*math.sin(angle),y+q.x*math.sin(angle)+q.y*math.cos(angle),q.z);o.rotation_euler.z+=angle
 elif 'bed' in kind:
  box(id+'_frame',(x,y,base+.24),(w,d,.30),oak,.045);cushion(id+'_mattress',(x,y,base+.49),(w-.06,d-.06,.27),linen)
  box(id+'_headboard',(x,y+d/2,base+.68),(w+.16,.07,1.12),oak,.02)
  for xx in [x-.46,x+.46]:cushion(id+'_pillow',(xx,y+.60,base+.71),(.73,.48,.15),linen)
  # Draped quilt: gentle sag, raised folds, hem and real thickness.
  vs=[];nx,ny=36,42
  for j in range(ny+1):
   for i in range(nx+1):
    u=(i/nx-.5)*2;v=j/ny;zz=base+.65-.30*max(0,(abs(u)-.86)/.14)+.022*math.sin(u*31+v*11)*math.sin(v*8)+.008*math.sin(u*77)
    vs.append((x+u*(w/2+.08),y-d/2-.04+v*(d-.48),zz))
  fs=[(j*(nx+1)+i,j*(nx+1)+i+1,(j+1)*(nx+1)+i+1,(j+1)*(nx+1)+i) for j in range(ny) for i in range(nx)]
  o=mesh(id+'_quilt',vs,fs,linen);o.modifiers.new('Quilt thickness','SOLIDIFY').thickness=.012
  for p in o.data.polygons:p.use_smooth=True
  for xx in [x-w/2-.26,x+w/2+.26]:
   cylinder('Bedside table',(xx,y+.62,base+.24),.22,.46,oak);vessel(xx,y+.62,base+.47,.07,.16)
 elif 'table' in kind or id in ['F17','F22']:
  round_='round' in kind or id=='F22';ma=limestone if id in ['F02','F22'] else oak
  if round_:cylinder(id+'_top',(x,y,base+h-.03),w/2,.06,ma,64);cylinder(id+'_pedestal',(x,y,base+(h-.06)/2),w*.23,h-.06,ma)
  else:
   box(id+'_top',(x,y,base+h-.04),(w,d,.08),ma,.018)
   for xx in [x-w*.4,x+w*.4]:box(id+'_trestle',(xx,y,base+(h-.08)/2),(.065,d*.8,h-.08),oak,.012)
  vessel(x+.12,y,base+h,.085,.2)
  if id=='F17':
   box('Architect unfolded plan',(x-.4,y-.1,base+h+.003),(.70,.48,.004),paper,.001)
   for q in range(5):box('Drawing ruled line',(x-.6+q*.1,y-.1,base+h+.006),(.001,.35,.001),black,0)
   box('Architecture model base',(x+.45,y,base+h+.02),(.62,.40,.04),oak)
   for xx in [x+.3,x+.6]:box('Study house volume',(xx,y,base+h+.12),(.2,.26,.20),paper,.004)
   rod('Model bridge',(x+.3,y,base+h+.2),(x+.6,y,base+h+.2),.015,oak)
 elif 'shower' in kind:
  rect(id+'_tray',[x-w/2,y-d/2,x+w/2,y+d/2],base+.018,.025,limestone)
  box(id+'_screen',(x-w/2,y,base+1.05),(.012,d,2.1),glass,.001)
  rod('Shower riser',(x,y+d/2-.07,base+.8),(x,y+d/2-.07,base+2.13),.014,bronze)
  rod('Shower arm',(x,y+d/2-.07,base+2.13),(x,y+.04,base+2.13),.014,bronze);cylinder('Rain shower head',(x,y+.04,base+2.12),.12,.02,bronze)
  box('Shower drain',(x,y,base+.02),(.6,.045,.008),bronze,.001)
 elif 'toilet' in kind or id in ['F09','F16']:
  cushion(id+'_porcelain',(x,y,base+.33),(.38,.56,.42),ceramic);cylinder(id+'_seat',(x,y-.05,base+.56),.18,.035,ceramic)
  box(id+'_flush',(x,y+.33,base+1.1),(.2,.018,.14),bronze,.01)
 elif 'basin' in kind or 'vanity' in kind or id in ['F10','F15']:
  box(id+'_cabinet',(x,y,base+.6),(w,d,.42),oak,.018)
  box(id+'_stone',(x,y,base+.85),(w+.02,d+.02,.05),limestone,.016);vessel(x,y,base+.86,.16,.10)
  rod(id+'_tap',(x,y+.13,base+.88),(x,y+.13,base+1.13),.012,bronze);rod(id+'_spout',(x,y+.13,base+1.13),(x,y,base+1.13),.012,bronze)
  mirror=mat(id+' mirror','#d3d7d3',.04,1);box(id+'_mirror',(x,y+.30,base+1.55),(w,.012,.8),mirror,.02)
 elif id in ['F18','F24']:
  box(id+'_back',(x,y+d/2-.02,base+h/2),(w,.04,h),oak)
  for xx in [x-w/2,x+w/2]:box(id+'_side',(xx,y,base+h/2),(.035,d,h),oak)
  for k in range(6 if h>2 else 3):
   zz=base+.08+k*(h-.12)/(5 if h>2 else 2);box(id+'_shelf',(x,y,zz),(w,d,.035),oak)
   if zz<base+h-.2:
    books(x-w/2+.09,y-.025,zz+.02,min(w-.15,1.2));vessel(x+w*.27,y-.04,zz+.02)
  if h>2:
   for xx in [x-w/6,x+w/6]:box(id+'_divider',(xx,y,base+h/2),(.026,d,h),oak)
 else:
  # Handle-free oak joinery: toe recess, individual fronts and stone worktops.
  box(id+'_carcass',(x,y,base+h/2),(w-.015,d-.015,h-.015),oak)
  count=max(1,round(w/.55))
  for j in range(count):box(id+'_front',(x-w/2+(j+.5)*w/count,y-d/2-.006,base+h/2+.03),(w/count-.003,.026,h-.11),oak,.002)
  box(id+'_toe',(x,y-d/2+.03,base+.04),(w,.035,.08),black,0)
  if h<1.2:
   box(id+'_worktop',(x,y,base+h),(w+.03,d+.035,.045),limestone,.009);vessel(x+.15,y,base+h+.025)
   if id=='F07':
    box('Inset sink',(x+.55,y,base+h+.028),(.48,.35,.012),black,.045);rod('Kitchen tap',(x+.55,y+.16,base+h),(x+.55,y+.16,base+h+.32),.013,bronze)
    for xx in [x-.75,x-.42]:cylinder('Induction ring',(xx,y,base+h+.028),.12,.004,black)

# Joinery accessories, textiles and deliberately sparse objects.
group='W0_furniture'
for z in [0,3.4]:
 group='W1_furniture' if z else 'W0_furniture'
 for x in [-7.35,-1.55]:
  vs=[];nx,nz=24,24
  for j in range(nz+1):
   for i in range(nx+1):vs.append((x+(i/nx-.5)*.30,-3.68+.04*math.sin(i/nx*math.pi*8),z+.08+j/nz*2.82))
  fs=[(j*(nx+1)+i,j*(nx+1)+i+1,(j+1)*(nx+1)+i+1,(j+1)*(nx+1)+i) for j in range(nz) for i in range(nx)]
  ob=mesh('Linen curtain stitched folds',vs,fs,linen);ob.modifiers.new('Hem thickness','SOLIDIFY').thickness=.002
  for p in ob.data.polygons:p.use_smooth=True
group='W0_furniture';rect('Woven living rug',[-6.05,-2.65,-4.50,-1.05],.024,.008,linen)
group='E0_furniture';rect('Woven lounge rug',[4.25,.25,6.85,2.1],.024,.008,linen)

# Terrain uses a real excavation under both wings, watercourt and dry route.
collection='01_TERRAIN';group='landscape'
def inpoly(x,y,poly):
 c=False
 for (a,b),(d,e) in zip(poly,poly[1:]+poly[:1]):
  if (b>y)!=(e>y) and x<(d-a)*(y-b)/(e-b)+a:c=not c
 return c
pond=plan['landscape']['pond_polygon']
def terrain_z(x,y):return -.23+3.63*max(0,min(1,(y-2)/4.5))+.05*math.sin(x*.8)*math.sin(y*.6)
def occupied(x,y):return (-8<x<-1 and -4<y<4) or (3<x<8 and -1.5<y<4) or (-1.3<x<3.2 and .1<y<1.5) or inpoly(x,y,pond)
verts=[];faces=[]
for iy in range(80):
 for ix in range(88):
  x=-22+ix*.5;y=-22+iy*.5
  if occupied(x+.25,y+.25):continue
  k=len(verts);verts.extend([(a,b,terrain_z(a,b)) for a,b in [(x,y),(x+.5,y),(x+.5,y+.5),(x,y+.5)]]);faces.append((k,k+1,k+2,k+3))
mesh('Excavated woodland terrain',verts,faces,soil)
rect('Distant forest floor',[-200,-200,200,200],-.65,.1,soil)
for a,b,c,d in [w['bounds_xy'] for w in plan['wings']]:rect('Foundation plinth',[a,b,c,d],0,.65,stone)
for name,bounds in [('WEST_TERRACE',plan['landscape']['west_terrace_bounds']),('LOUNGE_SILL',plan['landscape']['lounge_threshold_bounds']),('DRY_COURT',[-1.3,.1,3.2,1.5])]:rect(name,bounds,0,.18,stone,True)
rect('UPPER_ENTRY_PATH',[-5.45,3.8,-4.1,8.5],3.4,.16,stone,True)
collection='09_WATER';group='water'
mesh('Shallow pond bed',[(x,y,-.55) for x,y in pond],[tuple(range(len(pond)))],stone)
o=mesh('Reflecting water court',[(x,y,-.18) for x,y in pond],[tuple(range(len(pond)))],water);o['pond_surface']=True
for (x,y),(xx,yy) in zip(pond,pond[1:]+pond[:1]):
 rod('Pond stone edging',(x,y,-.24),(xx,yy,-.24),.085,stone)
box('Waterfall retaining cheek',(8.5,-2.9,1),( .45,1.6,2.4),stone,.03)
vs=[];fs=[]
for j in range(32):
 for i in range(20):vs.append((8.25+.006*math.sin(i*3+j*.4),-3.5+i/19*1.2,2.2-j/31*2.38))
for j in range(31):
 for i in range(19):k=j*20+i;fs.append((k,k+1,k+21,k+20))
mesh('Small recirculating waterfall',vs,fs,water)

# Botanical meshes: individual curved leaves, fern fronds, flower stems. Seeded.
collection='08_PLANTING';group='planting'
def leafmesh(name,origin,scale=1,fern=False):
 vs=[];fs=[]
 for j in range(9 if fern else 13):
  az=j*2.399;length=random.uniform(.25,.55)*scale;end=Vector(origin)+Vector((math.cos(az)*length*.65,math.sin(az)*length*.65,length*.45))
  start=Vector(origin);side=Vector((-math.sin(az),math.cos(az),0))*length*.10
  for t in range(1,8):
   tt=t/8;mid=start.lerp(end,tt)+Vector((0,0,math.sin(tt*math.pi)*length*.27));wid=side*math.sin(tt*math.pi)
   if fern:
    for sign in [-1,1]:
     tip=mid+wid*sign*2+Vector((math.cos(az),math.sin(az),0))*length*.04;k=len(vs);vs.extend([mid,mid+Vector((0,0,.025*scale)),tip]);fs.append((k,k+1,k+2))
   else:
    k=len(vs);vs.extend([mid-wid,mid+Vector((0,0,.012*scale)),mid+wid]);
    if t>1:fs.extend([(k-3,k,k+1,k-2),(k-2,k+1,k+2,k-1)])
 o=mesh(name,vs,fs,random.choice(leaves))
 for p in o.data.polygons:p.use_smooth=True
 return o
for wing in plan['wings']:
 a,b,c,d=wing['bounds_xy']
 for i in range(150 if wing['id']=='W' else 85):
  x=random.uniform(a+.45,c-.45);y=random.uniform(b+.45,d-.45);leafmesh('Roof perennial',(x,y,7.03),random.uniform(1.3,2.2),i%3==0)
  if i%6==0:
   z=7.03;top=(x+.08,y,z+random.uniform(.25,.62));rod('Flower stem',(x,y,z),top,.003,leaves[0])
   for j in range(5):
    ang=j*math.tau/5;cylinder('Small roof flower',(top[0]+.028*math.cos(ang),top[1]+.028*math.sin(ang),top[2]),.022,.006,petals[i%2],8)
for i in range(500):
 x=random.uniform(-17,17);y=random.uniform(-13,13)
 if occupied(x,y) or (-8.65<x<-.65 and -5.65<y<-3.7) or (2.75<x<8.25 and -2.6<y<-1.25) or (-5.8<x<-3.9 and 3.7<y<9):continue
 leafmesh('Woodland fern',(x,y,terrain_z(x,y)),random.uniform(.7,1.8),i%2==0)
for i in range(700):
 x=random.uniform(-16,16);y=random.uniform(-12,14)
 if occupied(x,y) or (-8.65<x<-.65 and -5.65<y<-3.7) or (-5.8<x<-3.9 and 3.7<y<9):continue
 z=terrain_z(x,y);vs=[];fs=[]
 for j in range(22):
  a=random.random()*math.tau;h=random.uniform(.14,.45);dx=random.uniform(-.12,.12);dy=random.uniform(-.12,.12);k=len(vs)
  for q in range(4):
   t=q/3;cx=x+dx+math.cos(a)*h*t*t*.7;cy=y+dy+math.sin(a)*h*t*t*.7;w=.008*(1-t)+.0005
   vs.extend([(cx-math.sin(a)*w,cy+math.cos(a)*w,z+h*t),(cx+math.sin(a)*w,cy-math.cos(a)*w,z+h*t)])
  for q in range(3):fs.append((k+q*2,k+q*2+1,k+q*2+3,k+q*2+2))
 mesh('Woodland sedge tuft',vs,fs,random.choice(leaves))
# Rounded, fractured moss boulders, never in doors or the walk route.
for i in range(45):
 x=random.uniform(-14,14);y=random.uniform(-10,10)
 if occupied(x,y) or (-6<x<-3.8 and y>3):continue
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(x,y,terrain_z(x,y)+.1));o=attach(bpy.context.object,stone);o.name='Gneiss woodland boulder';o.scale=(random.uniform(.3,.9),random.uniform(.3,.8),random.uniform(.2,.5))
 for v in o.data.vertices:v.co*=random.uniform(.92,1.08)
 for p in o.data.polygons:p.use_smooth=True
 mod=o.modifiers.new('Weathered stone detail','SUBSURF');mod.levels=2
 tex=bpy.data.textures.new('Mineral fracture','CLOUDS');tex.noise_scale=.18;mod=o.modifiers.new('Mineral relief','DISPLACE');mod.texture=tex;mod.strength=.055
 # Smaller green cap sits on the upper faces, not a floating sphere.
 for p in o.data.polygons:
  if p.normal.z>.4:
   if len(o.data.materials)==1:o.data.materials.append(moss)
   p.material_index=1
# Silver beech: tapered forked trunks, fine twigs and small elliptical leaves.
# All leaf blades are authored geometry; the distant perimeter uses fewer twigs.
def taper(name,a,b,r1,r2,material):
 a,b=Vector(a),Vector(b);n=(b-a).normalized();u=n.cross(Vector((0,1,0))).normalized();v=n.cross(u);vs=[]
 for p,r in [(a,r1),(b,r2)]:
  for j in range(10):vs.append(p+r*(u*math.cos(j*math.tau/10)+v*math.sin(j*math.tau/10)))
 o=mesh(name,vs,[(j,(j+1)%10,(j+1)%10+10,j+10) for j in range(10)],material)
 for p in o.data.polygons:p.use_smooth=True
 return o
for i in range(70):
 angle=i*2.399;r=random.uniform(11,32);x=math.cos(angle)*r;y=math.sin(angle)*r
 if y<-8 and -16<x<13:continue
 z=terrain_z(x,y);height=random.uniform(9,14);trunk=random.uniform(.12,.24)
 taper('Beech tapered trunk',(x,y,z),(x+.3,y-.2,z+height),trunk,.025,bark)
 for j in range(9):
  a=j*2.399+i;zz=z+height*(.27+.06*j);end=Vector((x+math.cos(a)*random.uniform(2,4),y+math.sin(a)*random.uniform(2,4),zz+1.3))
  taper('Beech primary branch',(x,y,zz),end,.045,.008,bark)
  vs=[];fs=[]
  for k in range(12):
   a2=a+random.uniform(-1.7,1.7);start=Vector((x,y,zz)).lerp(end,.35+k/18);tip=start+Vector((math.cos(a2)*1.3,math.sin(a2)*1.3,random.uniform(.0,.7)))
   taper('Beech fine twig',start,tip,.009,.002,bark)
   for l in range(64):
    t=random.uniform(.25,1.3);at=start.lerp(tip,t)+Vector((random.uniform(-.5,.5),random.uniform(-.5,.5),random.uniform(-.3,.3)));angle=random.uniform(0,math.tau);length=random.uniform(.14,.25);side=Vector((-math.sin(angle),math.cos(angle),random.uniform(-.6,.6)))*length*.38;direction=Vector((math.cos(angle),math.sin(angle),random.uniform(-.6,.6)))*length
    q=len(vs);vs.extend([at,at+direction*.45+side,at+direction,at+direction*.45-side,at+direction*.45+Vector((0,0,.012))]);fs.extend([(q,q+1,q+4),(q+1,q+2,q+4),(q+2,q+3,q+4),(q+3,q,q+4)])
  mesh('Beech individual leaf blades',vs,fs,random.choice(leaves))

collection='10_LIGHTS';group='lights'
for f in plan['lighting']['fixture_positions']:
 x,y,z=f['position_xyz'];cylinder(f['id']+'_recess',(x,y,z+.008),.055,.035,black);cylinder(f['id']+'_lens',(x,y,z-.012),.034,.004,lamp)
 light(f['id'],(x,y,z-.035),(x,y,z-2),45,kind='SPOT')
for x,y,z in [(-3.1,1.6,1.6),(5.5,3.52,2.7),(-6.4,-.98,4.5)]:
 box('Concealed joinery diffuser',(x,y,z),(1.3,.025,.02),lamp,.002);light('Joinery task light',(x,y-.02,z-.03),(x,y-.4,z-.7),28,size=1.3)
sun=light('Southwest afternoon sun',(-12,-14,18),(0,0,0),4.5,kind='SUN',color=(1,.87,.68));sun.data.angle=math.radians(12)
s.world=bpy.data.worlds.new('Neutral woodland sky');s.world.use_nodes=True
world=s.world.node_tree;sky=world.nodes.new('ShaderNodeTexSky');sky.sky_type='MULTIPLE_SCATTERING';sky.sun_elevation=math.radians(35);sky.sun_rotation=math.radians(220);sky.sun_disc=False
world.links.new(sky.outputs['Color'],world.nodes['Background'].inputs['Color']);world.nodes['Background'].inputs['Strength'].default_value=.10
s.view_settings.exposure=.7
# Clear thin glazing transmits direct shadow rays; refraction remains visible to the camera.
nt=glass.node_tree;path=nt.nodes.new('ShaderNodeLightPath');transparent=nt.nodes.new('ShaderNodeBsdfTransparent');mix=nt.nodes.new('ShaderNodeMixShader');nt.links.new(path.outputs['Is Shadow Ray'],mix.inputs[0]);nt.links.new(nt.nodes['Principled BSDF'].outputs[0],mix.inputs[1]);nt.links.new(transparent.outputs[0],mix.inputs[2]);nt.links.new(mix.outputs[0],nt.nodes['Material Output'].inputs['Surface'])
collection='11_CAMERAS';group='cameras'
for c in json.loads((D/'cameras.json').read_text())['cameras']:
 d=bpy.data.cameras.new(c['id']);d.lens=c['lens_mm'];d.sensor_width=36;d.clip_end=250
 o=attach(bpy.data.objects.new(c['id'],d));o.location=c['position_xyz'];o.rotation_euler=(Vector(c['look_at_xyz'])-o.location).to_track_quat('-Z','Y').to_euler();o['lighting']=c.get('lighting','late_afternoon')
# Camera refinements avoid the plan's solid stair wall and foreground furniture.
for name,pos,target,lens in [('C01',(-16,-19,7),(0,0,3.1),30),('C07',(-1.85,1.15,1.7),(-6.2,-2.0,1.2),23),('C08',(-1.8,-1.4,5.1),(-6,-2.1,4.3),24)]:
 o=bpy.data.objects[name];o.location=pos;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();o.data.lens=lens
runpy.run_path(str(H/'refine.py'))['apply']()
s.camera=bpy.data.objects['C01']
# Exportable navigation authority: physical blockers, unchanged source dimensions.
(H/'colliders.json').write_text(json.dumps({'eyeHeight':1.7,'radius':.25,'obstacles':obstacles},indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(H/'forest-fold-house.blend'))
print('FOREST SOURCE SAVED',len(s.objects),'objects',flush=True)
