/** Partition shared meshes into local culling batches; keep every vertex/texel.
 * Run with the pinned glTF-Transform CLI path in GLTF_TRANSFORM. */
import {createRequire} from 'node:module';
import {realpathSync} from 'node:fs';
const require=createRequire(realpathSync(process.env.GLTF_TRANSFORM));
const {NodeIO}=require('@gltf-transform/core');
const {ALL_EXTENSIONS}=require('@gltf-transform/extensions');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read(process.argv[2]);
const root=doc.getRoot();
const extension=root.listExtensionsUsed().find(e=>e.extensionName==='EXT_mesh_gpu_instancing');
let before=0,after=0,placements=0;
for(const node of [...root.listNodes()]){
 const batch=node.getExtension('EXT_mesh_gpu_instancing');
 if(!batch)continue;
 const translation=batch.getAttribute('TRANSLATION');
 if(!translation)continue;
 const semantics=batch.listSemantics();
 const cells=new Map();before++;
 for(let i=0;i<translation.getCount();i++){
  const [x,,z]=translation.getElement(i,[]);const key=`${Math.floor(x/12)},${Math.floor(z/12)}`;
  if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);placements++;
 }
 for(const [cell,indices] of cells){
  const part=extension.createInstancedMesh();
  for(const semantic of semantics){
   const src=batch.getAttribute(semantic),size=src.getElementSize();
   const array=new (src.getArray().constructor)(indices.length*size);
   indices.forEach((id,index)=>array.set(src.getElement(id,[]),index*size));
   const dst=doc.createAccessor(`${semantic} ${cell}`).setType(src.getType()).setNormalized(src.getNormalized()).setArray(array).setBuffer(src.getBuffer());
   part.setAttribute(semantic,dst);
  }
  const child=doc.createNode(`${node.getName() || node.getMesh().getName()} cell ${cell}`)
   .setMesh(node.getMesh()).setMatrix(node.getMatrix()).setExtras(node.getExtras()).setExtension('EXT_mesh_gpu_instancing',part);
  for(const parent of node.listParents())if(parent.propertyType==='Scene'||parent.propertyType==='Node')parent.addChild(child);
  after++;
 }
 const attributes=semantics.map(s=>batch.getAttribute(s));node.dispose();batch.dispose();
 for(const attribute of attributes)if(attribute.listParents().every(p=>p.propertyType==='Root'))attribute.dispose();
}
await io.write(process.argv[3],doc);
console.log(JSON.stringify({before,after,placements,cellMetres:12}));
