import { MeshStandardMaterial, Vector3, type BufferGeometry, type Mesh } from 'three';

const prepared = new WeakSet<BufferGeometry>();

/** The delivery joins the flat pond and faceted waterfall into one M09 mesh.
 * Smooth only the vertical sheet's coincident vertices, without welding its
 * topology or changing the pond's upward normals. Water is not an opaque caster. */
export function prepareForestWater(mesh: Mesh) {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (!materials.every(material => material.name === 'M09 Pond water')) return;
  mesh.castShadow = false;
  for (const material of materials) {
    if (!(material instanceof MeshStandardMaterial)) continue;
    // M09's .55 metalness left a .45 diffuse share. After this conversion the
    // multiplier is 1, including on clones of an already corrected material.
    material.color.multiplyScalar(1 - material.metalness); material.metalness = 0;
  }
  const geometry = mesh.geometry, position = geometry.attributes.position, normal = geometry.attributes.normal;
  if (!position || !normal || prepared.has(geometry)) return;
  prepared.add(geometry);
  const groups = new Map<string, { sum: Vector3; vertices: Set<number> }>();
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), face = new Vector3();
  const index = geometry.index;
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const ids = [0, 1, 2].map(offset => index ? index.getX(i + offset) : i + offset);
    a.fromBufferAttribute(position, ids[0]); b.fromBufferAttribute(position, ids[1]); c.fromBufferAttribute(position, ids[2]);
    face.subVectors(b, a).cross(c.sub(a));
    if (!face.lengthSq() || Math.abs(face.y) > .25 * face.length()) continue;
    for (const id of ids) {
      if (Math.abs(normal.getY(id)) > .5) continue;
      // Exact equality is intentional: glTF has already quantized positions.
      const key = `${position.getX(id)},${position.getY(id)},${position.getZ(id)}`;
      let group = groups.get(key);
      if (!group) { group = { sum: new Vector3(), vertices: new Set() }; groups.set(key, group); }
      group.sum.add(face); group.vertices.add(id);
    }
  }
  groups.forEach(({ sum, vertices }) => {
    if (!sum.lengthSq()) return;
    sum.normalize();
    vertices.forEach(id => normal.setXYZ(id, sum.x, sum.y, sum.z));
  });
  if (groups.size) normal.needsUpdate = true;
}
