import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { DecorId } from "../types";

/** Original lightweight furnishings. Bounds stay inside the shared placement footprints. */
export function createDesignObject(type: DecorId): THREE.Group | null {
  if (!["lounge-chair", "stone-table", "light-column"].includes(type)) return null;
  const group = new THREE.Group();
  const material = (color: string, roughness: number, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const add = (geometry: THREE.BufferGeometry, surface: THREE.Material, x: number, y: number, z = 0) => {
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  const box = (x: number, y: number, z: number, radius = .04) => new RoundedBoxGeometry(x, y, z, 3, radius);
  if (type === "lounge-chair") {
    const fabric = new THREE.MeshPhysicalMaterial({ color: "#c8bcaa", roughness: .92, sheen: .65 });
    const wood = material("#473022", .5);
    add(box(.88, .2, .87, .09), fabric, 0, .45);
    const back = add(box(.94, .62, .2, .09), fabric, 0, .78, -.34);
    back.rotation.x = -.12;
    for (const x of [-.45, .45]) {
      add(box(.14, .22, .83, .06), fabric, x, .67);
      for (const z of [-.32, .32]) add(box(.09, .35, .09, .025), wood, x * .8, .175, z);
    }
  } else if (type === "stone-table") {
    const stone = material("#b8a78a", .65);
    add(box(1.34, .12, .84, .055), stone, 0, .43);
    for (const x of [-.38, .38]) add(new THREE.CylinderGeometry(.18, .22, .37, 24), stone, x, .185);
  } else {
    const brass = material("#8e7250", .32, .8);
    const glass = new THREE.MeshPhysicalMaterial({ color: "#ede3d1", roughness: .32, emissive: "#ffdc9e", emissiveIntensity: .65 });
    add(new THREE.CylinderGeometry(.27, .3, .07, 32), brass, 0, .035);
    add(new THREE.CylinderGeometry(.16, .16, 1.48, 32), glass, 0, .85);
    for (const y of [.12, 1.6]) add(new THREE.CylinderGeometry(.18, .18, .04, 32), brass, 0, y);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      add(new THREE.CylinderGeometry(.008, .008, 1.46, 6), brass, Math.cos(a) * .166, .85, Math.sin(a) * .166);
    }
  }
  // One draw per material; the whole furnishing remains one selectable object.
  group.updateMatrixWorld(true);
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const child of group.children as THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]) {
    const geometries = batches.get(child.material) ?? [];
    const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    geometries.push(geometry.applyMatrix4(child.matrixWorld));
    child.geometry.dispose();
    batches.set(child.material, geometries);
  }
  group.clear();
  batches.forEach((geometries, surface) => {
    // These primitives are non-indexed float geometry with position/normal/uv.
    const merged = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "uv"]) {
      const attributes = geometries.map(geometry => geometry.getAttribute(name));
      const data = new Float32Array(attributes.reduce((total, attribute) => total + attribute.array.length, 0));
      let offset = 0;
      attributes.forEach(attribute => { data.set(attribute.array, offset); offset += attribute.array.length; });
      merged.setAttribute(name, new THREE.BufferAttribute(data, attributes[0].itemSize));
    }
    group.add(new THREE.Mesh(merged, surface));
    geometries.forEach(geometry => geometry.dispose());
  });
  return group;
}
