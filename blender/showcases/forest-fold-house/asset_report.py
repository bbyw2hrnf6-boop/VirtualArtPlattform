"""Measure actual retained masters and delivered assets, not target budgets."""
from pathlib import Path
import hashlib,json,struct,io,math
from PIL import Image
H=Path(__file__).resolve().parent;OUT=H.parents[2]/'public/assets/showcases/forest-fold-house'
report={'showcase':'forest-fold-house','deliveryRevision':5,'source':'forest-fold-house.blend','sourceSha256':hashlib.sha256((H/'forest-fold-house.blend').read_bytes()).hexdigest(),'models':{},'images':[],'openQualification':['Physical phone GPU, thermals and sustained frame rate','Real slow-network loading; browser emulation is not a physical-device measurement']}
EXPECTED_GROUPS={room+suffix for room in ['W0','W1','E0','E1'] for suffix in ['', '_walk', '_ceiling', '_furniture']}|{'exterior','bridge_walk','stairs_walk','courtyard_walk'}
bakes=json.loads((H/'bake-report.json').read_text())
assert len(bakes)==len(EXPECTED_GROUPS) and {b['group'] for b in bakes}==EXPECTED_GROUPS, 'Incomplete or unexpected Forest irradiance bake groups'
bakes={b['group']:b for b in bakes}
for group,bake in bakes.items():
 assert bake['sourceSha256']==report['sourceSha256'], f'Stale irradiance bake: {group}'
 assert bake['mode']=='irradiance-with-tiled-albedo' and bake['samples']==256, f'Wrong bake mode/quality: {group}'
 expected_size=4096 if group in ['W0','W1','E0','E1','exterior'] else 2048
 assert (bake['resolution'],bake['normalResolution'],bake['roughnessResolution'])==(expected_size,2048,1024), f'Wrong bake resolution: {group}'
 scale=bake['irradianceScale']
 assert math.isfinite(scale) and scale>=1 and math.log2(scale).is_integer(), f'Invalid irradiance normalization: {group}'
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

def texture_uv(texture):
 return texture.get('extensions',{}).get('KHR_texture_transform',{}).get('texCoord',texture.get('texCoord',0))

def texture_size(j,textures,texture):
 return textures[j['textures'][texture['index']]['source']]

def validate_irradiance(j,textures,tier):
 # Revision 5 has multiple surface materials per atlas. Material counts vary
 # with authored joinery, but all 20 physical bake groups must survive intact.
 baked={i:m for i,m in enumerate(j['materials']) if m.get('extras',{}).get('forest_irradiance') is True}
 groups={m['extras'].get('forest_atlas_group') for m in baked.values()}
 assert groups==EXPECTED_GROUPS, f'Missing or unexpected irradiance groups: {groups ^ EXPECTED_GROUPS}'
 atlas_textures={};tiled_count=0
 for index,material in baked.items():
  name=material.get('name',str(index));extras=material['extras'];group=extras['forest_atlas_group']
  pbr=material['pbrMetallicRoughness']
  assert all(key in material for key in ['emissiveTexture','normalTexture']), name
  assert all(key in pbr for key in ['baseColorTexture','metallicRoughnessTexture']), name
  assert 'KHR_materials_unlit' not in material.get('extensions',{}), name
  assert texture_uv(material['emissiveTexture'])==1, f'Irradiance is not UV1: {name}'
  assert material.get('emissiveFactor',[0,0,0])==[1,1,1], f'Unexpected irradiance tint: {name}'
  strength=material.get('extensions',{}).get('KHR_materials_emissive_strength',{}).get('emissiveStrength',1)
  assert strength==bakes[group]['irradianceScale'], f'Lost HDR irradiance scale: {name}'
  atlas=material['emissiveTexture']['index']
  assert group not in atlas_textures or atlas_textures[group]==atlas, f'Split irradiance within one group: {group}'
  atlas_textures[group]=atlas
  size=texture_size(j,textures,material['emissiveTexture'])
  expected=min(bakes[group]['resolution'],1024) if tier=='mobile' else bakes[group]['resolution']
  assert (size['width'],size['height'])==(expected,expected), f'Irradiance texture resolution: {name}'
  tiled='forest_surface_tile_m' in extras
  if tiled:
   assert math.isfinite(extras['forest_surface_tile_m']) and extras['forest_surface_tile_m']>0, name
   tiled_count+=1
  uv=0 if tiled else 1
  for texture in [pbr['baseColorTexture'],material['normalTexture'],pbr['metallicRoughnessTexture']]:
   assert texture_uv(texture)==uv, f'Wrong surface UV{uv}: {name}'
  assert pbr.get('baseColorFactor',[1,1,1,1])==[1,1,1,1], f'Double-tinted surface albedo: {name}'
 assert tiled_count>0, 'All tiled PBR detail was lost'
 assert len(set(atlas_textures.values()))==len(EXPECTED_GROUPS), 'Distinct bake groups share a wrong irradiance atlas'
 used=set()
 for mesh in j['meshes']:
  for primitive in mesh['primitives']:
   index=primitive.get('material')
   if index not in baked:continue
   used.add(index);attrs=primitive['attributes'];material=baked[index]
   assert 'TEXCOORD_1' in attrs, f'Missing irradiance UV1 geometry: {material["name"]}'
   if 'forest_surface_tile_m' in material['extras']:
    assert 'TEXCOORD_0' in attrs, f'Missing tiled UV0 geometry: {material["name"]}'
 assert used==set(baked), 'Unreferenced irradiance material concealed missing geometry'
 return {'mode':'irradiance-with-tiled-albedo','groups':sorted(groups),'materials':len(baked),'tiledSurfaceMaterials':tiled_count}

