import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createPlanarCollisionSystem, planarCollidersFromAuthoredNodes } from './runtimeQuality';

describe('planar gallery collision', () => {
  const obstacle = { minX: -.5, maxX: .5, minZ: -.5, maxZ: .5, name: 'partition' };

  it('prevents walking into authored geometry and keeps the previous valid point', () => {
    const collision = createPlanarCollisionSystem([obstacle], 0);
    const previous = new THREE.Vector3(0, 1.75, 1);
    const next = new THREE.Vector3(0, 1.75, .25);
    expect(collision.resolve(next, previous)).toBe(false);
    expect(next).toEqual(previous);
  });

  it('slides along an obstacle when one movement axis remains clear', () => {
    const collision = createPlanarCollisionSystem([obstacle], 0);
    const previous = new THREE.Vector3(-.75, 1.75, .75);
    const next = new THREE.Vector3(-.4, 1.75, .2);
    expect(collision.resolve(next, previous)).toBe(true);
    expect(next.x).toBe(-.75);
    expect(next.z).toBe(.2);
  });

  it('rejects click-to-walk paths that cross a wall', () => {
    const collision = createPlanarCollisionSystem([obstacle], 0);
    expect(collision.canReach(new THREE.Vector3(0, 1.75, 1), new THREE.Vector3(0, 1.75, -1))).toBe(false);
    expect(collision.canReach(new THREE.Vector3(1, 1.75, 1), new THREE.Vector3(1, 1.75, -1))).toBe(true);
  });

  it('turns Blender-authored empty collider nodes into world-space footprints', () => {
    const collider = new THREE.Object3D(); collider.name = 'COLLIDER_Test'; collider.position.set(3, 1, -2); collider.userData.half_extents = [1.5, 1, .25];
    const boxes = planarCollidersFromAuthoredNodes([collider]);
    expect(boxes).toEqual([{ minX: 1.5, maxX: 4.5, minZ: -2.25, maxZ: -1.75, name: 'COLLIDER_Test' }]);
  });
});
