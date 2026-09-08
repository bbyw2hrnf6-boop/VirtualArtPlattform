"""LIEUVA premium v1: repeatable, metric Blender sources, runtime exports and Cycles.
Run: Blender -b --python blender/production/build_premium.py -- --room white-cube --round 1
Runtime coordinates are (x,y,z); Blender coordinates are (x,-z,y).
"""
import argparse, math, json, sys, random
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'blender/production/v2'
parser=argparse.ArgumentParser()
parser.add_argument('--room', choices=['white-cube','nocturne','pavilion'],required=True)
parser.add_argument('--round',type=int,default=1)
parser.add_argument('--width',type=int,default=1200)
parser.add_argument('--samples',type=int,default=32)
parser.add_argument('--export',action='store_true')
parser.add_argument('--device',choices=['CPU','GPU'],default='CPU')
parser.add_argument('--no-render',action='store_true')
parser.add_argument('--bake-ao',action='store_true')
args=parser.parse_args(sys.argv[sys.argv.index('--')+1:])
ROOM=args.room
W,D,H={'white-cube':(16,12,5.3),'nocturne':(15.5,11.5,5.8),'pavilion':(40,60,5.6)}[ROOM]
random.seed(612)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.name='LIEUVA_'+ROOM
scene.unit_settings.system='METRIC'
scene['aura_template_id']=ROOM
scene['aura_schema_version']=2
scene['aura_units']='metres'
scene['lieuva_production_version']='premium-v2'
scene['aura_dimensions']=[W,D,H]
COL={}
for name in ['SHELL','ARCHITECTURE','OVERHEAD','SURFACES','COLLISION','NAVIGATION','ANCHORS','BEAUTY_STAGING','BEAUTY_LIGHTS','CAMERAS']:
 c=bpy.data.collections.new(name);scene.collection.children.link(c);COL[name]=c

def vec(p):return (p[0],-p[2],p[1])
def move(o,collection):
 for c in list(o.users_collection):c.objects.unlink(o)
 COL[collection].objects.link(o)

def tag(o,role,**extras):
 o['aura_role']=role
 for k,v in extras.items():o[k]=v
 return o

def material(name,color,rough=.65,metal=0,texture=None,tile=3,bump=.003):
 m=bpy.data.materials.new(name);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1)
 p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 m['tile_metres']=tile
 if texture:
  t=m.node_tree.nodes.new('ShaderNodeTexImage')
  t.image=bpy.data.images.load(str(ROOT/'public/assets/materials'/texture),check_existing=True)
  t.image.colorspace_settings.name='sRGB';m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
  if ROOM=='nocturne' and name=='Warm charcoal plaster':
   # Retain texture variation while tinting to a warm charcoal, with image nodes
   # replaced by a direct Principled color in the constrained export below.
   mix=m.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
   mix.inputs[2].default_value=(.34,.28,.23,1);m.node_tree.links.new(t.outputs['Color'],mix.inputs[1]);m.node_tree.links.new(mix.outputs[0],p.inputs['Base Color'])
 if bump:
  tc=m.node_tree.nodes.new('ShaderNodeTexCoord');noise=m.node_tree.nodes.new('ShaderNodeTexNoise')
  noise.inputs['Scale'].default_value=160;noise.inputs['Detail'].default_value=3
  m.node_tree.links.new(tc.outputs['Object'],noise.inputs['Vector'])
  b=m.node_tree.nodes.new('ShaderNodeBump');b.inputs['Distance'].default_value=bump;b.inputs['Strength'].default_value=.28
  m.node_tree.links.new(noise.outputs['Fac'],b.inputs['Height']);m.node_tree.links.new(b.outputs['Normal'],p.inputs['Normal'])
 return m

def emission(name,color,power):
 m=material(name,color,.4,bump=0);p=m.node_tree.nodes.get('Principled BSDF')
 p.inputs['Emission Color'].default_value=(*color,1);p.inputs['Emission Strength'].default_value=power
 m.cycles.emission_sampling='NONE'
 return m

