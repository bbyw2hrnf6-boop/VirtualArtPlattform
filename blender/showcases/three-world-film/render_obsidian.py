"""Additional film stills from the unchanged retained Obsidian scene.
Run with Blender -b blender/showcases/obsidian/obsidian.blend --python this_file.
No source .blend is saved or altered.
"""
from pathlib import Path
import bpy, json, argparse, sys
HERE=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument("--cameras",default="R1-NE,R2-SW,R3-SW")
args=parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=128
scene.cycles.adaptive_threshold=.006
scene.cycles.use_denoising=True
prefs=bpy.context.preferences.addons['cycles'].preferences
try:
 prefs.compute_device_type='METAL';prefs.get_devices()
 for device in prefs.devices:device.use=(device.type=='METAL')
 scene.cycles.device='GPU'
except Exception:
 scene.cycles.device='CPU'
scene.render.resolution_x=2560;scene.render.resolution_y=1440;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_depth='16'
report_path=HERE/'masters'/'render-manifest.json'
report=json.loads(report_path.read_text()) if report_path.exists() else []
for name in args.cameras.split(','):
 scene.camera=bpy.data.objects[name]
 scene.render.filepath=str(HERE/'masters'/f'obsidian-{name}.png')
 bpy.ops.render.render(write_still=True)
 report=[item for item in report if item['camera']!=name]
 report.append({'camera':name,'width':2560,'height':1440,'samples':128,'device':scene.cycles.device})
report_path.write_text(json.dumps(report,indent=2)+'\n')
