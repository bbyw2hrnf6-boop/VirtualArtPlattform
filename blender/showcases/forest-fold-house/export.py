"""Bake room-scale Cycles transport; keep clear glass, water and metal view-dependent.
Never changes the editable master. Run after the approved source build.
"""
import bpy,json,time,runpy,hashlib
from pathlib import Path
H=Path(__file__).resolve().parent;OUT=H.parents[2]/'artifacts/forest/raw';MAP=H/'lightmaps';MAP.mkdir(exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
s=bpy.context.scene;bpy.context.preferences.filepaths.save_version=0
runpy.run_path(str(H/'validate_source.py'))['validate']()
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='METAL'
s.cycles.device='GPU';s.cycles.samples=256;s.cycles.use_adaptive_sampling=False
s.cycles.use_auto_tile=True;s.cycles.tile_size=512
s.render.bake.margin=16;s.render.bake.margin_type='EXTEND';s.render.bake.use_clear=True
s.render.bake.use_pass_color=True;s.render.bake.use_pass_direct=True;s.render.bake.use_pass_indirect=True
def select(obs):
 bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0]
# Evaluate modifiers once without thousands of dependency-graph operator rebuilds.
deps=bpy.context.evaluated_depsgraph_get()
converted=[]
for o in list(s.objects):
 if o.type not in ['MESH','CURVE']:continue
 if o.modifiers or o.type=='CURVE':
  data=bpy.data.meshes.new_from_object(o.evaluated_get(deps),preserve_all_data_layers=True,depsgraph=deps)
  converted.append((o,data))
for o,data in converted:
 if o.type=='CURVE':
  replacement=bpy.data.objects.new(o.name+'_mesh',data);replacement.matrix_world=o.matrix_world
  for k in o.keys():replacement[k]=o[k]
  s.collection.objects.link(replacement);bpy.data.objects.remove(o,do_unlink=True)
 else:o.modifiers.clear();o.data=data
print('EVALUATED SOURCE',flush=True)
bpy.data.orphans_purge(do_recursive=True)
# Meshes only contain one authored surface shader at this stage.
def special(o):return any(m.name.startswith(('M04','M08','M09','Blackened','3000K')) for m in o.data.materials)
groups={}
for o in list(s.objects):
 if o.type!='MESH' or special(o):continue
 g=o.get('forest_group','')
 if g in ['planting','landscape','water','lights']:continue
 # Give the long oak ceiling its own chart: wall/facade detail no longer
 # competes with hundreds of board faces for the same atlas texels.
 if '_CEILING' in o.name:g+='_ceiling'
 g+= '_walk' if o.get('walk_surface') else ''
 groups.setdefault(g,[]).append(o)
pending=[];report=[]
# A completed atlas may be reused only for this exact source and bake revision.
# This makes a long local GPU job resumable without mixing old/new lighting.
source_hash=hashlib.sha256((H/'forest-fold-house.blend').read_bytes()).hexdigest()
cache_path=MAP/'cache-v3.json'
cache=json.loads(cache_path.read_text()) if cache_path.exists() else {}
if cache.get('source')!=source_hash:cache={'source':source_hash,'groups':{}}
for name,obs in groups.items():
 select(obs);bpy.ops.object.join();o=bpy.context.object;o.name=name+'_transport'
 # SurfaceUV feeds the scanned shaders. A second chart receives illumination.
 chart=o.data.uv_layers.new(name='Lightmap');o.data.uv_layers.active=chart
 chart.active_render=True
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.2,island_margin=.004);bpy.ops.object.mode_set(mode='OBJECT')
 size=4096 if name in ['W0','W1','E0','E1','exterior'] else 2048
 for slot in o.material_slots:
  slot.material=slot.material.copy();m=slot.material
 maps={};start=time.monotonic()
 for kind,resolution in [('DIFFUSE',size),('NORMAL',min(2048,size)),('ROUGHNESS',min(1024,size))]:
  suffix='' if kind=='DIFFUSE' else '-'+kind.lower()
  path=MAP/(name+suffix+'.png')
  if name in cache['groups'] and path.exists():
   im=bpy.data.images.load(str(path),check_existing=True)
   if kind!='DIFFUSE':im.colorspace_settings.name='Non-Color'
   maps[kind]=im;continue
  im=bpy.data.images.new(o.name+suffix,width=resolution,height=resolution,alpha=False,float_buffer=False)
  if kind!='DIFFUSE':im.colorspace_settings.name='Non-Color'
  for m in o.data.materials:
   for n in m.node_tree.nodes:n.select=False
   n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;n.select=True;m.node_tree.nodes.active=n
  s.cycles.samples=256 if kind=='DIFFUSE' else 1
  s.render.bake.normal_space='TANGENT'
  print('BAKE',name,kind,resolution,flush=True);bpy.ops.object.bake(type=kind)
  im.filepath_raw=str(path);im.file_format='PNG';im.save();maps[kind]=im
 pending.append((o,maps['DIFFUSE'],maps['NORMAL'],maps['ROUGHNESS']))
 cache['groups'][name]=True;cache_path.write_text(json.dumps(cache,indent=2)+'\n')
 report.append({'group':name,'resolution':size,'samples':256,'normalResolution':min(2048,size),'roughnessResolution':min(1024,size),'sourceSha256':source_hash,'seconds':round(time.monotonic()-start,2)})
 (H/'bake-report.json').write_text(json.dumps(report,indent=2)+'\n')