white=material('Mineral plaster',(.72,.69,.62),.82,texture='aura-chalk-plaster-v5.webp',tile=3)
charcoal=material('Warm charcoal plaster',(.11,.085,.064),.76,texture='aura-greige-microcement-v5.webp',tile=3)
stone=material('Cut limestone',(.62,.53,.4),.64,texture='aura-roman-travertine-v2.webp',tile=4)
concrete=material('Honed pale concrete',(.51,.5,.46),.32,texture='aura-light-concrete-v5.webp',tile=4)
oak=material('Smoked oak',(.12,.075,.04),.36,texture='aura-smoked-oak-v2.webp',tile=2.6)
walnut=material('Walnut joinery',(.15,.075,.03),.32,texture='aura-american-walnut-v2.webp',tile=2.4)
marble=material('Honed travertine',(.58,.5,.39),.27,texture='aura-roman-travertine-v2.webp',tile=4)
darkstone=material('Dark mineral plinth',(.025,.022,.019),.3,texture='aura-nero-marquina-v2.webp',tile=2)
bronze=material('Patinated bronze',(.34,.20,.075),.26,.88,bump=.001)
metal=material('Blackened track',(.012,.014,.014),.32,.55,bump=0)
joint=material('Recessed joints',(.12,.10,.075),.8,bump=0)
glow=emission('Warm opal diffuser',(1,.68,.34),4)
sky=emission('Rooflight diffuse sky',(.64,.79,1),.7)
wall={'white-cube':white,'nocturne':charcoal,'pavilion':stone}[ROOM]
floor={'white-cube':concrete,'nocturne':oak,'pavilion':marble}[ROOM]
ceiling=oak if ROOM=='nocturne' else white
for mat,role in [(wall,'wall'),(floor,'floor'),(ceiling,'ceiling')]:
 # Shared white plaster on walls and ceiling needs independent surface controls.
 pass
ceiling=ceiling.copy();ceiling.name='Ceiling finish';ceiling['surfaceRole']='ceiling'
wall['surfaceRole']='wall';floor['surfaceRole']='floor'
obstacles=[]
surfaces=[]

def uv_metric(o,tile):
 uv=o.data.uv_layers.active or o.data.uv_layers.new(name='UVMap')
 for poly in o.data.polygons:
  normal=poly.normal;axis=max(range(3),key=lambda i:abs(normal[i]))
  axes=[i for i in range(3) if i!=axis]
  for li in poly.loop_indices:
   p=o.data.vertices[o.data.loops[li].vertex_index].co
   uv.data[li].uv=(p[axes[0]]/tile,p[axes[1]]/tile)

def box(name,p,size,mat,collection='ARCHITECTURE',bevel=.012,role='architecture',rotation=0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=vec(p));o=bpy.context.object;o.name=name
 o.dimensions=(size[0],size[2],size[1]);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 o.rotation_euler.z=rotation
 if mat:o.data.materials.append(mat);uv_metric(o,mat.get('tile_metres',3))
 if bevel:
  mod=o.modifiers.new('Crafted edge radius','BEVEL');mod.width=bevel;mod.segments=3
  mod=o.modifiers.new('Weighted architectural normals','WEIGHTED_NORMAL')
 move(o,collection);tag(o,role)
 if collection=='OVERHEAD':o['lieuva_overhead']=True
 return o

def collider(name,p,size,rot=0):
 o=box('COLLIDER_'+name,p,size,None,'COLLISION',0,'collider',rot);o.hide_render=True;o.display_type='WIRE';o['aura_collision']='solid'
 if p[1]-size[1]/2<1.75 and p[1]+size[1]/2>.1:obstacles.append((p[0],p[2],size[0]/2,size[2]/2,rot))
 return o

def solid(name,p,size,mat=wall,rot=0,bevel=.012):
 o=box(name,p,size,mat,rotation=rot,bevel=bevel);collider(name,p,size,rot);return o

def empty(name,p,role,**extras):
 o=bpy.data.objects.new(name,None);COL['ANCHORS'].objects.link(o);o.location=vec(p);tag(o,role,**extras);return o

def surface(sid,p,width,height,ry=0,zone='main'):
 # Plane local x/y maps to browser horizontal/up; +normal faces the interior.
 bpy.ops.mesh.primitive_plane_add(size=1,location=vec(p));o=bpy.context.object;o.name='SURFACE_'+sid
 o.rotation_euler=(math.pi/2,0,ry);o.scale=(width,height,1);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
 move(o,'SURFACES');tag(o,'surface',aura_surface_id=sid,aura_zone=zone,aura_width=width,aura_height=height)
 o.hide_render=True;o.display_type='WIRE';surfaces.append(sid)
 empty('ART_ANCHOR_'+sid, (p[0],1.75,p[2]),'art-anchor',aura_surface_id=sid,aura_eye_line=1.75,aura_zone=zone)

