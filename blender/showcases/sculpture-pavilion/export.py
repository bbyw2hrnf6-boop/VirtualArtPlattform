"""Cycles transport atlases + independent PBR sculpture surfaces. Never edits beauty source."""
import bpy, json, time
from pathlib import Path
H=Path(__file__).resolve().parent;OUT=H.parents[2]/'public/assets/showcases/sculpture-pavilion';MAP=H/'lightmaps';MAP.mkdir(exist_ok=True);OUT.mkdir(parents=True,exist_ok=True);s=bpy.context.scene
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='METAL'
s.cycles.device='GPU';s.cycles.samples=96;s.cycles.use_adaptive_sampling=False;s.render.bake.margin=12;s.render.bake.use_clear=True;s.render.image_settings.color_depth='8';bpy.context.preferences.filepaths.save_version=0
report=[];pending=[]
def select(obs):
 bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=obs[0]
for o in list(s.objects):
 if o.type!='MESH':continue
 select([o])
 for m in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=m.name)
# Keep animated hierarchies; merge only rigid siblings with matching artwork identity.
for root in [o for o in list(s.objects) if o.type=='EMPTY']:
 obs=[o for o in root.children if o.type=='MESH']
 if len(obs)>1:
  select(obs);bpy.ops.object.join();bpy.context.object.name=root.name+' geometry'

def uv(obs):
 select(obs)
 # Tessellate delivery geometry BEFORE baking: collapsing afterwards damages atlas islands.
 for o in obs:
  if len(o.data.polygons)>1500 and o.get('artwork_id'):
   bpy.context.view_layer.objects.active=o;mod=o.modifiers.new('Delivery tessellation','DECIMATE');mod.ratio=.65 if o.get('artwork_id') in ['S01','S04'] else .35 if o.get('artwork_id') else .18;bpy.ops.object.modifier_apply(modifier=mod.name)
 select(obs)
 for o in obs:
  if not o.data.uv_layers:o.data.uv_layers.new(name='Lightmap')
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.15,island_margin=.005);bpy.ops.object.mode_set(mode='OBJECT')
def target(obs,name,size):
 im=bpy.data.images.new(name,width=size,height=size,alpha=False,float_buffer=False)
 for o in obs:
  for slot in o.material_slots:
   slot.material=slot.material.copy();m=slot.material
   for n in m.node_tree.nodes:n.select=False
   t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=im;t.select=True;m.node_tree.nodes.active=t
 return im
def save(im):
 im.filepath_raw=str(MAP/(im.name+'.png'));im.file_format='PNG';im.save()
 if im.name.endswith('_transport'):
  import shutil
  (MAP/'raw').mkdir(exist_ok=True);shutil.copy2(im.filepath_raw, MAP/'raw'/Path(im.filepath_raw).name)
for room in ['A','B','C']:
 for group in ['floor','architecture','furniture']:
  obs=[o for o in s.objects if o.type=='MESH' and o.get('pavilion_room')==room and o.get('pavilion_group')==group and not any('glass' in m.name.lower() or 'ribbon' in m.name.lower() for m in o.data.materials)]
  if not obs:continue
  select(obs);bpy.ops.object.join();o=bpy.context.object;o.name=f'{room}_{group}_transport';uv([o]);size=4096 if room in ['A','C'] and group=='floor' else 1024 if group=='furniture' else 2048;im=target([o],o.name,size)
  s.render.bake.use_pass_color=True;s.render.bake.use_pass_direct=True;s.render.bake.use_pass_indirect=True
  print('BAKE',o.name,size,flush=True);start=time.monotonic();bpy.ops.object.bake(type='DIFFUSE');save(im);pending.append((o,im));report.append({'atlas':im.name,'pixels':size,'samples':96,'seconds':round(time.monotonic()-start,2)})
