/** Compare staged v6 with the actual v5 delivery before promotion. */
import {createRequire} from 'node:module';
import {realpathSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(realpathSync(process.env.GLTF_TRANSFORM));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const {MeshoptDecoder}=require('meshoptimizer');
const sharp=require('sharp');
sharp.cache(false);sharp.concurrency(1);
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const H='blender/showcases/forest-fold-house',out='artifacts/forest/delivery-v6';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function geometry(doc){
 return doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives().map(p=>{
  const attrs=[['INDICES',p.getIndices()],...p.listSemantics().sort().map(s=>[s,p.getAttribute(s)])];
  return `${p.getMaterial()?.getName()}:`+hash(JSON.stringify(attrs.map(([name,a])=>[name,a.getType(),a.getNormalized(),hash(Buffer.from(a.getArray().buffer,a.getArray().byteOffset,a.getArray().byteLength))])));
 })).sort();
}
const report={revision:6,sourceSha256:hash(readFileSync(`${H}/forest-fold-house.blend`)),tiers:{}};
async function inspect(file){
 const doc=await io.read(file),textures=[];
 for(const t of doc.getRoot().listTextures()){
  const {data,info}=await sharp(t.getImage()).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const alpha=Buffer.alloc(data.length/4);for(let i=3;i<data.length;i+=4)alpha[(i-3)/4]=data[i];
  textures.push({name:t.getName(),uri:t.getURI(),pixels:hash(data),alpha:hash(alpha),info});
 }
 const added=doc.getRoot().listNodes().filter(n=>n.getExtras().forest_dressing_revision===6);
 return {geometry:geometry(doc),textures,plants:added.reduce((n,o)=>n+o.getExtension('EXT_mesh_gpu_instancing').getAttribute('TRANSLATION').getCount(),0)};
}
for(const tier of ['desktop','mobile']){
 const oldPath=`public/assets/showcases/forest-fold-house/${tier==='desktop'?'desktop-v5/forest-fold-house-desktop.gltf':'forest-fold-house-mobile.glb'}`;
 const newPath=`${out}/${tier}/forest-fold-house-${tier}.${tier==='desktop'?'gltf':'glb'}`;
 const old=await inspect(oldPath);global.gc?.();
 const next=await inspect(newPath);global.gc?.();
 assert.deepEqual(next.geometry,old.geometry,'Original geometry/UVs/normals changed');
 const before=old.textures,after=next.textures;
 assert.equal(before.length,after.length);
 let preserved=0;
 for(const original of before){
  const revised=after.find(t=>t.name===original.name);assert(revised);
  assert.deepEqual(original.info,revised.info,'Image dimensions/channels changed');
  if(revised.uri.startsWith('day-v6-')||!revised.uri&&JSON.parse(readFileSync('artifacts/forest/day-v6/report.json')).groups[original.name]){
   const reference=await sharp(`artifacts/forest/day-v6/${tier}/${original.name}.webp`).ensureAlpha().raw().toBuffer();
   const alpha=Buffer.alloc(reference.length/4);for(let i=3;i<reference.length;i+=4)alpha[(i-3)/4]=reference[i];
   assert.equal(hash(alpha),revised.alpha,'RGBM alpha changed');
  }else{assert.equal(original.pixels,revised.pixels,`Non-lighting texture pixels changed: ${original.name}`);preserved++;}
 }
 const garden=JSON.parse(readFileSync(`${out}/${tier}/garden.json`));
 for(const item of garden.placements)for(const box of garden.protectedBounds)
  assert(![0,1,2].every(i=>Math.min(item.bounds[i+3],box[i+3])-Math.max(item.bounds[i],box[i])>0),'Plant crossed protected bounds');
 assert.equal(next.plants,garden.count);
 report.tiers[tier]={originalModelSha256:hash(readFileSync(oldPath)),modelSha256:hash(readFileSync(newPath)),
  geometrySha256:hash(JSON.stringify(next.geometry)),preservedSurfaceTextures:preserved,
  gardenPlants:garden.count,gardenCells:garden.cells,gardenSha256:hash(readFileSync(`${out}/${tier}/garden.json`))};
 const json=tier==='desktop'?JSON.parse(readFileSync(newPath)):null;
 const files=[newPath,...(json?[...json.buffers,...json.images].filter(i=>i.uri).map(i=>`${out}/${tier}/${i.uri}`):[])];
 report.tiers[tier].files=Object.fromEntries(files.map(file=>[file.split('/').pop(),hash(readFileSync(file))]));
 console.log(tier,report.tiers[tier]);
}
writeFileSync(`${out}/verification.json`,JSON.stringify(report,null,2)+'\n');
