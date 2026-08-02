import * as THREE from 'three';

export type SceneBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

export type PlanarCollider = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  name?: string;
};

export type PlanarCollisionSystem = {
  resolve: (next: THREE.Vector3, previous: THREE.Vector3) => boolean;
  canReach: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
};

export type RenderQuality = {
  antialias: boolean;
  dpr: number;
  shadows: boolean;
  shadowMapSize: 512 | 1024 | 2048;
  tier: 'low' | 'balanced' | 'high';
};

function segmentIntersectsBox(from: THREE.Vector3, to: THREE.Vector3, box: PlanarCollider) {
  let near = 0;
  let far = 1;
  const testAxis = (start: number, delta: number, minimum: number, maximum: number) => {
    if (Math.abs(delta) < 1e-7) return start >= minimum && start <= maximum;
    const inverse = 1 / delta;
    let axisNear = (minimum - start) * inverse;
    let axisFar = (maximum - start) * inverse;
    if (axisNear > axisFar) [axisNear, axisFar] = [axisFar, axisNear];
    near = Math.max(near, axisNear);
    far = Math.min(far, axisFar);
    return near <= far;
  };
  return testAxis(from.x, to.x - from.x, box.minX, box.maxX)
    && testAxis(from.z, to.z - from.z, box.minZ, box.maxZ);
}

function contains(box: PlanarCollider, point: THREE.Vector3) {
  return point.x >= box.minX && point.x <= box.maxX && point.z >= box.minZ && point.z <= box.maxZ;
}

export function createPlanarCollisionSystem(rawColliders: PlanarCollider[], radius = .36): PlanarCollisionSystem {
  const colliders = rawColliders
    .filter((box) => Number.isFinite(box.minX + box.maxX + box.minZ + box.maxZ))
    .map((box) => ({ ...box, minX: box.minX - radius, maxX: box.maxX + radius, minZ: box.minZ - radius, maxZ: box.maxZ + radius }));
  const isFree = (point: THREE.Vector3) => !colliders.some((box) => contains(box, point));
  return {
    resolve(next, previous) {
      if (isFree(next)) return true;
      const intendedX = next.x;
      const intendedZ = next.z;
      const xOnly = new THREE.Vector3(intendedX, next.y, previous.z);
      const zOnly = new THREE.Vector3(previous.x, next.y, intendedZ);
      const xFree = isFree(xOnly);
      const zFree = isFree(zOnly);
      if (xFree && (!zFree || Math.abs(intendedX - previous.x) >= Math.abs(intendedZ - previous.z))) next.copy(xOnly);
      else if (zFree) next.copy(zOnly);
      else if (xFree) next.copy(xOnly);
      else next.copy(previous);
      return next.distanceToSquared(previous) > 1e-8;
    },
    canReach(from, to) {
      return !colliders.some((box) => !contains(box, from) && segmentIntersectsBox(from, to, box));
    }
  };
}

export function planarCollidersFromObjects(objects: THREE.Object3D[], eyeHeight = 1.75): PlanarCollider[] {
  const colliders: PlanarCollider[] = [];
  const box = new THREE.Box3();
  objects.forEach((root) => {
    root.updateWorldMatrix(true, true);
    if (root.userData.decorId) {
      box.setFromObject(root, true);
      if (!box.isEmpty() && box.max.y >= .08 && box.min.y <= eyeHeight + .2) colliders.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, name: root.name });
      return;
    }
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || object.userData.noWalkCollision) return;
      box.setFromObject(mesh, true);
      if (box.isEmpty() || box.max.y < .08 || box.min.y > eyeHeight + .2) return;
      const width = box.max.x - box.min.x;
      const depth = box.max.z - box.min.z;
      if (width < .025 && depth < .025) return;
      colliders.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, name: object.name });
    });
  });
  return colliders;
}

export function planarCollidersFromAuthoredNodes(objects: THREE.Object3D[]): PlanarCollider[] {
  const center = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  return objects.flatMap((object) => {
    const authored = object.userData.half_extents;
    if (!Array.isArray(authored) || authored.length < 3) return [];
    const halfX = Number(authored[0]); const halfZ = Number(authored[2]);
    if (!Number.isFinite(halfX + halfZ)) return [];
    object.updateWorldMatrix(true, false); object.getWorldPosition(center); object.getWorldQuaternion(quaternion); matrix.makeRotationFromQuaternion(quaternion);
    const elements = matrix.elements; const extentX = Math.abs(elements[0]) * halfX + Math.abs(elements[8]) * halfZ; const extentZ = Math.abs(elements[2]) * halfX + Math.abs(elements[10]) * halfZ;
    return [{ minX: center.x - extentX, maxX: center.x + extentX, minZ: center.z - extentZ, maxZ: center.z + extentZ, name: object.name }];
  });
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function getRenderQuality(): RenderQuality {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const compact = Math.min(window.innerWidth, window.innerHeight) < 700;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const low = coarse || compact || cores <= 4 || memory <= 4;
  const high = !low && cores >= 8 && memory >= 8;
  return low
    ? { antialias: false, dpr: Math.min(devicePixelRatio, 1.15), shadows: true, shadowMapSize: 512, tier: 'low' }
    : high
      ? { antialias: true, dpr: Math.min(devicePixelRatio, 1.65), shadows: true, shadowMapSize: 2048, tier: 'high' }
      : { antialias: true, dpr: Math.min(devicePixelRatio, 1.35), shadows: true, shadowMapSize: 1024, tier: 'balanced' };
}

export function createAdaptiveDpr(renderer: THREE.WebGLRenderer, initial: RenderQuality, onDowngrade?: () => void) {
  let tier = initial.tier;
  let sampleStartedAt = performance.now();
  let frames = 0;
  const update = (now: number) => {
    frames += 1;
    if (frames < 120) return;
    const averageFrameMs = (now - sampleStartedAt) / frames;
    if (averageFrameMs > 25 && tier !== 'low') {
      tier = 'low';
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
      onDowngrade?.();
    }
    frames = 0;
    sampleStartedAt = now;
  };
  return { update, getTier: () => tier };
}