# All transport completes before emission replacements are installed.
for o,im in pending:
 m=bpy.data.materials.new(o.name);m.use_nodes=True;m.node_tree.nodes.clear();t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=im;e=m.node_tree.nodes.new('ShaderNodeEmission');out=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(t.outputs[0],e.inputs[0]);m.node_tree.links.new(e.outputs[0],out.inputs[0]);o.data.materials.clear();o.data.materials.append(m)
 for f in o.data.polygons:f.material_index=0
 o['baked_diffuse']=True
 if '_floor_' in o.name:o['reflective_floor']=True
# Modelled sculptures retain metallic / transmission shaders and surface relief.
for aid in ['S01','S02','S03','S04','S05']:
 obs=[o for o in s.objects if o.type=='MESH' and o.get('artwork_id')==aid];uv(obs);size=2048 if aid!='S04' else 1024
 im=target(obs,aid+'_albedo',size);replaced=[]
 for o in obs:
  for m in o.data.materials:
   nt=m.node_tree;out=next(n for n in nt.nodes if n.type=='OUTPUT_MATERIAL');principled=next((n for n in nt.nodes if n.type=='BSDF_PRINCIPLED'),None)
   if not principled:continue
   e=nt.nodes.new('ShaderNodeEmission');base=principled.inputs['Base Color']
   if base.is_linked:nt.links.new(base.links[0].from_socket,e.inputs[0])
   else:e.inputs[0].default_value=base.default_value
   nt.links.new(e.outputs[0],out.inputs['Surface']);replaced.append((m,principled,out,e))
 s.cycles.samples=1;print('PBR',aid,flush=True);bpy.ops.object.bake(type='EMIT');save(im)
 for m,q,out,e in replaced:m.node_tree.links.new(q.outputs[0],out.inputs[0]);m.node_tree.nodes.remove(e)
 normal=target(obs,aid+'_normal',size);normal.colorspace_settings.name='Non-Color';bpy.ops.object.bake(type='NORMAL');save(normal)
 for o in obs:
  for m in o.data.materials:
   q=next((n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None)
   if not q:continue
   t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=im;m.node_tree.links.new(t.outputs[0],q.inputs['Base Color'])
   n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=normal;nm=m.node_tree.nodes.new('ShaderNodeNormalMap');m.node_tree.links.new(n.outputs[0],nm.inputs[1]);m.node_tree.links.new(nm.outputs[0],q.inputs['Normal'])
# glTF ignores procedural roof emission: set a neutral luminous sky pane for runtime.
for m in bpy.data.materials:
 if m.name.startswith('Low iron roof glass'):
  q=m.node_tree.nodes.get('Principled BSDF')
  if q:q.inputs['Transmission Weight'].default_value=0;q.inputs['Emission Color'].default_value=(.66,.78,1,1);q.inputs['Emission Strength'].default_value=1.8
select([o for o in s.objects if o.type in ['MESH','EMPTY']]);bpy.ops.file.make_paths_relative();bpy.ops.wm.save_as_mainfile(filepath=str(H/'sculpture-runtime.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'sculpture-pavilion-desktop.glb'),export_format='GLB',use_selection=True,export_extras=True,export_image_format='JPEG',export_jpeg_quality=92,export_cameras=False,export_lights=False,export_animations=True,export_force_sampling=True)
for im in bpy.data.images:
 cap=2048 if '_floor_' in im.name else 1024
 if max(im.size)>cap:ratio=cap/max(im.size);im.scale(round(im.size[0]*ratio),round(im.size[1]*ratio))
bpy.ops.export_scene.gltf(filepath=str(OUT/'sculpture-pavilion-mobile.glb'),export_format='GLB',use_selection=True,export_extras=True,export_image_format='JPEG',export_jpeg_quality=87,export_cameras=False,export_lights=False,export_animations=True,export_force_sampling=True)
(H/'bake-report.json').write_text(json.dumps(report,indent=2)+'\n');print('EXPORT COMPLETE',flush=True)