# Exact protected floor and wall planes. Thickness lies outside the room.
box('SHELL_Floor',(0,-.10,0),(W,.2,D),floor,'SHELL',.01,'floor')
for sid,p,sz,ry in [('north',(0,H/2,-D/2-.12),(W+.48,H,.24),0),('south',(0,H/2,D/2+.12),(W+.48,H,.24),math.pi),('west',(-W/2-.12,H/2,0),(.24,H,D),math.pi/2),('east',(W/2+.12,H/2,0),(.24,H,D),-math.pi/2)]:
 o=box('SHELL_'+sid,p,sz,wall,'SHELL',.006,'shell');o['aura_surface_id']=sid
 collider('outer_'+sid,p,sz)
 pp=(0,H/2,-D/2) if sid=='north' else (0,H/2,D/2) if sid=='south' else (-W/2,H/2,0) if sid=='west' else (W/2,H/2,0)
 surface(sid,pp,W if sid in ['north','south'] else D,H,ry)

# Lower shadow gaps, overhead trim. No added object intrudes in the editable envelope.
for z in [-D/2,D/2]:
 box('Shadow gap',(0,.035,z),(W,.035,.02),joint,bevel=0)
 box('Ceiling shadow gap',(0,H-.03,z),(W,.025,.03),metal,'OVERHEAD',0)
for x in [-W/2,W/2]:box('Side ceiling gap',(x,H-.03,0),(.03,.025,D),metal,'OVERHEAD',0)

def light(name,p,target,energy,color,size=1,shape='DISK',size_y=None):
 data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.color=color;data.shape=shape;data.size=size
 if size_y is not None:data.size_y=size_y
 o=bpy.data.objects.new(name,data);COL['BEAUTY_LIGHTS'].objects.link(o);o.location=vec(p)
 o.rotation_euler=(Vector(vec(target))-o.location).to_track_quat('-Z','Y').to_euler();tag(o,'light',lieuva_beauty_only=True)
 return o

def track(z,x0,x1,y=H-.15,count=6):
 box('Recessed track',((x0+x1)/2,y,z),(x1-x0,.045,.055),metal,'OVERHEAD',.008)
 for i in range(count):
  x=x0+(i+.5)*(x1-x0)/count
  box('Track luminaire',(x,y-.1,z),(.09,.16,.18),metal,'OVERHEAD',.012)
  box('Opal lens',(x,y-.19,z),(.065,.018,.085),glow,'OVERHEAD',.005)

if ROOM=='white-cube':
 for s in [-1,1]:solid('Gallery reveal',(s*W*.31,H*.36,-D/2+D*.1+.18),(.16,H*.72,D*.2))
 # Ceiling physically surrounds a broad asymmetric rooflight.
 for p,sz in [((-3, H+.10,0),(10,.2,D)),((7,H+.10,0),(2,.2,D)),((4,H+.10,-5.2),(4,.2,1.6)),((4,H+.10,5.2),(4,.2,1.6))]:box('Ceiling slab',p,sz,ceiling,'OVERHEAD',.012,'ceiling')
 for x in [2,6]:box('Deep rooflight reveal',(x,H+.4,0),(.13,.8,8.8),white,'OVERHEAD')
 for z in [-4.4,4.4]:box('Rooflight end reveal',(4,H+.4,z),(4,.8,.13),white,'OVERHEAD')
 for z in [-4,-2,0,2,4]:box('Rooflight mullion',(4,H+.85,z),(4,.07,.045),metal,'OVERHEAD',.004)
 box('Rooflight sky',(4,H+1.05,0),(4,.035,8.7),sky,'OVERHEAD',0)
 track(-4.1,-7,1);track(3.7,-7,1)
 light('Daylight roof',(4,H+.8,0),(0,0,-2),2000,(.86,.92,1),4,'RECTANGLE',8)
 light('Wall wash',(-1,H-.35,-3.8),(0,2,-6),950,(1,.9,.76),8,'RECTANGLE',.5)
