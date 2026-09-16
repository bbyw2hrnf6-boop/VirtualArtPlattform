"""Sculpture Pavilion: one metric Cycles source; five modelled works, no billboards.
Blender 5.2 --background --python build.py -- --render A-SW --width 1280 --samples 64
"""
import bpy, bmesh, math, json, argparse, sys
from pathlib import Path
from mathutils import Vector, Matrix
from math import sin,cos,pi,sqrt,exp
H=Path(__file__).resolve().parent; ROOT=H.parents[2]
p=argparse.ArgumentParser();p.add_argument('--render',default='');p.add_argument('--width',type=int,default=1280);p.add_argument('--samples',type=int,default=64);a=p.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
L=json.loads((H/'source/planning/layout.json').read_text());P=json.loads((H/'plan-mesh.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True);s=bpy.context.scene;s.unit_settings.system='METRIC';s.render.engine='CYCLES'
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='METAL'
s.cycles.device='GPU';s.cycles.samples=a.samples;s.cycles.use_denoising=True;s.cycles.adaptive_threshold=.006;s.cycles.max_bounces=16;s.cycles.diffuse_bounces=8;s.cycles.glossy_bounces=8;s.cycles.transmission_bounces=12;s.cycles.use_light_tree=True
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=0
s.render.image_settings.file_format='PNG';s.render.image_settings.color_depth='16';s.render.fps=24;s.frame_end=289
s.world=bpy.data.worlds.new('Daylight through roof only');s.world.use_nodes=True;wn=s.world.node_tree.nodes;sky=wn.new('ShaderNodeTexSky');sky.sky_type='MULTIPLE_SCATTERING';sky.sun_elevation=.88;sky.sun_rotation=2.0;sky.sun_size=.025;sky.altitude=.3;s.world.node_tree.links.new(sky.outputs[0],wn['Background'].inputs[0]);wn['Background'].inputs[1].default_value=.35
s['lieuva_showcase']='sculpture-pavilion';s['coordinate_system']='X east, Y north, Z up; metres';s['reference_provenance']='Owner supplied AI-generated concepts; original procedural 3D reconstruction'
room='A';group='architecture';art=None;parent=None

def tag(o):
 o['pavilion_room']=room;o['pavilion_group']=group
 if art:o['artwork_id']=art
 if parent:o.parent=parent
 return o

def mat(name,col,rough=.5,metal=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;q=m.node_tree.nodes.get('Principled BSDF');q.inputs['Base Color'].default_value=(*col,1);q.inputs['Roughness'].default_value=rough;q.inputs['Metallic'].default_value=metal;return m

def noise(m,scale,strength=.13,distance=.002):
 n=m.node_tree.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=scale;n.inputs['Detail'].default_value=3
 tex=m.node_tree.nodes.new('ShaderNodeTexCoord');m.node_tree.links.new(tex.outputs['Object'],n.inputs['Vector'])
 b=m.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=strength;b.inputs['Distance'].default_value=distance;m.node_tree.links.new(n.outputs['Fac'],b.inputs['Height']);m.node_tree.links.new(b.outputs[0],m.node_tree.nodes['Principled BSDF'].inputs['Normal']);return n

def ramp(m,n,low,high,p0=.2,p1=.8):
 r=m.node_tree.nodes.new('ShaderNodeValToRGB');r.color_ramp.elements[0].position=p0;r.color_ramp.elements[0].color=(*low,1);r.color_ramp.elements[1].position=p1;r.color_ramp.elements[1].color=(*high,1);m.node_tree.links.new(n.outputs[0],r.inputs[0]);m.node_tree.links.new(r.outputs[0],m.node_tree.nodes['Principled BSDF'].inputs['Base Color'])
plaster=mat('Warm mineral plaster',(.72,.68,.59),.8);noise(plaster,150,.12,.0015)
terrazzo=mat('Ivory terrazzo · fine aggregate',(.56,.51,.42),.22)
t=terrazzo.node_tree.nodes.new('ShaderNodeTexVoronoi');t.inputs['Scale'].default_value=95;t.distance='EUCLIDEAN';tc=terrazzo.node_tree.nodes.new('ShaderNodeNewGeometry');terrazzo.node_tree.links.new(tc.outputs['Position'],t.inputs['Vector']);ramp(terrazzo,t,(.26,.22,.16),(.65,.59,.49),.19,.32);noise(terrazzo,230,.12,.0007)
stone=mat('Porous ivory limestone',(.62,.54,.41),.54);n=noise(stone,110,.30,.0025);ramp(stone,n,(.48,.405,.30),(.64,.55,.43),.19,.75)
trav=mat('Cross cut travertine',(.6,.52,.38),.42);n=noise(trav,22,.4,.009);ramp(trav,n,(.3,.245,.17),(.66,.58,.44))
bronze=mat('Satin champagne bronze',(.57,.34,.12),.3,1);n=noise(bronze,12,.2,.001);ramp(bronze,n,(.21,.15,.065),(.64,.40,.17),.2,.72)
patina=mat('Recessed bronze patina',(.045,.12,.10),.57,.75);noise(patina,30,.17,.002)
ash=mat('Pale ash · flowing growth grain',(.6,.42,.2),.39)
nt=ash.node_tree.nodes;tc=nt.new('ShaderNodeTexCoord');mp=nt.new('ShaderNodeVectorMath');mp.operation='MULTIPLY';mp.inputs[1].default_value=(28,28,.8);ash.node_tree.links.new(tc.outputs['Object'],mp.inputs[0]);n=noise(ash,3,.18,.001);ash.node_tree.links.new(mp.outputs[0],n.inputs['Vector']);ramp(ash,n,(.48,.32,.145),(.71,.55,.32),.16,.84)
metal=mat('Brushed titanium museum hardware',(.32,.30,.26),.27,.9)
black=mat('Graphite fittings',(.018,.019,.017),.45,.6)
membrane=mat('Ivory silk membrane',(.8,.74,.60),.42);membrane.node_tree.nodes['Principled BSDF'].inputs['Subsurface Weight'].default_value=.12
amber=mat('Blown amber glass',(.86,.56,.15),.13);sage=mat('Blown sage glass',(.51,.66,.43),.13);glass=mat('Low iron roof glass',(.93,.97,1),.045)
for m in [amber,sage,glass]:q=m.node_tree.nodes['Principled BSDF'];q.inputs['Transmission Weight'].default_value=1;q.inputs['IOR'].default_value=1.46
for m in [amber,sage]:noise(m,18,.08,.0005)
glow=mat('Concealed 3500 K ribbon',(.95,.76,.47),.5);q=glow.node_tree.nodes['Principled BSDF'];q.inputs['Emission Color'].default_value=(1,.79,.51,1);q.inputs['Emission Strength'].default_value=4

def mesh(name,verts,faces,m,smooth=False):
 d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);s.collection.objects.link(o);d.materials.append(m)
 for f in d.polygons:f.use_smooth=smooth
 return tag(o)

def bevel(o,width=.02,segments=3):
 b=o.modifiers.new('Crafted edge radius','BEVEL');b.width=width;b.segments=segments;return o

def box(name,loc,dim,m,b=.0):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=dim;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
 if b:bevel(o,b)
 return tag(o)

def uvball(name,loc,scale,m):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,radius=1,location=loc);o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(m)
 for f in o.data.polygons:f.use_smooth=True
 return tag(o)

def tube(name,pts,r,m,cyclic=False,radii=None):
 c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=10;c.bevel_depth=r;c.bevel_resolution=3;c.resolution_u=8;c.use_fill_caps=True;sp=c.splines.new('BEZIER');sp.bezier_points.add(len(pts)-1)
 for i,(b,co) in enumerate(zip(sp.bezier_points,pts)):b.co=co;b.handle_left_type=b.handle_right_type='AUTO';b.radius=radii[i] if radii else 1
 sp.use_cyclic_u=cyclic;o=bpy.data.objects.new(name,c);s.collection.objects.link(o);c.materials.append(m);return tag(o)

def cylinder(name,loc,r,depth,m,axis=(0,0,1),vertices=64):
 bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc);o=bpy.context.object;o.name=name;o.rotation_euler=Vector(axis).to_track_quat('Z','Y').to_euler();o.data.materials.append(m);bevel(o,.008,3)
 for f in o.data.polygons:f.use_smooth=len(f.vertices)==4
 return tag(o)

