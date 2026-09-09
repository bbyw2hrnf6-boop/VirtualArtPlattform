"""Editable camera studies from the exact runtime curve samples.
Run sample_arrivals.mjs first, then Blender -b --python this.py.
Each source retains Beauty 01, all editable materials, and an Arrival camera.
Camera previews are QA stills; they are not marketing masters or Runtime GLBs.
"""
import bpy, json, math
from pathlib import Path
from mathutils import Vector
OUT=Path(__file__).resolve().parent/'v3'
paths=json.loads((OUT/'arrival-samples.json').read_text())
def vec(p):return (p[0],-p[2],p[1])
for room,path in paths.items():
 bpy.ops.wm.open_mainfile(filepath=str(OUT/(room+'.blend')))
 scene=bpy.context.scene
 data=bpy.data.cameras.new('Arrival · runtime path');camera=bpy.data.objects.new('Arrival · runtime path',data)
 bpy.data.collections['CAMERAS'].objects.link(camera)
 data.type='PERSP';data.lens_unit='FOV';data.sensor_fit='VERTICAL';data.sensor_height=24
 data.lens=12/math.tan(math.radians(62)/2);data.clip_start=.1;data.clip_end=200
 camera.rotation_mode='QUATERNION'
 previous=None
 for index,pose in enumerate(path['frames']):
  frame=index+1;camera.location=vec(pose['position'])
  rotation=(Vector(vec(pose['look']))-camera.location).to_track_quat('-Z','Y')
  if previous is not None and index<len(path['frames'])-1:rotation=previous.slerp(rotation,1-math.exp(-8/24))
  previous=rotation.copy();camera.rotation_quaternion=rotation
  fov=62+math.sin(index/(len(path['frames'])-1)*math.pi)*2.2
  data.lens=12/math.tan(math.radians(fov)/2);data.keyframe_insert(data_path='lens',frame=frame)
  camera.keyframe_insert(data_path='location',frame=frame)
  camera.keyframe_insert(data_path='rotation_quaternion',frame=frame)
 scene.camera=camera;scene.render.fps=24;scene.frame_start=1;scene.frame_end=len(path['frames'])
 scene['lieuva_camera_source']='src/features/gallery/scene/roomIntroductions.json'
 scene['lieuva_intro_seconds']=path['seconds']
 scene['lieuva_camera_note']='Authored arrival only; runtime guided tours route dynamically around user furniture.'
 scene.render.resolution_x=960;scene.render.resolution_y=540;scene.render.resolution_percentage=100
 scene.cycles.samples=16;scene.cycles.device='CPU';scene.render.threads=2
 scene.frame_set(1)
 bpy.ops.wm.save_as_mainfile(filepath=str(OUT/(room+'-arrival.blend')),compress=True)
 for frame,label in [(1,'arrival'),(round(scene.frame_end/2),'architecture'),(scene.frame_end,'enter')]:
  scene.frame_set(frame);scene.render.filepath=str(OUT/(room+'-camera-'+label+'.png'))
  bpy.ops.render.render(write_still=True)
