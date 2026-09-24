import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { prepareForestWater } from './forestWater';

function water(quantized = false, indexed = true) {
  // Two unequal-area vertical triangles meet at duplicated positions. A pond
  // vertex occupies the same point, but its normal must never join that weld.
  const positions = [0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -.5, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const normals = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(quantized ? Int16Array.from(positions, value => Math.round(value * 32767)) : new Float32Array(positions), 3, quantized));
  geometry.setAttribute('normal', new BufferAttribute(quantized ? Int8Array.from(normals, value => value * 127) : new Float32Array(normals), 3, quantized));
  if (indexed) geometry.setIndex([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const mesh = new Mesh(geometry, new MeshStandardMaterial({ metalness: .55, roughness: .13 }));
  mesh.material.color.setRGB(.12, .20, .16);
  mesh.material.name = 'M09 Pond water'; mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}

describe('Forest water delivery repair', () => {
  it.each([false, true])('area-weights only vertical normals, preserving topology and pond (quantized=%s)', quantized => {
    const mesh = water(quantized), geometry = mesh.geometry;
    const position = geometry.attributes.position, normal = geometry.attributes.normal;
    const positions = position.array.slice(), indices = geometry.index!.array.slice(), pond = normal.array.slice(18);
    const expected = new Vector3(1, 0, Math.abs(position.getX(5))).normalize();
    prepareForestWater(mesh);
    const actual = new Vector3().fromBufferAttribute(normal, 0);
    expect(actual.distanceTo(expected)).toBeLessThan(quantized ? .01 : .000001);
    expect(new Vector3().fromBufferAttribute(normal, 3).equals(actual)).toBe(true);
    expect(new Vector3().fromBufferAttribute(normal, 2).toArray()).toEqual([1, 0, 0]);
    expect(new Vector3().fromBufferAttribute(normal, 5).toArray()).toEqual([0, 0, 1]);
    expect(position.array).toEqual(positions);
    expect(geometry.index!.array).toEqual(indices);
    expect(normal.array.slice(18)).toEqual(pond);
    expect(geometry.attributes.position).toBe(position);
    expect(geometry.attributes.normal).toBe(normal);
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(true);
  });

  it('is repeat-safe, including separate meshes sharing one geometry', () => {
    const mesh = water(), normal = mesh.geometry.attributes.normal as BufferAttribute;
    prepareForestWater(mesh);
    const values = normal.array.slice(), version = normal.version;
    const clone = mesh.clone(); clone.castShadow = true;
    prepareForestWater(mesh); prepareForestWater(clone);
    expect(normal.array).toEqual(values);
    expect(normal.version).toBe(version);
    expect(clone.castShadow).toBe(false);
  });

  it('removes metalness and preserves diffuse tint once per shared material', () => {
    const mesh = water(), material = mesh.material;
    const expected = material.color.clone().multiplyScalar(1 - material.metalness);
    const shared = new Mesh(mesh.geometry.clone(), material);
    prepareForestWater(mesh); prepareForestWater(mesh); prepareForestWater(shared);
    expect(mesh.material).toBe(material);
    expect(material.color.equals(expected)).toBe(true);
    expect(material.metalness).toBe(0);
    expect(material.roughness).toBe(.13);
    expect(material.type).toBe('MeshStandardMaterial');
    expect(material.transparent).toBe(false);
    expect(material.opacity).toBe(1);
    const cloned = new Mesh(mesh.geometry, material.clone());
    prepareForestWater(cloned);
    expect(cloned.material.color.equals(expected)).toBe(true);
  });

  it('adjusts independent M09 materials even when their geometry was already prepared', () => {
    const first = water(), second = water();
    second.geometry = first.geometry;
    const expected = second.material.color.clone().multiplyScalar(1 - second.material.metalness);
    prepareForestWater(first); prepareForestWater(second);
    expect(second.material.color.equals(expected)).toBe(true);
    expect(second.material.metalness).toBe(0);
  });

  it('also supports unindexed geometry without creating an index', () => {
    const mesh = water(false, false);
    prepareForestWater(mesh);
    expect(mesh.geometry.index).toBeNull();
    expect(mesh.geometry.attributes.normal.getZ(0)).toBeCloseTo(1 / Math.sqrt(5));
  });

  it('leaves other and mixed-material meshes untouched', () => {
    const mesh = water(), normal = mesh.geometry.attributes.normal as BufferAttribute;
    const color = mesh.material.color.clone();
    mesh.material.name = 'M01 Stone';
    prepareForestWater(mesh);
    expect(mesh.castShadow).toBe(true); expect(normal.version).toBe(0);
    mesh.material.name = 'M09 Pond water';
    const mixed = new Mesh(mesh.geometry, [mesh.material, new MeshStandardMaterial()]); mixed.castShadow = true;
    prepareForestWater(mixed);
    expect(mixed.castShadow).toBe(true); expect(normal.version).toBe(0);
    expect(mesh.material.color.equals(color)).toBe(true);
    expect(mesh.material.metalness).toBe(.55);
  });

  it('does not generate invalid normals for degenerate triangles or missing attributes', () => {
    const mesh = water();
    mesh.geometry.setIndex([0, 0, 0]);
    const before = mesh.geometry.attributes.normal.array.slice();
    prepareForestWater(mesh);
    expect(mesh.geometry.attributes.normal.array).toEqual(before);
    const empty = new Mesh(new BufferGeometry(), mesh.material); empty.castShadow = true;
    expect(() => prepareForestWater(empty)).not.toThrow();
    expect(empty.castShadow).toBe(false);
  });
});
