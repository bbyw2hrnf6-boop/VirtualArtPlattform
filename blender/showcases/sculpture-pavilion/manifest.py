"""Record source provenance, exported geometry, animation and decoded texture estimates."""
import json,struct,hashlib,io
from pathlib import Path
from PIL import Image
H=Path(__file__).resolve().parent;root=H.parents[2];public=root/'public/assets/showcases/sculpture-pavilion'
def record(p):return {'path':str(p.relative_to(root)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def glb(p):
 b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);binary=b[28+n:];triangles=sum(g['accessors'][q['indices']]['count']//3 for m in g['meshes'] for q in m['primitives'] if q.get('mode',4)==4)
 pixels=0
 for im in g.get('images',[]):
  v=g['bufferViews'][im['bufferView']];o=v.get('byteOffset',0);image=Image.open(io.BytesIO(binary[o:o+v['byteLength']]));pixels+=image.width*image.height
 return {**record(p),'triangles':triangles,'meshes':len(g['meshes']),'animations':len(g.get('animations',[])),'decodedTextureMiBIncludingMipmaps':round(pixels*4*4/3/1024**2,1),'requiredExtensions':g.get('extensionsRequired',[])}
report={'provenance':'Owner-supplied AI-generated concepts; no provider inferred. Original procedural Blender reconstruction.','runtime':[glb(p) for p in sorted(public.glob('*.glb'))],'images':[record(p) for p in sorted(public.rglob('*.webp'))],'sources':[record(p) for p in sorted((H/'source').rglob('*')) if p.is_file()],'masters':[record(p) for p in sorted((H/'masters').rglob('*.png'))]}
(H/'asset-manifest.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report['runtime'],indent=2))
