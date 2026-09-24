/** Offline v6 garden dressing and lossless day-light delivery.
 * Uses the retained spatial v5 export, never modifies its authored architecture.
 * GLTF_TRANSFORM must point to the pinned 4.5.0 CLI. Outputs to ignored staging.
 */
import {createRequire} from 'node:module';
import {realpathSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const require=createRequire(realpathSync(process.env.GLTF_TRANSFORM));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS,EXTTextureWebP}=require('@gltf-transform/extensions');
const {meshopt}=require('@gltf-transform/functions');
const {MeshoptEncoder}=require('meshoptimizer');
const sharp=require('sharp');
const H=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(H,'../../..');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder});
await MeshoptEncoder.ready;
for(const tier of ['desktop','mobile']){
 const doc=await io.read(`${root}/artifacts/forest/instanced/spatial-forest-fold-house-${tier}.glb`);
 const r=doc.getRoot();
 const dayGroups=new Set(r.listMaterials().filter(m=>m.getExtras().forest_irradiance).map(m=>m.getExtras().forest_atlas_group));
 for(const t of r.listTextures()){
  if(dayGroups.has(t.getName())){
   const rgbm=readFileSync(`${root}/artifacts/forest/day-v6/${tier}/${t.getName()}.webp`);
   // Full-quality RGBM colour; alpha stays lossless. Never near-lossless RGBM:
   // its preprocessing also changes the multiplier and amplifies dark errors.
   const encoded=await sharp(rgbm).webp({quality:100,alphaQuality:100,effort:4}).toBuffer();
   t.setImage(encoded).setMimeType('image/webp').setURI(`day-v6-${t.getName()}.webp`);
  }else if(t.getMimeType()==='image/png'){
   // Alpha foliage PNG -> bit-identical lossless WebP. No resampling or new scan.
   const original=t.getImage();
   const webp=execFileSync(process.env.FOREST_PYTHON??'python3',['-c',
    'import sys,io;from PIL import Image;im=Image.open(io.BytesIO(sys.stdin.buffer.read()));im.save(sys.stdout.buffer,format="WEBP",lossless=True,exact=True,quality=100,method=4)'],{input:original,maxBuffer:64*1024*1024});
   if(webp.length<original.length)t.setImage(webp).setMimeType('image/webp').setURI(`v6-${t.getName()}.webp`);
  }
 }
 doc.createExtension(EXTTextureWebP).setRequired(true);
 // Reuse the same compact fern prototype, geometry and PBR images. Groups
 // follow the existing raised court beds, not a uniform scatter over paths.
 const fern=r.listMeshes().filter(m=>m.listPrimitives().length===1&&m.listPrimitives()[0].getMaterial()?.getName()==='fern_02')
  .sort((a,b)=>a.listPrimitives()[0].getIndices().getCount()-b.listPrimitives()[0].getIndices().getCount())[0];
 if(!fern)throw new Error('Missing retained fern prototype');
 const extension=r.listExtensionsUsed().find(e=>e.extensionName==='EXT_mesh_gpu_instancing');
 const cells=new Map();let seed=240926;
 const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const boxes=[[-8.08,-4.08,-.7,-.92,4.08,6.85],[2.92,-1.58,-.7,8.08,4.08,6.85],[-1.08,-.18,3.15,3.08,1.58,6.16],[-1.3,.1,-.1,3.2,1.5,2.4],[-5.45,3.8,3.3,-4.1,8.5,5.8]];
 // Conservatively reserve the entire pond AABB, both terraces and waterfall.
 // No new plant may float on water or encroach on the visitor's paving.
 boxes.push([-1.1,-6.8,-10,8.5,0,2.4],[-8.4,-5.4,-.4,-.9,-4,2.4],[3,-2.4,-.4,8,-1.5,2.4],[8.2,-3.7,-1,8.9,-2,2.5]);
 const terrain=(x,y)=>-.23+3.63*Math.max(0,Math.min(1,(y-2)/4.5))+.05*Math.sin(x*.8)*Math.sin(y*.6);
 const positions=fern.listPrimitives()[0].getAttribute('POSITION');
 const min=positions.getMin([]),max=positions.getMax([]);
 const placements=[];
 for(const [a,b,c,d,count,level] of [[-.65,1.9,2.5,3.5,180],[-8.8,-6.7,-1.5,-5.8,180],[-.5,-9,8,-7.6,240],[9.2,-6,11,4.5,210],[-10,-3.5,-8.7,3.8,150],[-.4,3.5,2.5,6.2,180],[-7.3,-3.3,-1.7,3.3,140,7.03],[3.7,-.8,7.3,3.3,90,7.03]]){
  for(let i=0;i<count;i++){
   const x=a+(c-a)*random(),y=b+(d-b)*random(),size=1.25+random()*.95,angle=random()*Math.PI*2;
   const height=level??terrain(x,y),z=level??((-.9<x&&x<2.9&&-.45<y&&y<2.6)?Math.max(height,-.095):height);
   // Conservative full rotated plant bounds, same protected envelopes as
   // clearance.py; include leaf extents, never merely the plant origin.
   const radius=Math.max(Math.hypot(min[0],min[2]),Math.hypot(max[0],max[2]))*size;
   const bounds=[x-radius,y-radius,z+min[1]*size,x+radius,y+radius,z+max[1]*size];
   if(boxes.some(box=>[0,1,2].every(j=>Math.min(bounds[j+3],box[j+3])-Math.max(bounds[j],box[j])>0)))continue;
   const key=`${Math.floor(x/4)},${Math.floor(-y/4)}`;
   if(!cells.has(key))cells.set(key,[]);
   const placement={translation:[x,z,-y],rotation:[0,Math.sin(angle/2),0,Math.cos(angle/2)],scale:[size,size,size],bounds};
   cells.get(key).push(placement);placements.push(placement);
  }
 }
 for(const [cell,items] of cells){
  const batch=extension.createInstancedMesh();
  for(const [semantic,key,type] of [['TRANSLATION','translation','VEC3'],['ROTATION','rotation','VEC4'],['SCALE','scale','VEC3']]){
   batch.setAttribute(semantic,doc.createAccessor(`Garden v6 ${semantic}`).setType(type).setArray(new Float32Array(items.flatMap(i=>i[key]))).setBuffer(r.listBuffers()[0]));
  }
  r.listScenes()[0].addChild(doc.createNode(`Garden understory v6 ${cell}`).setMesh(fern).setExtension('EXT_mesh_gpu_instancing',batch).setExtras({forest_group:'planting',forest_dressing_revision:6}));
 }
 const out=`${root}/artifacts/forest/delivery-v6/${tier}`;mkdirSync(out,{recursive:true});
 writeFileSync(`${out}/garden.json`,JSON.stringify({revision:6,prototype:fern.getName(),count:placements.length,cells:cells.size,placements,protectedBounds:boxes},null,2)+'\n');
 await doc.transform(meshopt({encoder:MeshoptEncoder,quantizePosition:16,quantizeTexcoord:14}));
 await io.write(`${out}/forest-fold-house-${tier}.${tier==='desktop'?'gltf':'glb'}`,doc);
 console.log(tier, 'garden plants',placements.length,'cells',cells.size);
}