if not cache.get('denoised'):
 runpy.run_path(str(H/'denoise.py'))['apply']([(o,im) for o,im,_,_ in pending],H)
 cache['denoised']=True;cache_path.write_text(json.dumps(cache,indent=2)+'\n')
for o,im,normal_image,roughness_image in pending:
 m=bpy.data.materials.new(o.name);m.use_nodes=True;m.node_tree.nodes.clear();nt=m.node_tree
 uv=nt.nodes.new('ShaderNodeUVMap');uv.uv_map='Lightmap'
 e=nt.nodes.new('ShaderNodeBsdfPrincipled');out=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(e.outputs[0],out.inputs[0])
 # Fixed diffuse GI plus moving dielectric highlights. Black diffuse avoids
 # lighting the baked albedo twice; the normal/roughness remain view-dependent.
 e.inputs['Base Color'].default_value=(0,0,0,1);e.inputs['Emission Strength'].default_value=1
 for image,socket in [(im,'Emission Color'),(roughness_image,'Roughness'),(normal_image,'Normal')]:
  n=nt.nodes.new('ShaderNodeTexImage');n.image=image;nt.links.new(uv.outputs['UV'],n.inputs['Vector'])
  if socket=='Normal':
   normal=nt.nodes.new('ShaderNodeNormalMap');normal.uv_map='Lightmap';nt.links.new(n.outputs['Color'],normal.inputs['Color']);nt.links.new(normal.outputs['Normal'],e.inputs[socket])
  else:nt.links.new(n.outputs['Color'],e.inputs[socket])
 o.data.materials.clear();o.data.materials.append(m)
 for p in o.data.polygons:p.material_index=0
 o['baked_diffuse']=True
 # Only the final atlas UV is needed by this material. Keep the delivery small.
 for layer in list(o.data.uv_layers):
  if layer.name!='Lightmap':o.data.uv_layers.remove(layer)
# Browser transparent glazing: no thick screen-space refraction pass. The
# physically refractive source remains unchanged in the master and 4K renders.
for m in bpy.data.materials:
 if not m.name.startswith(('M08','M09')):continue
 nt=m.node_tree;nt.nodes.clear();p=nt.nodes.new('ShaderNodeBsdfPrincipled');out=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(p.outputs[0],out.inputs[0])
 if m.name.startswith('M08'):
  p.inputs['Base Color'].default_value=(.7,.85,.78,1);p.inputs['Alpha'].default_value=.12;p.inputs['Metallic'].default_value=.3;p.inputs['Roughness'].default_value=.07;m.surface_render_method='BLENDED'
 else:
  p.inputs['Base Color'].default_value=(.12,.20,.16,1);p.inputs['Metallic'].default_value=.55;p.inputs['Roughness'].default_value=.13
# Batch one-off static vegetation and hardware by material, preserving walkable
# meshes. Repeated scanned plants deliberately share one Blender mesh. Keep
# those objects separate so glTF emits one mesh plus lightweight transform
# nodes instead of expanding the same fern/tree geometry thousands of times.
mesh_users={}
for o in s.objects:
 if o.type=='MESH':mesh_users[o.data]=mesh_users.get(o.data,0)+1
bins={}
for o in list(s.objects):
 if o.type!='MESH' or o.get('baked_diffuse'):continue
 if mesh_users.get(o.data,0)>1:continue
 # Local foliage clusters can be rejected by the view frustum. A single
 # woodland-wide leaf mesh made every tree cost vertices in every room.
 cell=tuple(int(v//12) for v in (o.matrix_world @ o.data.vertices[0].co)[:2]) if o.get('forest_group') in ['planting','landscape'] and len(o.data.vertices) else ()
 key=(tuple(m.name for m in o.data.materials),cell)
 bins.setdefault(key,[]).append(o)
for key,obs in bins.items():
 if len(obs)>1:select(obs);bpy.ops.object.join();bpy.context.object.name=' / '.join(key[0])+str(key[1])
runpy.run_path(str(H/'delivery_materials.py'))['apply']()
runpy.run_path(str(H/'validate_delivery.py'))['validate']()
bpy.data.orphans_purge(do_recursive=True)
select([o for o in s.objects if o.type=='MESH'])
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(H/'forest-runtime.blend'))
for tier in ['desktop','mobile']:
 if tier=='mobile':
  for im in bpy.data.images:
   if max(im.size)>1024:im.scale(1024,1024)
 bpy.ops.export_scene.gltf(filepath=str(OUT/f'forest-fold-house-{tier}.glb'),export_format='GLB',use_selection=True,export_extras=True,export_image_format='JPEG',export_jpeg_quality=93 if tier=='desktop' else 88,export_cameras=False,export_lights=False)
print('FOREST EXPORT COMPLETE',flush=True)
