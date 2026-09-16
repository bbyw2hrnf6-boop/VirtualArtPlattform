"""Bake room-scale Cycles transport; keep clear glass, water and metal view-dependent.
Never changes the editable master. Run after the approved source build.
"""
import bpy,json,time,runpy
from pathlib import Path
H=Path(__file__).resolve().parent;OUT=H.parents[2]/'public/assets/showcases/forest-fold-house';MAP=H/'lightmaps';MAP.mkdir(exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
s=bpy.context.scene;bpy.context.preferences.filepaths.save_version=0
prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='METAL';prefs.get_devices()
for d in prefs.devices:d.use=d.type=='METAL'
s.cycles.device='GPU';s.cycles.samples=128;s.cycles.use_adaptive_sampling=False
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
# Meshes only contain one authored surface shader at this stage.
def special(o):return any(m.name.startswith(('M04','M08','M09','Blackened','3000K')) for m in o.data.materials)
groups={}
for o in list(s.objects):
 if o.type!='MESH' or special(o):continue
 g=o.get('forest_group','')
 if g in ['planting','landscape','water','lights']:continue
 g+= '_walk' if o.get('walk_surface') else ''
 groups.setdefault(g,[]).append(o)
pending=[];report=[]
for name,obs in groups.items():
 select(obs);bpy.ops.object.join();o=bpy.context.object;o.name=name+'_transport'
 if not o.data.uv_layers:o.data.uv_layers.new(name='Lightmap')
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.smart_project(angle_limit=1.2,island_margin=.004);bpy.ops.object.mode_set(mode='OBJECT')
 size=4096 if name in ['W0','W1','E0','E1'] else 2048 if 'furniture' in name or '_walk' in name else 1024
 im=bpy.data.images.new(o.name,width=size,height=size,alpha=False,float_buffer=False)
 for slot in o.material_slots:
  slot.material=slot.material.copy();m=slot.material
  for n in m.node_tree.nodes:n.select=False
  n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im;n.select=True;m.node_tree.nodes.active=n
 print('BAKE',name,size,flush=True);start=time.monotonic();bpy.ops.object.bake(type='DIFFUSE')
 im.filepath_raw=str(MAP/(name+'.png'));im.file_format='PNG';im.save();pending.append((o,im))
 report.append({'group':name,'resolution':size,'samples':128,'seconds':round(time.monotonic()-start,2)})
 (H/'bake-report.json').write_text(json.dumps(report,indent=2)+'\n')
runpy.run_path(str(H/'denoise.py'))['apply'](pending,H)
for o,im in pending:
 m=bpy.data.materials.new(o.name);m.use_nodes=True;m.node_tree.nodes.clear();n=m.node_tree.nodes.new('ShaderNodeTexImage');n.image=im
 e=m.node_tree.nodes.new('ShaderNodeEmission');out=m.node_tree.nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(n.outputs[0],e.inputs[0]);m.node_tree.links.new(e.outputs[0],out.inputs[0])
 o.data.materials.clear();o.data.materials.append(m)
 for p in o.data.polygons:p.material_index=0
 o['baked_diffuse']=True
# Browser transparent glazing: no thick screen-space refraction pass. The
# physically refractive source remains unchanged in the master and 4K renders.
for m in bpy.data.materials:
 if not m.name.startswith(('M08','M09')):continue
 nt=m.node_tree;nt.nodes.clear();p=nt.nodes.new('ShaderNodeBsdfPrincipled');out=nt.nodes.new('ShaderNodeOutputMaterial');nt.links.new(p.outputs[0],out.inputs[0])
 if m.name.startswith('M08'):
  p.inputs['Base Color'].default_value=(.7,.85,.78,1);p.inputs['Alpha'].default_value=.12;p.inputs['Metallic'].default_value=.3;p.inputs['Roughness'].default_value=.07;m.surface_render_method='BLENDED'
 else:
  p.inputs['Base Color'].default_value=(.12,.20,.16,1);p.inputs['Metallic'].default_value=.55;p.inputs['Roughness'].default_value=.13
# Batch static vegetation and hardware by material, preserving walkable meshes.
bins={}
for o in list(s.objects):
 if o.type!='MESH' or o.get('baked_diffuse'):continue
 key=tuple(m.name for m in o.data.materials)
 bins.setdefault(key,[]).append(o)
for key,obs in bins.items():
 if len(obs)>1:select(obs);bpy.ops.object.join();bpy.context.object.name=' / '.join(key)
runpy.run_path(str(H/'delivery_materials.py'))['apply']()
runpy.run_path(str(H/'validate_delivery.py'))['validate']()
select([o for o in s.objects if o.type=='MESH'])
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(H/'forest-runtime.blend'))
for tier in ['desktop','mobile']:
 if tier=='mobile':
  for im in bpy.data.images:
   if max(im.size)>1024:im.scale(1024,1024)
 bpy.ops.export_scene.gltf(filepath=str(OUT/f'forest-fold-house-{tier}.glb'),export_format='GLB',use_selection=True,export_extras=True,export_image_format='JPEG',export_jpeg_quality=93 if tier=='desktop' else 88,export_cameras=False,export_lights=False)
print('FOREST EXPORT COMPLETE',flush=True)
