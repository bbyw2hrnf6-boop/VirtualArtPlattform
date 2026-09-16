"""Measure actual retained masters and delivered assets, not target budgets."""
from pathlib import Path
import hashlib,json,struct,io
from PIL import Image
H=Path(__file__).resolve().parent;OUT=H.parents[2]/'public/assets/showcases/forest-fold-house'
report={'showcase':'forest-fold-house','source':'forest-fold-house.blend','sourceSha256':hashlib.sha256((H/'forest-fold-house.blend').read_bytes()).hexdigest(),'models':{},'images':[],'openQualification':['Physical phone GPU, thermals and sustained frame rate','Real slow-network loading; browser emulation is not a physical-device measurement']}
for path in sorted(OUT.glob('*.glb')):
 b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);binary=b[28+n:];textures=[]
 for im in j.get('images',[]):
  v=j['bufferViews'][im['bufferView']];a=v.get('byteOffset',0);p=Image.open(io.BytesIO(binary[a:a+v['byteLength']]))
  textures.append({'name':im.get('name',''),'width':p.width,'height':p.height})
 ps=[p for m in j['meshes'] for p in m['primitives']]
 report['models'][path.name]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'triangles':sum(j['accessors'][p['indices']]['count']//3 for p in ps),'primitives':len(ps),'materials':len(j['materials']),'decodedRgbaMipBytesEstimate':round(sum(p['width']*p['height']*4*4/3 for p in textures)),'textures':textures,'extensionsRequired':j.get('extensionsRequired',[])}
for path in sorted((H/'masters').glob('C*.png')):
 im=Image.open(path);small=im.convert('RGB').resize((1,1));assert max(small.getpixel((0,0)))>10, f'Black render: {path}'
 report['images'].append({'name':path.name,'width':im.width,'height':im.height,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(H/'asset-report.json').write_text(json.dumps(report,indent=2)+'\n')