def bar(name,a,b,r,m):
 mid=(Vector(a)+Vector(b))/2;return cylinder(name,mid,r,(Vector(b)-Vector(a)).length,m,Vector(b)-Vector(a),24)

def light(name,pos,target,power,size=1,col=(1,.88,.7),kind='AREA'):
 d=bpy.data.lights.new(name,kind);d.energy=power;d.color=col
 if kind=='AREA':d.shape='DISK';d.size=size
 elif kind=='SPOT':d.spot_size=1.2;d.spot_blend=.7;d.shadow_soft_size=.09
 o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector(target)-Vector(pos)).to_track_quat('-Z','Y').to_euler();return o

def height(id,x,y):return 8 if id=='A' else 5 if id=='B' else 7-.04*(y-15)**2

def flat(name,polys,z,m,thick=0):
 vs=[];fs=[]
 for poly in polys:
  area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(poly,poly[1:]+poly[:1]))
  if area<0:poly=list(reversed(poly))
  if 'roof' in name or 'ceiling' in name:poly=list(reversed(poly))
  off=len(vs);vs += [(x,y,z(x,y) if callable(z) else z) for x,y in poly];fs.append(tuple(range(off,len(vs))))
 o=mesh(name,vs,fs,m)
 bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001);bm.to_mesh(o.data);bm.free()
 if callable(z):
  bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.triangulate(bm,faces=list(bm.faces));bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=4,use_grid_fill=True)
  for v in bm.verts:v.co.z=z(v.co.x,v.co.y)
  bm.to_mesh(o.data);bm.free()
  for f in o.data.polygons:f.use_smooth=True
 if thick:mod=o.modifiers.new('Real slab thickness','SOLIDIFY');mod.thickness=thick
 return o

