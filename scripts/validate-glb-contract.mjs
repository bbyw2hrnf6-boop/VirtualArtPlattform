import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const requiredRoles = new Set(['surface', 'floor', 'collider', 'navmesh', 'art-anchor', 'walk-start', 'walk-look', 'view']);

function jsonFromGlb(buffer) {
  if (buffer.readUInt32LE(0) !== GLB_MAGIC) throw new Error('Expected a binary glTF (.glb) file.');
  const totalLength = buffer.readUInt32LE(8);
  if (totalLength !== buffer.length) throw new Error(`GLB length header is ${totalLength}, file is ${buffer.length}.`);
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    if (type === JSON_CHUNK) return JSON.parse(buffer.subarray(offset + 8, offset + 8 + length).toString('utf8').trim());
    offset += 8 + length;
  }
  throw new Error('GLB has no JSON chunk.');
}

function validate(document, path) {
  const roles = new Map();
  const names = new Set();
  const errors = [];
  for (const node of document.nodes ?? []) {
    if (node.name) {
      if (names.has(node.name)) errors.push(`duplicate node name: ${node.name}`);
      names.add(node.name);
    }
    const role = node.extras?.aura_role;
    if (!role) continue;
    const entries = roles.get(role) ?? [];
    entries.push(node);
    roles.set(role, entries);
    if (role === 'surface' && !node.extras?.aura_surface_id) errors.push(`${node.name ?? 'surface'}: missing aura_surface_id`);
  }
  for (const role of requiredRoles) if (!roles.has(role)) errors.push(`missing required aura_role: ${role}`);
  if ((roles.get('walk-start')?.length ?? 0) !== 1) errors.push('expected exactly one walk-start');
  if ((roles.get('walk-look')?.length ?? 0) !== 1) errors.push('expected exactly one walk-look');
  if (errors.length) throw new Error(`${basename(path)} contract failed:\n- ${errors.join('\n- ')}`);
  return [...roles.entries()].map(([role, nodes]) => `${role}=${nodes.length}`).join(', ');
}

const paths = process.argv.slice(2);
if (!paths.length) {
  console.error('Usage: node scripts/validate-glb-contract.mjs <template.glb> [...]');
  process.exit(2);
}

for (const path of paths) {
  const summary = validate(jsonFromGlb(await readFile(path)), path);
  console.log(`✓ ${path}: ${summary}`);
}