for tier in ['desktop','mobile']:
 path=OUT/('desktop-v5/forest-fold-house-desktop.gltf' if tier=='desktop' else 'forest-fold-house-mobile.glb')
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
 transport=validate_irradiance(j,textures,tier)
 for name in ['fern_02','periwinkle_plant','tree_small_02_leaves']:
  material=next(m for m in j['materials'] if m.get('name')==name)
  assert material.get('alphaMode')=='MASK' and 'baseColorTexture' in material['pbrMetallicRoughness'], name
 if tier=='mobile':assert all(max(t['width'],t['height'])<=1024 for t in textures), 'Mobile texture cap exceeded'
 report['models'][str(path.relative_to(OUT))]={'bytes':sum(file.stat().st_size for file in files),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'triangles':scene_triangles(j),'uniqueMeshTriangles':sum(j['accessors'][p['indices']]['count']//3 for p in ps),'instancedBatches':sum('EXT_mesh_gpu_instancing' in node.get('extensions',{}) for node in j['nodes']),'primitives':len(ps),'materials':len(j['materials']),'transport':transport,'packagingComparedWithRaw':raw.exists(),'decodedRgbaMipBytesEstimate':round(sum(p['width']*p['height']*4*4/3 for p in textures)),'textures':textures,'extensionsRequired':j.get('extensionsRequired',[]),'files':[{'path':str(file.relative_to(OUT)),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()} for file in sorted(files)]}
for path in sorted((H/'masters').glob('C*.png')):
 evidence=json.loads(path.with_suffix('.json').read_text())
 assert evidence['sourceSha256']==report['sourceSha256'], f'Stale master from another model revision: {path}'
 im=Image.open(path);small=im.convert('RGB').resize((1,1));assert max(small.getpixel((0,0)))>10, f'Black render: {path}'
 report['images'].append({'name':path.name,'width':im.width,'height':im.height,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
manifest=json.loads((H/'materials/sources.json').read_text())
for source in manifest['files']:
 assert hashlib.sha256((H/'materials'/source['path']).read_bytes()).hexdigest()==source['sha256'], source['path']
report['sourceAssets']={'license':manifest['license'],'count':len(manifest['assets']),'manifest':'materials/sources.json'}
(H/'asset-report.json').write_text(json.dumps(report,indent=2)+'\n')