elif ROOM=='nocturne':
 for s in [-1,1]:solid('Angled gallery wing',(s*W*.34,H*.35,-D*.17),(.18,H*.7,D*.31),rot=s*-.34)
 # Stage footprint matches the existing placement exclusion, including sculpture.
 bpy.ops.mesh.primitive_cylinder_add(vertices=64,radius=1.6,depth=.18,location=vec((0,.09,.65)))
 o=bpy.context.object;o.name='Sculptural stage';o.data.materials.append(darkstone);move(o,'ARCHITECTURE');tag(o,'architecture');uv_metric(o,2)
 collider('stage',(0,.7,.65),(3.3,1.4,3.3))
 box('Ceiling slab',(0,H+.10,0),(W,.2,D),ceiling,'OVERHEAD',.02,'ceiling')
 for i in range(70):box('Timber acoustic batten',(0,H-.04,-D/2+.09+i*D/70),(W,.09,.08),oak,'OVERHEAD',.007)
 for z in [-3.1,0,3.1]:
  box('Timber cross beam',(0,H*.73,z),(W*.68,.18,.30),walnut,'OVERHEAD',.016)
  track(z,-6.5,6.5,count=6)
 for x in [-7.55,7.55]:
  box('Cove glow',(x,H-.13,0),(.03,.025,D-.3),glow,'OVERHEAD',.003)
  light('Concealed cove',(x,H-.23,0),(0,H-1,0),420,(1,.67,.37),D-.4,'RECTANGLE',.15)
 bpy.ops.mesh.primitive_torus_add(major_radius=1.85,minor_radius=.032,major_segments=96,minor_segments=12,location=vec((0,H-.62,.35)))
 o=bpy.context.object;o.name='Bronze pendant';o.data.materials.append(bronze);move(o,'OVERHEAD');tag(o,'architecture',lieuva_overhead=True)
 for x,z in [(-1.5,-.7),(1.5,-.7),(0,2)]:box('Pendant cable',(x,H-.28,z),(.009,.65,.009),metal,'OVERHEAD',0)
 light('Pendant softbox',(0,H-.7,.35),(0,.8,.65),280,(1,.76,.48),2.4)
 light('North wall wash',(0,4.8,-4.0),(0,2,-5.75),850,(1,.77,.51),4,'RECTANGLE',.35)
else:
 # Existing five-zone plan, 5.6 m clear portals and one divider at z=0.
 for xs in [-1,1]:
  for zs in [-1,1]:
   for ds in [-1,1]:solid('Side gallery partition',(xs*10,2.76,zs*21+ds*5.9),(.34,5.52,6.2))
   solid('Gallery portal header',(xs*10,4.535,zs*21),(.34,1.97,5.6))
   solid('Cross gallery wall',(xs*15,2.76,zs*12),(10,5.52,.34))
   solid('Junction pier',(xs*10,2.76,zs*12),(.72,5.52,.72),bevel=.025)
   for z in [zs*12]:
    box('Upper limestone pier',(xs*10,6.5,z),(.72,3,.72),stone,'OVERHEAD',.025)
   side='west' if xs<0 else 'east';prefix='north' if zs<0 else 'south'
   surface(prefix+'-cross-'+side,(xs*15,2.275,zs*12-zs*.175),10,4.55,0 if zs<0 else math.pi,prefix+'-'+side)
   surface(prefix+'-room-'+side,(xs*15,2.275,zs*12+zs*.175),10,4.55,math.pi if zs<0 else 0,prefix+'-'+side)
 solid('Central exhibition divider',(0,2.275,0),(14,4.55,.26),bevel=.015)
 surface('divider-front',(0,2.275,.175),14,4.55,0,'central-axis')
 surface('divider-back',(0,2.275,-.175),14,4.55,math.pi,'central-axis')
 for x in [-15,15]:box('Side gallery roof',(x,H+.1,0),(10,.2,D),ceiling,'OVERHEAD',.015,'ceiling')
 for x in [-8.25,8.25]:
  box('Atrium cornice',(x,7.65,0),(3.5,.65,D),stone,'OVERHEAD',.025)
  box('Clerestory wall',(x/abs(x)*10,6.6,0),(.26,2.1,D),stone,'OVERHEAD',.01)
 for z in [-29,29]:box('Atrium end wall',(0,6.8,z),(20,2.5,.3),stone,'OVERHEAD')
 for z in range(-28,30,4):box('Rooflight transom',(0,8.18,z),(13.2,.10,.10),bronze,'OVERHEAD',.01)
 for x in [-6.6,-3.3,0,3.3,6.6]:box('Rooflight longitudinal bar',(x,8.18,0),(.07,.1,58),bronze,'OVERHEAD',.008)
 box('High sky',(0,8.9,0),(13.2,.02,58),sky,'OVERHEAD',0)
 for z in [-21,-7,7,21]:light('Atrium daylight',(0,8.6,z),(0,0,z),3400,(.87,.93,1),12,'RECTANGLE',12)
 for xs in [-1,1]:
  for zs in [-1,1]:
   track(zs*16,xs*15-4,xs*15+4,count=4)
   light('Side gallery wash',(xs*15,5.1,zs*20),(xs*15,1.7,zs*12),1100,(1,.89,.71),6)
 for i in range(1,20):
  # Fine floor joints are geometry, not albedo reused as a height map.
  box('Floor transverse joint',(0,.001,-30+i*3),(40,.001,.012),joint,bevel=0)
 for x in range(-18,20,3):box('Floor longitudinal joint',(x,.001,0),(.012,.001,60),joint,bevel=0)