envelopes={}
def finish_wall(wall):
 bm=bmesh.new();bm.from_mesh(wall.data)
 for f in bm.faces:f.smooth=True
 for e in bm.edges:e.smooth=e.is_manifold and e.calc_face_angle()<math.radians(35)
 bm.to_mesh(wall.data);bm.free()
 bevel(wall,.018,4);wall.modifiers[-1].harden_normals=True
 wall.modifiers.new('Weighted architectural normals','WEIGHTED_NORMAL').keep_sharp=True

for spec in L['rooms']:
 room=spec['id'];r=P['rooms'][room];group='floor';o=flat(room+' terrazzo floor',r['floor'],0,terrazzo,.18);o['reflective_floor']=True
 group='architecture';poly=r['boundary'];vs=[];fs=[]
 for x,y in poly[:-1]:vs.extend([(x,y,0),(x,y,height(room,x,y))])
 n=len(poly)-1
 for i in range(n):j=(i+1)%n;fs.append((i*2,j*2,j*2+1,i*2+1))
 wall=mesh(room+' curved envelope with clear portals',vs,fs,plaster,True)
 sol=wall.modifiers.new('Outward 300 mm wall','SOLIDIFY');sol.thickness=.3
 bpy.ops.object.select_all(action='DESELECT');wall.select_set(True);bpy.context.view_layer.objects.active=wall;bpy.ops.object.modifier_apply(modifier=sol.name)
 for c in L['connectors']:
  x0,y0,x1,y1=c['bounds']
  # Cut a rectangular opening. Rounding the cutting solid in all three axes
  # leaves recessed slivers behind the reveal where it meets a curved wall.
  cutter=box('Temporary portal cutter',((x0+x1)/2,(y0+y1)/2,(c['height']-1)/2),(x1-x0,y1-y0,c['height']+1),plaster)
  bpy.context.view_layer.objects.active=cutter
  for mod in list(cutter.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
  bpy.context.view_layer.objects.active=wall;mod=wall.modifiers.new('Clear '+c['id']+' passage','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(cutter,do_unlink=True)
 envelopes[room]=wall
 roof=flat(room+' opaque roof',r['ceiling'],lambda x,y:height(room,x,y),plaster,.22);roof['overview_hide']=True
 gl=flat(room+' roof glazing',r['glass'],lambda x,y:height(room,x,y)+.15,glass,.024);gl['overview_hide']=True
 # A concealed warm architectural line follows the upper perimeter.
 pts=[(x*.994 if room=='A' else x,y*.994 if room=='A' else y,height(room,x,y)-.18) for x,y in poly[:-1]]
 o=tube(room+' fine perimeter cove',pts,.013,glow,True);o['overview_hide']=True
 if room=='A':
  for radx,rady,z in [(3,2,8.08),(3.06,2.06,8.08)]:tube('Oculus metal reveal',[(radx*cos(t*2*pi/96),rady*sin(t*2*pi/96),z) for t in range(96)],.023,metal,True)['overview_hide']=True
  for x in [-1.5,0,1.5]:yy=2*sqrt(1-(x/3)**2);bar('Oculus mullion',(x,-yy,8.16),(x,yy,8.16),.018,metal)['overview_hide']=True
  for t in range(12):
   ang=2*pi*t/12;pos=(7*cos(ang),5.7*sin(ang),6.7);cylinder('Recessed museum spotlight',pos,.09,.13,metal);light('3500K atrium wash',pos,(2*cos(ang),2*sin(ang),1.1),210,.2,kind='SPOT')
  light('Oculus diffuse daylight',(0,0,8.3),(0,0,0),1500,5.2,(.82,.91,1))
 elif room=='B':
  for x in range(13,22):bar('Ribbon mullion',(x,4.8,5.17),(x,5.4,5.17),.012,metal)['overview_hide']=True
  light('North rooflight',(17,5.1,5.3),(17,0,1),850,4,(.85,.93,1))
  for x,y in [(12,-3),(22,-3),(12,3),(22,3)]:light('Glass accent',(x,y,4.65),(17,0,2.8),150,.35,kind='SPOT');cylinder('Museum spot housing',(x,y,4.9),.065,.17,metal)
 else:
  for x in L['rooflights']['C']['rib_x']:
   o=tube('Vault transverse rib',[(x,y,7-.04*(y-15)**2-.08) for y in [10+i*.25 for i in range(41)]],.15,plaster);o['overview_hide']=True
  for x in L['rooflights']['C']['x_centers']:
   for xx in [x-.3,x+.3]:tube('Roof slit bronze edge',[(xx,y,7-.04*(y-15)**2+.08) for y in [12+i*.25 for i in range(25)]],.013,metal)['overview_hide']=True
   light('Vault sky bounce',(x,15,7.1),(x,15,0),480,2,(.85,.93,1))
  for x in [-1,7,15]:
   for y in [11,19]:light('Kinetic accent',(x,y,5.7),(8,15,1.3),180,.3,kind='SPOT')

# A and B touch at their inner boundaries, so their 300 mm wall volumes
# overlap. Union those volumes before edge finishing; overlapping portal
# return faces otherwise remain even when the connecting shell is correct.
wa=envelopes['A'];wb=envelopes['B'];bpy.context.view_layer.objects.active=wa
mod=wa.modifiers.new('Watertight Atrium Gallery junction','BOOLEAN');mod.operation='UNION';mod.solver='EXACT';mod.object=wb;bpy.ops.object.modifier_apply(modifier=mod.name)
bpy.data.objects.remove(wb,do_unlink=True)
# Separate delivery batches at existing polygon boundaries without introducing
# caps or duplicate faces. They still form the same continuous wall volume.
data=wa.data.copy();wb=bpy.data.objects.new('B curved envelope with clear portals',data);s.collection.objects.link(wb);wb['pavilion_room']='B';wb['pavilion_group']='architecture';envelopes['B']=wb
for ob,keep_b in [(wa,False),(wb,True)]:
 bm=bmesh.new();bm.from_mesh(ob.data)
 bmesh.ops.delete(bm,geom=[f for f in bm.faces if (f.calc_center_median().x>=9.85)!=keep_b],context='FACES')
 bm.to_mesh(ob.data);bm.free()
for wall in envelopes.values():finish_wall(wall)

for c in L['connectors']:
 group='floor';room='A' if c['id'] in ['AB','AC','ENTRY'] else 'B';r=P['connectors'][c['id']];o=flat(c['id']+' threshold',r['floor'],0,terrazzo,.18);o['reflective_floor']=True
 group='architecture';shell=flat(c['id']+' continuous passage ceiling and sides',r['shell_ceiling'],c['height'],plaster);parts=[shell]
 for poly in r['shell_parts']:
  for a0,b0 in zip(poly,poly[1:]):
   cx=(a0[0]+b0[0])/2;cy=(a0[1]+b0[1])/2
   # Only the longitudinal straight edges are walls; curved ends meet the
   # room's existing return. ENTRY also has a closed outer end.
   x0,y0,x1,y1=c['bounds'];eps=.0001
   side=(abs(cy-y0)<eps or abs(cy-y1)<eps) if c['id'] in ['AB','ENTRY'] else (abs(cx-x0)<eps or abs(cx-x1)<eps)
   if not side and not(c['id']=='ENTRY' and abs(cx-x0)<eps):continue
   parts.append(mesh(c['id']+' passage side',[(a0[0],a0[1],0),(b0[0],b0[1],0),(b0[0],b0[1],c['height']),(a0[0],a0[1],c['height'])],[(0,1,2,3)],plaster))
 # One welded shell: separate bevelled boards exposed daylight at every corner.
 bpy.ops.object.select_all(action='DESELECT')
 for o in parts:o.select_set(True)
 bpy.context.view_layer.objects.active=shell;bpy.ops.object.join()
 bm=bmesh.new();bm.from_mesh(shell.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.0001);bm.to_mesh(shell.data);bm.free()
 m=shell.modifiers.new('Continuous 300 mm passage shell','SOLIDIFY');m.thickness=.3;m.use_even_offset=True
 if c['id']!='ENTRY':
  x0,y0,x1,y1=c['bounds'];light('Portal pool',((x0+x1)/2,(y0+y1)/2,c['height']-.12),((x0+x1)/2,(y0+y1)/2,0),90,1)
room='A';group='architecture'
box('Closed flush entrance',(-12.96,0,1.74),(.07,2.98,3.48),plaster,.006);bar('Door pull',(-12.89,.28,1.12),(-12.89,.28,1.52),.014,bronze)
# One gently curved bench, exactly as planned.
room='B';group='furniture';vs=[];fs=[]
for i in range(49):
 u=i/48;x=19.8+2.4*u;y=-3+.12*sin(pi*u)
 for yy,z in [(y-.325,0),(y+.325,0),(y+.325,.42),(y-.325,.42)]:vs.append((x,yy,z))
for i in range(48):
 for j in range(4):k=i*4+j;fs.append((k,i*4+(j+1)%4,(i+1)*4+(j+1)%4,k+4))
fs += [(3,2,1,0),(192,193,194,195)];bevel(mesh('Single curved travertine bench',vs,fs,trav),.035,4)

# Sculpture builders use local coordinates and retain exact named components.
def begin(id):
 global room,group,art,parent
 spec=next(i for i in L['objects'] if i['id']==id);room=spec['room'];group='sculpture';art=id;parent=bpy.data.objects.new(id+' · '+spec['name'],None);s.collection.objects.link(parent);parent.location=spec['position'];parent.rotation_euler.z=math.radians(spec['rotation_z']);parent['artwork_id']=id;parent['title']=spec['name'];return parent

def end():
 global parent,art
 parent=None;art=None

def surface(name,fn,nu,nv,m,wrap=False):
 vs=[fn(i/nu,j/nv) for i in range(nu+1) for j in range(nv+1)];fs=[]
 for i in range(nu):
  for j in range(nv):k=i*(nv+1)+j;fs.append((k,k+1,k+nv+2,k+nv+1))
 return mesh(name,vs,fs,m,True)

begin('S01')
cylinder('S01 integrated limestone foot',(0,0,.07),.9,.14,stone)
# Sculpted continuous facial shell: cranium, jaw, cheeks, nose, lips, closed lids.
profile=[(0,.56,.47),(.22,.53,.44),(.58,.40,.4),(.82,.43,.45),(1,.5,.59),(1.2,.59,.67),(1.5,.72,.68),(1.8,.77,.69),(2.1,.78,.70),(2.4,.77,.69),(2.65,.71,.64),(2.85,.60,.54),(3,.43,.40),(3.1,.20,.20),(3.14,.001,.001)]
def interp(z,idx):
 for i,(aa,bb) in enumerate(zip(profile,profile[1:])):
  if aa[0]<=z<=bb[0]:
   t=(z-aa[0])/(bb[0]-aa[0]);pp=profile[max(0,i-1)];nn=profile[min(len(profile)-1,i+2)];m0=(bb[idx]-pp[idx])/(bb[0]-pp[0]);m1=(nn[idx]-aa[idx])/(nn[0]-aa[0]);h=bb[0]-aa[0]
   return (2*t**3-3*t*t+1)*aa[idx]+(t**3-2*t*t+t)*h*m0+(-2*t**3+3*t*t)*bb[idx]+(t**3-t*t)*h*m1
 return .001

def gauss(x,z,cx,cz,sx,sz):return exp(-((x-cx)/sx)**2-((z-cz)/sz)**2)
def face(u,v):
 z=.14+3.0*u;theta=-2.08+3.44*v;x=interp(z,1)*sin(theta);y=-interp(z,2)*cos(theta)
 front=max(0,cos(theta))**6
 d=.24*gauss(x,z,0,1.98,.115,.37)+.28*gauss(x,z,0,1.72,.16,.12)
 d+=.095*(gauss(x,z,.13,1.70,.09,.06)+gauss(x,z,-.13,1.70,.09,.06))
 d+=.11*gauss(x,z,0,1.22,.32,.17)+.07*gauss(x,z,0,1.43,.30,.06)+.065*gauss(x,z,0,1.51,.27,.042)
 d-=.045*gauss(x,z,0,1.475,.30,.018)
 for sign in [-1,1]:
  d-=.12*gauss(x,z,sign*.30,2.02,.22,.15)
  d+=.14*gauss(x,z,sign*.30,1.995,.195,.06)+.062*gauss(x,z,sign*.32,2.2,.24,.06)+.075*gauss(x,z,sign*.45,1.8,.20,.13)
 d-=.045*(gauss(x,z,.3,1.986,.18,.014)+gauss(x,z,-.3,1.986,.18,.014))
 y-=d*front;return(x,y,z)
head=surface('S01 sculpted calm face and smooth right cheek',face,144,112,stone);sol=head.modifiers.new('Open cranium wall','SOLIDIFY');sol.thickness=.075
# Sculpted closed eyelid rims catch grazing light; the eye remains closed.
def skin(x,z,offset=0):
 theta=math.asin(max(-.999,min(.999,x/interp(z,1))));co=list(face((z-.14)/3,(theta+2.08)/3.44));co[1]-=offset;return co
for sign in [-1,1]:
 pts=[skin(sign*.3+(.18*(j/12*2-1)),1.989-.024*sin(pi*j/12),.007) for j in range(13)]
 tube('S01 closed eyelid '+str(sign),pts,.013,stone,radii=[.15,.4,.7,.9,1,1,1,1,.9,.7,.4,.2,.1])
for upper in [True,False]:
 pts=[skin((j/16*2-1)*.255,1.487+(.025 if upper else -.034)*sin(pi*j/16),.006) for j in range(17)]
 tube('S01 sculpted lip '+str(upper),pts,.021 if upper else .029,stone,radii=[max(.06,sin(pi*j/16)) for j in range(17)])
# Seven branching roots wrap a genuinely hollow rear cranium.
for i in range(7):
 z=1.12+i*.265
 pts=[(.65,-.4,z),(.81,-.06,z+.12),(.87,.34,min(3.1,z+.33)),(.46,.73,min(3.10,z+.18)),(-.13,.76,z-.06),(-.59,.36,max(.25,z-.4))]
 tube(f'S01 main root {i+1:02}',pts,.078,stone,radii=[.55,1,1.15,1,.85,.5])
 tube(f'S01 root {i+1:02} branch',[pts[2],(.56,.61,max(.4,z-.10)),(.17,.74,max(.3,z-.37)),(-.20,.62,max(.2,z-.50))],.051,stone,radii=[1.4,1,.8,.4])
for i in range(3):tube('S01 rear neck root '+str(i),[(-.43+i*.41,.3,.15),(-.45+i*.4,.51,.63),(-.4+i*.48,.70,1.12),(-.35+i*.42,.72,1.6)],.075,stone,radii=[1.4,.8,1,.6])
uvball('S01 right ear',(-.735,-.01,1.84),(.10,.15,.24),stone)
# Recessed nostril indentations, physically small cavities rather than paint.
for sign in [-1,1]:uvball('S01 nostril recess',(sign*.1,-.966,1.686),(.037,.012,.019),mat('Nostril shadow '+str(sign),(.19,.15,.10),.8))
end()

begin('S02');cylinder('S02 oval bronze foot',(0,0,.045),.48,.09,bronze)
for strand,phase in enumerate([0,pi,pi*.55]):
 def ribbon(u,v,phase=phase):
  z=.09+2.36*u;theta=2*pi*u+phase;radius=.50*sin(pi*u)**.55+.06;angle=theta+(v-.5)*.74;x=radius*cos(angle)+.10*sin(pi*u);y=radius*sin(angle)*.83;return(x,y,z)
 o=surface('S02 bronze flowing band '+str(strand+1),ribbon,112,12,bronze);sol=o.modifiers.new('Cast band thickness','SOLIDIFY');sol.thickness=.065;sol.material_offset=1;o.data.materials.append(patina);bevel(o,.023,3)
uvball('S02 joined crown',(.0,.0,2.405),(.08,.075,.045),bronze)
end()

begin('S03')
cylinder('S03 integrated ash foot',(0,0,.045),.28,.09,ash)
def folded(u,v):
 th=.10+(2*pi-.20)*v;z=.06+2.14*u;phase=th+u*2.8;radius=(.25+.32*sin(pi*u)**.7)*(.8+.2*cos(5*phase));radius*=1-.68*u**8
 x=radius*sin(th)-.19*u**4;y=-radius*cos(th);z+=.08*cos(th*2)*u**8
 return(x,y,z)
o=surface('S03 five continuous helical lobes and deep seam',folded,128,128,ash);sol=o.modifiers.new('Carved solid shell','SOLIDIFY');sol.thickness=.09;bevel(o,.012,3)
end()

begin('S04');uvball('S04 central amber seed',(0,0,.2),(.26,.26,.53),amber);cylinder('S04 bronze hub',(0,0,-.22),.22,.14,bronze)
def petal(u,v,outer=False):
 w=sin(pi*u)**.8*(.4 if outer else .27);rad=.15+(1.65 if outer else .80)*u;angle=(v-.5)*pi;x=rad;y=w*(v*2-1);z=(-.23-.95*u+ .37*sin(pi*u)) if outer else (-.22+1.42*u-.12*sin(pi*u));z+=w*.38*(1-(v*2-1)**2)+.04*sin(u*5*pi)*sin(pi*v);return(x,y,z)
for outer in [False,True]:
 for i in range(6):
  angle=2*pi*i/6+(pi/6 if outer else 0)
  o=surface(f'S04 {"sage outer" if outer else "amber inner"} leaf {i+1}',lambda u,v:petal(u,v,outer),48,20,sage if outer else amber);o.rotation_euler.z=angle;sol=o.modifiers.new('Closed blown-glass 18 mm wall','SOLIDIFY');sol.thickness=.018
  pts=[petal(j/12,.5,outer) for j in range(13)];o=tube('S04 leaf midrib',pts,.008,bronze);o.rotation_euler.z=angle
  o=tube('S04 cast leaf holder',[(0,0,-.26),(.23,0,-.20),(.38,0,-.05 if not outer else -.3)],.023,bronze);o.rotation_euler.z=angle
for i in range(3):
 t=2*pi*i/3;pos=(.45*cos(t),.45*sin(t),.35);bar('S04 suspension cable '+str(i+1),pos,(pos[0],pos[1],2),.005,metal);uvball('S04 cable collet',pos,(.03,.03,.065),bronze)
end()

root=begin('S05')
def body(u,v):
 x=-3.5+7*u;r=.46*sin(pi*u)**.75;th=2*pi*v;return(x,r*cos(th),1.23+r*sin(th))
surface('S05 ash seed spindle',body,160,56,ash)
for i in range(8):
 x=-2.5+i*5/7;r=.46*sin(pi*(x+3.5)/7)**.75+.07
 pts=[(x,r*cos(j*2*pi/64),1.23+r*sin(j*2*pi/64)) for j in range(64)];tube('S05 structural rib '+str(i+1),pts,.055,ash,True)
 for j in range(8):
  t=j*pi/4;uvball('S05 rib countersunk bronze bolt',(x,(r+.035)*cos(t),1.23+(r+.035)*sin(t)),(.037,.037,.037),bronze)
for side in [-1,1]:
 for i in range(4):
  x=-2.1+i*1.4;parent=root
  joint=bpy.data.objects.new(f'S05 articulated leg {side} {i+1}',None);s.collection.objects.link(joint);joint.parent=root;joint.location=(x,side*.25,1.05);joint['kinetic_part']='leg';parent=joint
  knee=(.16,side*.79,-.37);foot=(.36,side*1.28,-1.01)
  uvball('S05 hip bearing',(0,0,0),(.11,.11,.11),bronze);bar('S05 upper leg',(0,0,0),knee,.047,bronze);bar('S05 lower leg',knee,foot,.030,bronze);uvball('S05 knee bearing',knee,(.079,.079,.079),bronze);cylinder('S05 round foot',foot,.10,.055,bronze)
  for frame in range(1,290,12):joint.rotation_euler.y=math.radians(6)*sin((frame-1)/288*2*pi+i*pi/2+side);joint.keyframe_insert(data_path='rotation_euler',frame=frame)
 parent=root;wing=bpy.data.objects.new(f'S05 wing {side}',None);s.collection.objects.link(wing);wing.parent=root;wing.location=(-.8,side*.22,1.65);wing['kinetic_part']='wing';parent=wing
 def wingfn(u,v):
  width=.85*sin(pi*u)**.75;return(2.4*u+(v-.5)*width*1.5,side*(1.35*u+sin(pi*u)*.16),1.38*u+(v-.5)*width*.8+.08*sin(pi*u))
 o=surface('S05 ivory leaf membrane',wingfn,56,20,membrane);sol=o.modifiers.new('Membrane thickness','SOLIDIFY');sol.thickness=.007
 for edge in [0,1]:tube('S05 wing perimeter', [wingfn(i/24,edge) for i in range(25)],.014,bronze)
 tube('S05 wing central spar',[wingfn(i/24,.5) for i in range(25)],.022,bronze)
 for u in [.15,.28,.41,.54,.67,.8,.9]:tube('S05 fine membrane vein',[wingfn(u,j/8) for j in range(9)],.007,bronze)
 for frame in range(1,290,12):wing.rotation_euler.x=side*math.radians(8)*sin((frame-1)/288*2*pi);wing.keyframe_insert(data_path='rotation_euler',frame=frame)
end();s.frame_set(1)
# Exactly one low architectural base per grounded sculpture, in addition to their integral feet.
for spec in L['objects']:
 if spec['id']=='S04':continue
 room=spec['room'];group='furniture';x,y,z=spec['position']
 if spec['id']=='S05':
  # Long low elliptical island supports all eight feet without a second room.
  o=cylinder('S05 low architectural island',(x,y,.09),1,.18,trav);o.scale=(3.85,2,1)
 else:cylinder(spec['id']+' low architectural plinth',(x,y,z/2),1.0 if spec['id']=='S01' else .65,z,trav)
# Gallery identification in real geometry, small bronze letters on limestone.
font_path=ROOT/'src/assets/fonts/InstrumentSerif-Regular.ttf'
for spec in L['objects']:
 room=spec['room'];group='furniture';x,y,z=spec['position'];x-=1.3 if spec['id']!='S05' else 4.1
 plaque=box(spec['id']+' discreet title plinth',(x,y,.27),(.42,.24,.54),trav,.014)
 cu=bpy.data.curves.new(spec['name'],'FONT');cu.body=spec['id']+'\n'+spec['name'];cu.size=.035;cu.extrude=.0005;o=bpy.data.objects.new('Label '+spec['id'],cu);s.collection.objects.link(o);o.location=(x-.17,y-.125,.34);o.rotation_euler=(pi/2,0,0);cu.materials.append(bronze);tag(o)
# Every supplied target camera, plus product cover and object portrait cameras.
def camera(name,pos,target,lens=24):
 d=bpy.data.cameras.new(name);o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=pos;forward=(Vector(target)-o.location).normalized();up=Vector((0,1,0)) if abs(forward.z)>.999 else Vector((0,0,1));right=forward.cross(up).normalized();up=right.cross(forward);o.rotation_euler=Matrix((right,up,-forward)).transposed().to_euler();d.lens=lens;d.clip_end=200;return o
for c in L['cameras']:camera(c['id'],c['position'],c['target'],c.get('lens_mm',20))
camera('Cover',(-6.3,4.5,2.1),(.5,0,2.9),20)
for spec in L['objects']:
 x,y,z=spec['position'];wide=spec['id']=='S05';camera(spec['id']+'-Portrait',(x-(7 if wide else 4.0),y+(5 if wide else -3.4 if spec['id']=='S02' else 2.8),2.0 if not wide else 2.7),(x,y,1.75 if spec['id']!='S04' else 3),48 if not wide else 38)
s.camera=bpy.data.objects[a.render or 'Cover'];s.render.resolution_x=a.width;s.render.resolution_y=round(a.width*9/16);s.render.resolution_percentage=100
# Convert curves for a stable export and bake topology, preserving named roots.
for o in list(s.objects):
 if o.type in ['CURVE','FONT']:
  bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.object.convert(target='MESH')
bpy.ops.file.pack_all();bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(H/'sculpture-pavilion.blend'))
print('BUILT',len(s.objects),'objects',flush=True)
if a.render:
 out=ROOT/'artifacts/sculpture';out.mkdir(parents=True,exist_ok=True);s.render.filepath=str(out/(a.render+'-'+str(a.width)+'.png'));bpy.ops.render.render(write_still=True)
