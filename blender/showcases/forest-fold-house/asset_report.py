"""Measure actual retained masters and delivered assets, not target budgets."""
from pathlib import Path
import hashlib,json,struct,io
from PIL import Image
H=Path(__file__).resolve().parent;OUT=H.parents[2]/'public/assets/showcases/forest-fold-house'
report={'showcase':'forest-fold-house','source':'forest-fold-house.blend','sourceSha256':hashlib.sha256((H/'forest-fold-house.blend').read_bytes()).hexdigest(),'models':{},'images':[],'openQualification':['Physical phone GPU, thermals and sustained frame rate','Real slow-network loading; browser emulation is not a physical-device measurement']}
def load(path):
 b=path.read_bytes()
 if path.suffix=='.glb':
  n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:]
 return json.loads(b),None

def resource(path,uri):
 file=(path.parent/uri).resolve()
 assert file.is_relative_to(path.parent.resolve()), f'External resource outside model directory: {uri}'
 assert file.is_file(), f'Missing model dependency: {file}'
 return file

def images(path,j,binary):
 result=[]
 for im in j.get('images',[]):
  if 'uri' in im:result.append(resource(path,im['uri']).read_bytes())
  else:
   v=j['bufferViews'][im['bufferView']];a=v.get('byteOffset',0)
   result.append(binary[a:a+v['byteLength']])
 return result

def scene_triangles(j):
 def visit(index):
  node=j['nodes'][index];count=0
  if 'mesh' in node:
   attrs=node.get('extensions',{}).get('EXT_mesh_gpu_instancing',{}).get('attributes',{})
   instances=j['accessors'][next(iter(attrs.values()))]['count'] if attrs else 1
   count=instances*sum(j['accessors'][p['indices']]['count']//3 for p in j['meshes'][node['mesh']]['primitives'])
  return count+sum(visit(child) for child in node.get('children',[]))
 return sum(visit(root) for root in j['scenes'][j.get('scene',0)]['nodes'])

for tier in ['desktop','mobile']:
 path=OUT/('desktop-v3/forest-fold-house-desktop.gltf' if tier=='desktop' else 'forest-fold-house-mobile.glb')
 j,binary=load(path);textures=[];files={path}
 for item in j.get('buffers',[])+j.get('images',[]):
  if 'uri' in item:files.add(resource(path,item['uri']))
 for file in files:assert file.stat().st_size<100*1024**2, f'GitHub file limit exceeded: {file}'
 payloads=images(path,j,binary)
 for im,data in zip(j.get('images',[]),payloads):
  p=Image.open(io.BytesIO(data))
  textures.append({'name':im.get('name',im.get('uri','')),'width':p.width,'height':p.height})
 # Packaging may share meshes and split files, never reduce scene geometry or
 # re-encode the exported material images. Raw export is local build evidence.
 raw=H.parents[2]/f'artifacts/forest/raw/forest-fold-house-{tier}.glb'
 if raw.exists():
  original,original_binary=load(raw)
  assert scene_triangles(j)==scene_triangles(original), 'Packaging changed visible triangle count'
  assert sorted(hashlib.sha256(p).hexdigest() for p in payloads)==sorted(hashlib.sha256(p).hexdigest() for p in images(raw,original,original_binary)), 'Packaging changed texture bytes'
 ps=[p for m in j['meshes'] for p in m['primitives']]
 # A successful export must retain the improvement, not silently fall back to
 # unlit room colours or solid rectangular vegetation cards.
 baked=[m for m in j['materials'] if m.get('name','').endswith('_transport')]
 assert len(baked)==15, f'Missing room transport materials in {path.name}'
 for material in baked:
  assert 'emissiveTexture' in material and 'normalTexture' in material, material['name']
  assert 'metallicRoughnessTexture' in material['pbrMetallicRoughness'], material['name']
  assert 'KHR_materials_unlit' not in material.get('extensions',{}), material['name']
 for name in ['fern_02','periwinkle_plant','tree_small_02_leaves']:
  material=next(m for m in j['materials'] if m.get('name')==name)
  assert material.get('alphaMode')=='MASK' and 'baseColorTexture' in material['pbrMetallicRoughness'], name
 if tier=='mobile':assert all(max(t['width'],t['height'])<=1024 for t in textures), 'Mobile texture cap exceeded'
 report['models'][str(path.relative_to(OUT))]={'bytes':sum(file.stat().st_size for file in files),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'triangles':scene_triangles(j),'uniqueMeshTriangles':sum(j['accessors'][p['indices']]['count']//3 for p in ps),'instancedBatches':sum('EXT_mesh_gpu_instancing' in node.get('extensions',{}) for node in j['nodes']),'primitives':len(ps),'materials':len(j['materials']),'decodedRgbaMipBytesEstimate':round(sum(p['width']*p['height']*4*4/3 for p in textures)),'textures':textures,'extensionsRequired':j.get('extensionsRequired',[]),'files':[{'path':str(file.relative_to(OUT)),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()} for file in sorted(files)]}
for path in sorted((H/'masters').glob('C*.png')):
 im=Image.open(path);small=im.convert('RGB').resize((1,1));assert max(small.getpixel((0,0)))>10, f'Black render: {path}'
 report['images'].append({'name':path.name,'width':im.width,'height':im.height,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
manifest=json.loads((H/'materials/sources.json').read_text())
for source in manifest['files']:
 assert hashlib.sha256((H/'materials'/source['path']).read_bytes()).hexdigest()==source['sha256'], source['path']
report['sourceAssets']={'license':manifest['license'],'count':len(manifest['assets']),'manifest':'materials/sources.json'}
(H/'asset-report.json').write_text(json.dumps(report,indent=2)+'\n')
