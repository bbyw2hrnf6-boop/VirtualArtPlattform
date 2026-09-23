"""Linear-space OIDN for authored diffuse lightmaps only; never filters source artwork."""
from pathlib import Path
import bpy,shutil,json

def apply(pending,root,on_done=None,reuse_raw=False):
 raw=root/'lightmaps/raw';raw.mkdir(exist_ok=True)
 stage=bpy.data.scenes.new('Forest atlas denoising');stage.render.engine='CYCLES';stage.cycles.samples=1
 stage.render.threads_mode='FIXED';stage.render.threads=4;stage.render.film_transparent=True
 stage.render.image_settings.file_format='PNG';stage.render.image_settings.color_depth='8';stage.render.image_settings.color_mode='RGB'
 stage.view_settings.view_transform='Standard';stage.view_settings.look='None';stage.render.resolution_percentage=100
 camera=bpy.data.objects.new('Denoise camera',bpy.data.cameras.new('Denoise camera'));stage.collection.objects.link(camera);stage.camera=camera
 tree=bpy.data.node_groups.new('Forest linear atlas denoising','CompositorNodeTree');tree.interface.new_socket(name='Image',in_out='OUTPUT',socket_type='NodeSocketColor');stage.compositing_node_group=tree
 inp=tree.nodes.new('CompositorNodeImage');den=tree.nodes.new('CompositorNodeDenoise');out=tree.nodes.new('NodeGroupOutput');tree.links.new(inp.outputs['Image'],den.inputs['Image']);tree.links.new(den.outputs['Image'],out.inputs['Image'])
 for obj,im in pending:
  final=Path(im.filepath_raw);original=raw/final.name
  if not reuse_raw:shutil.copy2(final,original)
  assert original.is_file(), 'Missing raw irradiance: '+str(original)
  source=bpy.data.images.load(str(original),check_existing=False);inp.image=source
  stage.render.resolution_x,stage.render.resolution_y=source.size;stage.render.filepath=str(final)
  bpy.ops.render.render(scene=stage.name,write_still=True)
  # The compositor's Standard PNG is encoded sRGB, including when the
  # original bake was a scene-linear float buffer. State this explicitly on
  # the file-backed image before reload so fresh and cached paths agree.
  im.filepath=str(final);im.source='FILE';im.colorspace_settings.name='sRGB';im.reload();bpy.data.images.remove(source)
  print('DENOISED',final.name,flush=True)
  if on_done:on_done(obj)
 (root/'lightmaps/denoise-report.json').write_text(json.dumps({'algorithm':'Blender linear-space OpenImageDenoise','atlases':[Path(im.filepath).name for _,im in pending]},indent=2)+'\n')
 bpy.data.scenes.remove(stage);bpy.data.node_groups.remove(tree);bpy.data.objects.remove(camera,do_unlink=True)
