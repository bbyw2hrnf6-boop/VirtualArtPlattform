"""Measure actual retained masters and delivered assets, not target budgets."""
from pathlib import Path
from urllib.parse import unquote,urlsplit
import hashlib,json,struct,io,math
from PIL import Image
from master_contract import validate_master_set,validate_master
from night_contract import day_geometry_digest, validate_report as validate_night_report, validate_manifest as validate_night_manifest
H=Path(__file__).resolve().parent;OUT=H.parents[2]/'public/assets/showcases/forest-fold-house'
report={'showcase':'forest-fold-house','deliveryRevision':5,'source':'forest-fold-house.blend','sourceSha256':hashlib.sha256((H/'forest-fold-house.blend').read_bytes()).hexdigest(),'models':{},'images':[],'openQualification':['Physical phone GPU, thermals and sustained frame rate','Real slow-network loading; browser emulation is not a physical-device measurement']}
report['deliveryRevision']=6
refinement=json.loads((H/'delivery-refinement-report.json').read_text())
assert refinement['revision']==6 and refinement['sourceSha256']==report['sourceSha256']
assert hashlib.sha256((H/'garden-dressing.json').read_bytes()).hexdigest()==refinement['tiers']['desktop']['gardenSha256']
report['deliveryRefinement']=refinement
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
 parsed=urlsplit(uri)
 assert not (parsed.scheme or parsed.netloc or parsed.query or parsed.fragment), f'Non-local model resource: {uri}'
 file=(path.parent/unquote(parsed.path)).resolve()
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
 return textures[texture_source(j['textures'][texture['index']])]

def texture_source(texture):
 return texture.get('extensions',{}).get('EXT_texture_webp',{}).get('source',texture.get('source'))