# Authored semantic navigation. Grid cells are excluded conservatively around obstacles.
def blocked(x,z,pad=.45):
 for ox,oz,hx,hz,r in obstacles:
  dx=x-ox;dz=z-oz;c=math.cos(r);s=math.sin(r)
  if abs(c*dx-s*dz)<hx+pad and abs(s*dx+c*dz)<hz+pad:return True
 return False
step=.5;verts=[];faces=[]
for ix in range(int((W-.9)/step)):
 x=-W/2+.45+(ix+.5)*step
 for iz in range(int((D-.9)/step)):
  z=-D/2+.45+(iz+.5)*step
  if any(blocked(x+dx,z+dz) for dx in [-step/2,0,step/2] for dz in [-step/2,0,step/2]):continue
  n=len(verts);verts += [vec((x-step/2,.015,z-step/2)),vec((x+step/2,.015,z-step/2)),vec((x+step/2,.015,z+step/2)),vec((x-step/2,.015,z+step/2))]
  faces += [(n,n+2,n+1),(n,n+3,n+2)]
mesh=bpy.data.meshes.new('Walkable cells');mesh.from_pydata(verts,[],faces);mesh.update()
o=bpy.data.objects.new('NAVMESH_Main',mesh);COL['NAVIGATION'].objects.link(o);tag(o,'navmesh',aura_agent_radius=.36);o.hide_render=True;o.display_type='WIRE'
empty('WALK_START',(0,1.75,D/2-1.5),'walk-start');empty('WALK_LOOK',(0,1.75,-D/2+1),'walk-look')
for zid,p in ([('central-axis',(0,1.75,14)),('north-west',(-15,1.75,-21)),('north-east',(15,1.75,-21)),('south-west',(-15,1.75,21)),('south-east',(15,1.75,21))] if ROOM=='pavilion' else [('main',(0,1.75,3))]):
 empty('ROOM_'+zid,p,'room',aura_zone=zid);empty('VIEW_'+zid,p,'view',aura_zone=zid)

