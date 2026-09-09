import { readFile, writeFile } from 'node:fs/promises';
import { Matrix4, Quaternion, Vector3, Box3 } from 'three';
import { basename } from 'node:path';

const ids = ['white-cube', 'nocturne', 'pavilion'];
const dimensions = [[16, 12, 5.3], [15.5, 11.5, 5.8], [40, 60, 5.6]];
function check(condition, message) { if (!condition) throw new Error(message); }
function readGlb(bytes) {
  check(bytes.readUInt32LE(0) === 0x46546c67 && bytes.readUInt32LE(4) === 2, 'Invalid GLB');
  check(bytes.readUInt32LE(8) === bytes.length, 'Incorrect GLB length');
  let json, bin;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset); const type = bytes.readUInt32LE(offset + 4);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString());
    if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  check(json && bin, 'Missing JSON or geometry'); return { json, bin };
}
function imageSize(bytes) {
  if (bytes.readUInt32BE(0) === 0x89504e47) return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  check(bytes.readUInt16BE(0) === 0xffd8, 'Expected embedded JPEG or PNG');
  for (let i = 2; i < bytes.length;) {
    check(bytes[i] === 0xff, 'Malformed JPEG marker');
    const marker = bytes[i + 1]; const length = bytes.readUInt16BE(i + 2);
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)];
    i += length + 2;
  }
  throw new Error('No JPEG dimensions');
}
export async function inspectPremiumGlb(path) {
  const bytes = await readFile(path); const { json: doc, bin } = readGlb(bytes);
  const meta = doc.scenes[doc.scene ?? 0].extras;
  const id = meta?.aura_template_id; const index = ids.indexOf(id);
  check(index >= 0 && meta.aura_schema_version === 2 && meta.aura_units === 'metres', 'Invalid scene contract');
  check(meta.lieuva_production_version === 'premium-v3', 'Incorrect production version');
  check(JSON.stringify(meta.aura_dimensions) === JSON.stringify(dimensions[index]), 'Dimensions differ from Studio');
  const [w, d, h] = dimensions[index]; const mobile = path.includes('-mobile');
  check(bytes.length < (mobile ? 4 : 8) * 1024 * 1024, 'Asset size budget exceeded');
  const nodes = doc.nodes ?? []; const matrices = new Map();
  function visit(i, parent = new Matrix4()) {
    const n = nodes[i]; const local = n.matrix ? new Matrix4().fromArray(n.matrix) : new Matrix4().compose(
      new Vector3(...(n.translation ?? [0, 0, 0])), new Quaternion(...(n.rotation ?? [0, 0, 0, 1])), new Vector3(...(n.scale ?? [1, 1, 1])));
    const world = parent.clone().multiply(local); matrices.set(i, world);
    for (const child of n.children ?? []) visit(child, world);
  }
  for (const i of doc.scenes[doc.scene ?? 0].nodes) visit(i);
  const expected = new Map([
    ['north', [0, h / 2, -d / 2]], ['south', [0, h / 2, d / 2]],
    ['west', [-w / 2, h / 2, 0]], ['east', [w / 2, h / 2, 0]],
  ]);
  if (id === 'pavilion') {
    expected.set('divider-front', [0, 2.275, .175]); expected.set('divider-back', [0, 2.275, -.175]);
    for (const x of [-1, 1]) for (const z of [-1, 1]) for (const side of ['cross', 'room']) {
      expected.set(`${z < 0 ? 'north' : 'south'}-${side}-${x < 0 ? 'west' : 'east'}`, [x * 15, 2.275, z * 12 + (side === 'room' ? z : -z) * .175]);
    }
  }
  const roles = {}; const seen = new Set(); const colliders = []; let nav = 0; let visible = 0; let total = 0; let batches = 0;
  function positions(mesh) {
    return mesh.primitives.map((p) => {
      const acc = doc.accessors[p.attributes.POSITION]; const view = doc.bufferViews[acc.bufferView];
      check(acc.componentType === 5126, 'POSITION must use float32');
      return { acc, view, offset: (view.byteOffset ?? 0) + (acc.byteOffset ?? 0) };
    });
  }
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i], e = n.extras ?? {}, role = e.aura_role;
    check(!seen.has(n.name), `Duplicate node ${n.name}`); seen.add(n.name);
    if (role) roles[role] = (roles[role] ?? 0) + 1;
    check(role !== 'beauty' && !e.lieuva_beauty_only, `Beauty staging leaked: ${n.name}`);
    const pos = new Vector3().setFromMatrixPosition(matrices.get(i));
    if (role === 'surface') {
      check(expected.has(e.aura_surface_id), `Unexpected or duplicate surface ${e.aura_surface_id}`);
      check(pos.distanceTo(new Vector3(...expected.get(e.aura_surface_id))) < .002, `Misplaced surface ${e.aura_surface_id}`);
      check(e.aura_width > 0 && e.aura_height > 0, 'Surface has no usable dimensions');
      const exterior = ['north', 'south', 'west', 'east'].includes(e.aura_surface_id);
      const width = ['north', 'south'].includes(e.aura_surface_id) ? w : ['west', 'east'].includes(e.aura_surface_id) ? d : e.aura_surface_id.startsWith('divider') ? 14 : 10;
      check(Math.abs(e.aura_width - width) < .002 && Math.abs(e.aura_height - (exterior ? h : 4.55)) < .002, 'Placement surface size differs from Studio');
      expected.delete(e.aura_surface_id);
    }
    if (role === 'walk-start') check(Math.abs(pos.y - 1.75) < .001, 'Incorrect eye height');
    if (n.mesh === undefined) continue;
    const mesh = doc.meshes[n.mesh]; const triangles = mesh.primitives.reduce((sum, p) => sum + doc.accessors[p.indices ?? p.attributes.POSITION].count / 3, 0);
    total += triangles;
    if (!['surface', 'collider', 'navmesh'].includes(role)) { visible += triangles; batches += mesh.primitives.length; }
    if (role === 'collider') {
      const bounds = new Box3();
      for (const { acc } of positions(mesh)) bounds.union(new Box3(new Vector3(...acc.min), new Vector3(...acc.max)).applyMatrix4(matrices.get(i)));
      if (bounds.min.y < 1.95 && bounds.max.y > .08) colliders.push(bounds);
    }
    if (role === 'navmesh') nav += triangles;
  }
  // An upper pier must meet the lower pier at its top plane. The previous
  // export overlapped it vertically, leaving nearly coplanar stone faces.
  if (id === 'pavilion') {
    const piers = colliders.filter(box => {
      const size = box.getSize(new Vector3());
      return Math.abs(size.x - .72) < .01 && Math.abs(size.z - .72) < .01;
    });
    check(piers.length > 0, 'Missing Forum pier collision bounds');
    let inspected = 0;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node.extras?.lieuva_overhead || node.mesh === undefined) continue;
      for (const { acc, view, offset } of positions(doc.meshes[node.mesh])) for (let v = 0; v < acc.count; v++) {
        const j = offset + v * (view.byteStride ?? 12);
        const p = new Vector3(bin.readFloatLE(j), bin.readFloatLE(j + 4), bin.readFloatLE(j + 8)).applyMatrix4(matrices.get(i));
        for (const pier of piers) if (p.x >= pier.min.x - .002 && p.x <= pier.max.x + .002 && p.z >= pier.min.z - .002 && p.z <= pier.max.z + .002) {
          inspected++;
          check(p.y >= pier.max.y - .002, 'Overhead geometry overlaps a Forum pier');
        }
      }
    }
    check(inspected > 0, 'Forum upper pier geometry was not inspected');
  }
  check(expected.size === 0, `Missing surfaces ${[...expected.keys()]}`);
  for (const role of ['floor', 'collider', 'navmesh', 'art-anchor', 'view']) check(roles[role] > 0, `Missing ${role}`);
  for (const role of ['walk-start', 'walk-look']) check(roles[role] === 1, `Expected one ${role}`);
  check(visible < (mobile ? 80000 : 180000), `Visible triangle budget exceeded: ${visible}`);
  check(batches <= (mobile ? 40 : 60), `Material batch budget exceeded: ${batches}`);
  let aoMaterials = 0;
  for (const material of doc.materials ?? []) {
    if (!material.occlusionTexture) continue;
    aoMaterials++;
    check(material.occlusionTexture.texCoord === 1, 'AO must use an independent UV channel');
  }
  check(aoMaterials >= 5, 'Missing architectural contact AO');
  for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
    const material = doc.materials[primitive.material];
    if (material?.occlusionTexture) check(primitive.attributes.TEXCOORD_1 !== undefined, 'AO geometry has no second UV');
  }
  const images = (doc.images ?? []).map((img) => {
    check(img.bufferView !== undefined && !img.uri, 'Textures must be embedded');
    const view = doc.bufferViews[img.bufferView]; const size = imageSize(bin.subarray(view.byteOffset, view.byteOffset + view.byteLength));
    check(Math.max(...size) <= (mobile ? 512 : 1024), `Texture budget exceeded: ${size}`); return size;
  });
  // Check all exported nav vertices against exact authored oriented boxes, not
  // conservative world AABBs (which overstate the angled Nocturne wings).
  const colliderNodes = nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.extras?.aura_role === 'collider');
  for (let i = 0; i < nodes.length; i++) if (nodes[i].extras?.aura_role === 'navmesh') {
    for (const { acc, view, offset } of positions(doc.meshes[nodes[i].mesh])) for (let v = 0; v < acc.count; v++) {
      const j = offset + v * (view.byteStride ?? 12);
      const p = new Vector3(bin.readFloatLE(j), bin.readFloatLE(j + 4), bin.readFloatLE(j + 8)).applyMatrix4(matrices.get(i));
      check(Math.abs(p.x) <= w / 2 && Math.abs(p.z) <= d / 2, 'Navmesh outside room');
      for (const { n, i: ci } of colliderNodes) {
        const local = p.clone().setY(1).applyMatrix4(matrices.get(ci).clone().invert());
        for (const { acc: a } of positions(doc.meshes[n.mesh])) {
          const hit = local.x > a.min[0] && local.x < a.max[0] && local.y > a.min[1] && local.y < a.max[1] && local.z > a.min[2] && local.z < a.max[2];
          check(!hit, `Navmesh intersects ${n.name}`);
        }
      }
    }
  }
  const estimatedTextureBytes = Math.round(images.reduce((sum, [width, height]) => sum + width * height * 4 * 4 / 3, 0));
  return { file: basename(path), id, bytes: bytes.length, visibleTriangles: visible, totalTriangles: total, navTriangles: nav, materialBatches: batches, aoMaterials, estimatedTextureBytes, images, roles };
}
const results = [];
const paths = process.argv.length > 2 ? process.argv.slice(2) : ids.flatMap(id => ['desktop', 'mobile'].map(tier => `public/assets/templates/premium-v3/${id}-${tier}.glb`));
for (const path of paths) { const result = await inspectPremiumGlb(path); results.push(result); console.log(JSON.stringify(result)); }
if (results.length) await writeFile('audit/premium-glb-measurements.json', JSON.stringify(results, null, 2) + '\n');