def validate_irradiance(j,textures,tier):
 # Revision 5 has multiple surface materials per atlas. Material counts vary
 # with authored joinery, but all 20 physical bake groups must survive intact.
 baked={i:m for i,m in enumerate(j['materials']) if m.get('extras',{}).get('forest_irradiance') is True}
 groups={m['extras'].get('forest_atlas_group') for m in baked.values()}
 assert groups==EXPECTED_GROUPS, f'Missing or unexpected irradiance groups: {groups ^ EXPECTED_GROUPS}'
 atlas_sources={};atlas_samplers={};tiled_count=0
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
  # Blender can create distinct texture records for the same image/sampler
  # across material graphs. The image identity, not texture index, is the atlas.
  atlas=j['textures'][material['emissiveTexture']['index']]
  sampler=j.get('samplers',[])[atlas['sampler']] if 'sampler' in atlas else {}
  assert group not in atlas_sources or atlas_sources[group]==texture_source(atlas), f'Split irradiance within one group: {group}'
  assert group not in atlas_samplers or atlas_samplers[group]==sampler, f'Inconsistent irradiance sampling: {group}'
  atlas_sources[group]=texture_source(atlas);atlas_samplers[group]=sampler
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
 assert len(set(atlas_sources.values()))==len(EXPECTED_GROUPS), 'Distinct bake groups share a wrong irradiance atlas'
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
 path=OUT/('desktop-v6/forest-fold-house-desktop.gltf' if tier=='desktop' else 'forest-fold-house-mobile.glb')
 j,binary=load(path);textures=[];files={path}
 for item in j.get('buffers',[])+j.get('images',[]):
  if 'uri' in item:files.add(resource(path,item['uri']))
 for file in files:assert file.stat().st_size<100*1024**2, f'GitHub file limit exceeded: {file}'
 payloads=images(path,j,binary)
 for im,data in zip(j.get('images',[]),payloads):
  p=Image.open(io.BytesIO(data))
  textures.append({'name':im.get('name',im.get('uri','')),'width':p.width,'height':p.height})
 # The v6 verifier compares all original geometry/UV/normal bytes and decoded
 # surface pixels against v5, then permits only the new plants and day RGBM.
 # Bind that evidence to every actual dependency, not just the glTF descriptor.
 raw=H.parents[2]/f'artifacts/forest/raw/forest-fold-house-{tier}.glb'
 expected=refinement['tiers'][tier]
 assert {file.name for file in files}==set(expected['files']), 'Refined dependency set changed'
 for file in files:
  assert hashlib.sha256(file.read_bytes()).hexdigest()==expected['files'][file.name], 'Unverified refinement: '+file.name
 if raw.exists():
  original,original_binary=load(raw)
  assert scene_triangles(j)==scene_triangles(original)+expected['gardenPlants']*784, 'Unexpected geometry beyond the verified fern instances'
 ps=[p for m in j['meshes'] for p in m['primitives']]
 # A successful export must retain the improvement, not silently fall back to
 # unlit room colours or solid rectangular vegetation cards.
 transport=validate_irradiance(j,textures,tier)
 for name in ['fern_02','periwinkle_plant','tree_small_02_leaves']:
  material=next(m for m in j['materials'] if m.get('name')==name)
  assert material.get('alphaMode')=='MASK' and 'baseColorTexture' in material['pbrMetallicRoughness'], name
 if tier=='mobile':assert all(max(t['width'],t['height'])<=1024 for t in textures), 'Mobile texture cap exceeded'
 report['models'][str(path.relative_to(OUT))]={'bytes':sum(file.stat().st_size for file in files),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'triangles':scene_triangles(j),'uniqueMeshTriangles':sum(j['accessors'][p['indices']]['count']//3 for p in ps),'instancedBatches':sum('EXT_mesh_gpu_instancing' in node.get('extensions',{}) for node in j['nodes']),'primitives':len(ps),'materials':len(j['materials']),'transport':transport,'packagingComparedWithRaw':raw.exists(),'decodedRgbaMipBytesEstimate':round(sum(p['width']*p['height']*4*4/3 for p in textures)),'textures':textures,'extensionsRequired':j.get('extensionsRequired',[]),'files':[{'path':str(file.relative_to(OUT)),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()} for file in sorted(files)]}
masters=sorted((H/'masters').glob('C*.png'))
validate_master_set(path.name for path in masters)
for path in masters:
 evidence=json.loads(path.with_suffix('.json').read_text())
 im=Image.open(path);validate_master(path.name,evidence,im.size,report['sourceSha256'])
 small=im.convert('RGB').resize((1,1));assert max(small.getpixel((0,0)))>10, f'Black render: {path}'
 report['images'].append({'name':path.name,'camera':evidence['camera'],'lighting':evidence['lighting'],'samples':evidence['samples'],'sourceSha256':evidence['sourceSha256'],'width':im.width,'height':im.height,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
manifest=json.loads((H/'materials/sources.json').read_text())
for source in manifest['files']:
 assert hashlib.sha256((H/'materials'/source['path']).read_bytes()).hexdigest()==source['sha256'], source['path']
report['sourceAssets']={'license':manifest['license'],'count':len(manifest['assets']),'manifest':'materials/sources.json'}
# A night download adds illumination only: source, v5 geometry and day atlases
# remain unchanged. Validate every chart's provenance and every delivered byte.
night=json.loads((H/'night-bake-report.json').read_text())
assert night['deliveryRebind']['refinementReportSha256']==hashlib.sha256((H/'delivery-refinement-report.json').read_bytes()).hexdigest(), 'Unverified night delivery rebind'
assert night['deliveryRebind']['previousDayGeometrySha256']==refinement['previousNightGeometrySha256'], 'Lost previous night provenance'
assert night['dayGeometrySha256']==refinement['dayGeometrySha256'], 'Refined night geometry mismatch'
validate_night_report(night,report['sourceSha256'],day_geometry_digest(OUT))
night_manifest_path=OUT/'night-v1/manifest.json'
night_manifest=json.loads(night_manifest_path.read_text());night_assets={}
assert set(night['postprocess']['pipelineSha256'])=={'denoise.py','night_rgbm.py','night_reprocess.py'}, 'Missing night postprocess provenance'
for name,expected in night['postprocess']['pipelineSha256'].items():
 assert name in ['denoise.py','night_rgbm.py','night_reprocess.py'] and hashlib.sha256((H/name).read_bytes()).hexdigest()==expected, 'Stale night postprocessing pipeline: '+name
for name,group in night_manifest['groups'].items():
 source_path=H/'lightmaps/night-v1'/f'{name}.png'
 assert source_path.read_bytes()[24]==16, 'Retained night precision lost: '+name
 for tier in ['desktop','mobile']:
  texture=group[tier];url=texture['url'];prefix='/assets/showcases/forest-fold-house/night-v1/'
  assert url.startswith(prefix), 'External night texture'
  path=(OUT/'night-v1'/url.removeprefix(prefix)).resolve()
  assert path.is_relative_to((OUT/'night-v1').resolve()) and path.is_file(), 'Missing/unsafe night texture: '+url
  im=Image.open(path)
  night_assets[url]={'width':im.width,'height':im.height,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
   'losslessSourceMatch':im.format=='WEBP' and hashlib.sha256(im.convert('RGBA').tobytes()).hexdigest()==night['groups'][name]['rgbm'][tier]['rgbaSha256']}
night_bytes=validate_night_manifest(night_manifest,night,report['sourceSha256'],night_assets)
for name,evidence in night['groups'].items():
 path=H/'lightmaps/night-v1'/f'{name}.png'
 assert path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest()==evidence['imageSha256'], 'Missing/corrupt retained night irradiance: '+name
with_source_runtime=H/'forest-runtime.blend'
if with_source_runtime.exists():
 assert hashlib.sha256(with_source_runtime.read_bytes()).hexdigest()==night['runtimeSha256'], 'Retained UV reference changed since night bake'
report['nightIrradiance']={'manifest':'night-v1/manifest.json','manifestSha256':hashlib.sha256(night_manifest_path.read_bytes()).hexdigest(),
 'encoding':'rgbm-srgb-lossless-webp','losslessSourceCompared':True,'retainedBitDepth':16,'ditherIntensity':0,
 'sourceSha256':night['sourceSha256'],'lightingProfileSha256':night['lightingProfileSha256'],'dayGeometrySha256':night['dayGeometrySha256'],
 'groups':len(night['groups']),'additionalTextureBytes':night_bytes,'runtimeCompared':with_source_runtime.exists(),
 'decodedRgbaMipBytesEstimate':{tier:round(sum(item[tier]['width']*item[tier]['height']*4*4/3 for item in night_manifest['groups'].values())) for tier in ['desktop','mobile']}}
(H/'asset-report.json').write_text(json.dumps(report,indent=2)+'\n')