# Staging is explicitly isolated and never exported as customer-room content.
def artwork(name,p,size,filename,angle=0):
 frame=box(name+' frame',p,(size[0]+.055,size[1]+.055,.07),metal,'BEAUTY_STAGING',.006,'beauty',angle)
 m=material(name,(1,1,1),.65,bump=0)
 t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(ROOT/'public/assets/artworks'/filename),check_existing=True)
 m.node_tree.links.new(t.outputs['Color'],m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
 # A mapped plane with dedicated non-repeating artwork UVs.
 bpy.ops.mesh.primitive_plane_add(size=1,location=vec((p[0]+math.sin(angle)*.041,p[1],p[2]+math.cos(angle)*.041)))
 o=bpy.context.object;o.name=name;o.rotation_euler=(math.pi/2,0,angle);o.scale=(size[0],size[1],1);o.data.materials.append(m);move(o,'BEAUTY_STAGING');tag(o,'beauty')
 light(name+' wash',(p[0]+math.sin(angle)*1.3,p[1]+2.0,p[2]+math.cos(angle)*1.3),p,170 if ROOM!='pavilion' else 300,(1,.87,.67),.8)

files=['aura-cliffs-study.webp','aura-forest-study.webp','aura-pigment-study.webp']
if ROOM=='pavilion':
 artwork('Axis study',(0,2.4,.15),(2.6,3.4),files[2])
 for s in [-1,1]:artwork('Side study',(s*15,2.45,12.18),(2.5,3.3),files[0 if s<0 else 1])
else:
 for i,x in enumerate([-2.9,0,2.9]):artwork('Field study '+str(i),(x,2.2,-D/2+.018),(1.55,2.25),files[i])
 artwork('Arrival study',(-W/2+.02,2.15,.5),(1.8,2.5),files[0],math.pi/2)

# Cast bronze ribbon: a smooth asymmetrical loop with a sculpted cross-section.
def ribbon(p,scale,collection='BEAUTY_STAGING'):
 vs=[];fs=[];n=128;m=20
 for i in range(n):
  u=2*math.pi*i/n
  radius=.67+.13*math.cos(3*u)
  center=Vector((radius*math.cos(u),.16*math.sin(2*u),radius*math.sin(u)))
  radial=Vector((math.cos(u),0,math.sin(u)));depth=Vector((0,1,0));twist=.65*math.sin(u)+u
  a=radial*math.cos(twist)+depth*math.sin(twist);b=-radial*math.sin(twist)+depth*math.cos(twist)
  for j in range(m):
   v=2*math.pi*j/m;q=center+a*(.27*math.cos(v))+b*(.13*math.sin(v))
   vs.append(vec((p[0]+q.x*scale,p[1]+q.z*scale,p[2]+q.y*scale)))
 for i in range(n):
  for j in range(m):fs.append((i*m+j,((i+1)%n)*m+j,((i+1)%n)*m+(j+1)%m,i*m+(j+1)%m))
 me=bpy.data.meshes.new('Bronze ribbon topology');me.from_pydata(vs,[],fs);me.update();o=bpy.data.objects.new('Cast bronze ribbon',me);COL[collection].objects.link(o);o.data.materials.append(bronze);tag(o,'beauty' if collection=='BEAUTY_STAGING' else 'architecture')
 for f in me.polygons:f.use_smooth=True
if ROOM=='nocturne':
 box('Staged stone pedestal',(0,.40,.65),(1.45,.65,1.45),darkstone,'BEAUTY_STAGING',.025,'beauty');ribbon((0,1.46,.65),.88)
elif ROOM=='pavilion':
 box('Sculpture podium',(0,.23,9),(3.7,.46,2.25),stone,'BEAUTY_STAGING',.025,'beauty');ribbon((0,1.5,9),1.2)
else:
 box('Walnut bench seat',(-3,.43,1.6),(3.5,.15,.85),walnut,'BEAUTY_STAGING',.06,'beauty')
 for x in [-4.4,-1.6]:box('Bench leg',(x,.19,1.6),(.16,.38,.78),walnut,'BEAUTY_STAGING',.018,'beauty')

# Environment and photographed architecture camera.
world=bpy.data.worlds.new('LIEUVA studio sky');world.use_nodes=True;scene.world=world
world.node_tree.nodes['Background'].inputs[0].default_value=(.62,.72,.9,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.14 if ROOM=='nocturne' else .35
if ROOM!='nocturne':
 data=bpy.data.lights.new('Afternoon sun','SUN');data.energy=1.5;data.angle=.055
 o=bpy.data.objects.new('Afternoon sun',data);COL['BEAUTY_LIGHTS'].objects.link(o);o.rotation_euler=(.38,-.48,-.5)
 # The sky card lights the opening but is transparent to direct sunlight.
 for o in COL['OVERHEAD'].objects:
  if 'sky' in o.name.lower():o.visible_shadow=False
light('Camera bounce',(0,3,D/2-1),(0,2,0),250 if ROOM=='nocturne' else 700,(1,.9,.76),5)
positions={'white-cube':((-4.9,1.8,4.85),(-.3,2.1,-4.2),23),'nocturne':((-.6,1.8,5.15),(0,2.0,-4.2),22),'pavilion':((0,2.0,24),(0,3.4,0),25)}
p,target,lens=positions[ROOM]
data=bpy.data.cameras.new('Beauty 01');o=bpy.data.objects.new('Beauty 01',data);COL['CAMERAS'].objects.link(o);o.location=vec(p);o.rotation_euler=(Vector(vec(target))-o.location).to_track_quat('-Z','Y').to_euler();data.lens=lens;data.clip_end=200;scene.camera=o
scene.render.engine='CYCLES';scene.cycles.samples=args.samples;scene.cycles.use_denoising=True;scene.cycles.seed=612
scene.cycles.max_bounces=8;scene.cycles.diffuse_bounces=4;scene.cycles.glossy_bounces=4;scene.cycles.sample_clamp_indirect=4
prefs=bpy.context.preferences.addons['cycles'].preferences
try:
 if args.device=='CPU':raise RuntimeError('CPU selected')
 prefs.compute_device_type='METAL';prefs.get_devices()
 for device in prefs.devices:device.use=device.type=='METAL'
 scene.cycles.device='GPU'
except Exception:scene.cycles.device='CPU'
scene.cycles.device=args.device
scene.render.threads_mode='FIXED';scene.render.threads=6
scene.render.resolution_x=args.width;scene.render.resolution_y=round(args.width*9/16);scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_depth='16'
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure={'white-cube':.1,'nocturne':.25,'pavilion':.15}[ROOM]
# Revision-specific adjustments are explicit and retained for reproducibility.
if args.round>=2:
 scene.view_settings.exposure = {'white-cube':-.65,'nocturne':-.65,'pavilion':-.4}[ROOM]
 for l in COL['BEAUTY_LIGHTS'].objects:
  if l.type!='LIGHT':continue
  if 'wash' in l.name.lower():l.data.energy *= .4
  if 'bounce' in l.name.lower():l.data.energy *= .25
  if 'cove' in l.name.lower():l.data.energy *= .32
 if ROOM=='nocturne':
  for n in charcoal.node_tree.nodes:
   if n.type=='MIX_RGB':n.inputs[2].default_value=(.095,.072,.051,1)
  # Wider view preserves the pendant and spatial depth around the central piece.
  scene.camera.data.lens=18
  scene.camera.location=vec((-.8,2.1,5.3))
  scene.camera.rotation_euler=(Vector(vec((0,2.5,-4)))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
 if ROOM=='pavilion':
  scene.camera.data.lens=18
  scene.camera.location=vec((0,2.0,25.5))
  scene.camera.rotation_euler=(Vector(vec((0,3.3,0)))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
  for l in COL['BEAUTY_LIGHTS'].objects:
   if l.type=='LIGHT' and 'daylight' in l.name.lower():l.data.energy*=.4
  sky.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=.16
 if ROOM=='white-cube':
  scene.camera.data.lens=19
  scene.camera.location=vec((-5.6,2.15,5.5))
  scene.camera.rotation_euler=(Vector(vec((0,1.85,-3.8)))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
 # Suppress glossy glare on fictional art; room lighting still affects the canvas.
 for m in bpy.data.materials:
  if m.name.startswith(('Field study','Arrival study','Axis study','Side study')):
   p=m.node_tree.nodes.get('Principled BSDF')
   if p:p.inputs['Specular IOR Level'].default_value=0

if args.round>=3 and ROOM=='nocturne':
 scene.view_settings.exposure=-.30
 light('Sculpture edge',(2.8,3.4,.2),(0,1.4,.65),120,(1,.9,.72),1.5,'RECTANGLE',.4)
 for j in range(1,48):
  z=-D/2+j*D/48
  box('Oak board joint',(0,.002,z),(W,.001,.005),joint,'BEAUTY_STAGING',0,'beauty')
  for x in [-4.2+(j%3)*1.5,.4+(j%3)*1.5]:box('Staggered end joint',(x,.002,z+.12),(.005,.001,.24),joint,'BEAUTY_STAGING',0,'beauty')
if args.round>=3 and ROOM=='pavilion':
 for s in [-1,1]:artwork('Axial side study',(s*9.80,2.5,15.3),(2.2,3.25),files[0 if s<0 else 1],math.pi/2 if s<0 else -math.pi/2)
 for l in COL['BEAUTY_LIGHTS'].objects:
  if l.type=='LIGHT' and l.data.type=='SUN':
   l.data.energy=2.8
   l.rotation_euler=(Vector(vec((-5,0,3)))-Vector(vec((3,9,16)))).to_track_quat('-Z','Y').to_euler()
if args.round>=3 and ROOM=='white-cube':
 sky.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength'].default_value=.08
 for l in COL['BEAUTY_LIGHTS'].objects:
  if l.type!='LIGHT':continue
  if l.data.type=='SUN':
   l.data.energy=2.3
   l.rotation_euler=(Vector(vec((-3,0,-2)))-Vector(vec((4,8,-1)))).to_track_quat('-Z','Y').to_euler()
  if l.name=='Daylight roof':l.data.energy*=.45
 # Dark walnut is a beauty staging finish only.
 p=walnut.node_tree.nodes.get('Principled BSDF')
 links=[l for l in walnut.node_tree.links if l.to_node==p and l.to_socket.name=='Base Color']
 if links:
  source=links[0].from_socket;walnut.node_tree.links.remove(links[0])
  mix=walnut.node_tree.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(.3,.23,.16,1)
  walnut.node_tree.links.new(source,mix.inputs[1]);walnut.node_tree.links.new(mix.outputs[0],p.inputs['Base Color'])
OUT.mkdir(parents=True,exist_ok=True)
for img in bpy.data.images:
 if img.source=='FILE':img.pack()
scene['lieuva_render_round']=args.round
scene['lieuva_beauty_staging']='Fictional demo studies and staged objects; excluded from runtime exports.'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(ROOM+'.blend')),compress=True)
renderpath=OUT/(ROOM+f'-r{args.round}-{args.width}.png')
if not args.no_render:
 scene.render.filepath=str(renderpath);bpy.ops.render.render(write_still=True)

if args.export:
 # Export snapshots only. The saved beauty source retains its editable shaders and objects.
 for c in ['BEAUTY_STAGING','BEAUTY_LIGHTS','CAMERAS']:
  for o in list(COL[c].objects):bpy.data.objects.remove(o,do_unlink=True)
 scene.camera=None
 for mat in bpy.data.materials:
  if not mat.use_nodes:continue
  p=mat.node_tree.nodes.get('Principled BSDF')
  if not p:continue
  # Procedural bump is beauty-only. Export keeps albedo, metallic and roughness.
  for link in list(mat.node_tree.links):
   if link.to_node==p and link.to_socket.name=='Normal':mat.node_tree.links.remove(link)
  if mat.name=='Warm charcoal plaster':
   sys.path.insert(0,str(Path(__file__).resolve().parent))
   from runtime_bakes import prepare_runtime_charcoal
   prepare_runtime_charcoal(mat,OUT/'runtime-maps')
 # Merge static details by material and overhead policy, but never functional nodes.
 for collection in ['ARCHITECTURE','OVERHEAD']:
  batches={}
  for o in list(COL[collection].objects):
   if o.type=='MESH':batches.setdefault((o.data.materials[0].name if o.data.materials else '',o.get('aura_role','architecture')),[]).append(o)
  for (matname,role),objects in batches.items():
   bpy.ops.object.select_all(action='DESELECT')
   for item in objects:item.select_set(True)
   bpy.context.view_layer.objects.active=objects[0]
   # Applying before joining retains each authored bevel; mobile decimates only these cosmetic batches.
   for item in objects:
    bpy.context.view_layer.objects.active=item
    for mod in list(item.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
   bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
   o=bpy.context.object;o.name=collection+'_'+matname;tag(o,role)
   if collection=='OVERHEAD':o['lieuva_overhead']=True
 if args.bake_ao:
  sys.path.insert(0,str(Path(__file__).resolve().parent))
  from runtime_bakes import bake_runtime_occlusion
  bake_runtime_occlusion(scene,COL,OUT/'runtime-maps',ROOM)
  bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(ROOM+'-runtime.blend')),compress=True)
 for size,suffix in [(1024,'desktop'),(512,'mobile')]:
  for img in bpy.data.images:
   if img.size[0]>size or img.size[1]>size:
    factor=size/max(img.size);img.scale(round(img.size[0]*factor),round(img.size[1]*factor));img.pack()
  if suffix=='mobile':
   for collection in ['ARCHITECTURE','OVERHEAD']:
    for o in COL[collection].objects:
     if o.type=='MESH':
      m=o.modifiers.new('Mobile coplanar reduction','DECIMATE');m.decimate_type='DISSOLVE';m.angle_limit=.06
  target=ROOT/'public/assets/templates/premium-v2';target.mkdir(parents=True,exist_ok=True)
  bpy.ops.export_scene.gltf(filepath=str(target/(ROOM+'-'+suffix+'.glb')),export_format='GLB',export_extras=True,export_apply=True,export_yup=True,export_lights=False,export_cameras=False,export_animations=False,export_image_format='JPEG',export_jpeg_quality=85)
 print('SURFACE_CONTRACT',json.dumps({'id':ROOM,'surfaces':sorted(surfaces),'obstacles':len(obstacles),'nav_triangles':len(faces)}))
print('LIEUVA COMPLETE',ROOM,'source/export only' if args.no_render else str(renderpath))
