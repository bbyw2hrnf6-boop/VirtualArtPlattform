import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createAdaptiveDpr, createPlanarCollisionSystem, planarCollidersFromAuthoredNodes, renderQualityForCapabilities } from './runtimeQuality';

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

  it('routes click-to-walk around a partition when a safe path exists', () => {
    const collision = createPlanarCollisionSystem(
      [obstacle],
      0,
      { minX: -2, maxX: 2, minZ: -2, maxZ: 2 },
    );
    const path = collision.findPath(
      new THREE.Vector3(0, 1.75, 1),
      new THREE.Vector3(0, 1.75, -1),
    );
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(1);
    expect(path!.at(-1)).toEqual(new THREE.Vector3(0, 1.75, -1));
  });

  it('rejects unreachable and out-of-bounds walk targets', () => {
    const collision = createPlanarCollisionSystem(
      [obstacle],
      0,
      { minX: -1, maxX: 1, minZ: -1, maxZ: 1 },
    );
    expect(collision.findPath(new THREE.Vector3(0, 1.75, 1), new THREE.Vector3(0, 1.75, 0))).toBeNull();
    expect(collision.findPath(new THREE.Vector3(0, 1.75, 1), new THREE.Vector3(2, 1.75, 0))).toBeNull();
  });

  it('turns Blender-authored empty collider nodes into world-space footprints', () => {
    const collider = new THREE.Object3D(); collider.name = 'COLLIDER_Test'; collider.position.set(3, 1, -2); collider.userData.half_extents = [1.5, 1, .25];
    const boxes = planarCollidersFromAuthoredNodes([collider]);
    expect(boxes).toEqual([{ minX: 1.5, maxX: 4.5, minZ: -2.25, maxZ: -1.75, name: 'COLLIDER_Test' }]);
  });
});

describe('runtime quality selection', () => {
  it('does not classify a capable touch tablet as low quality', () => {
    const quality = renderQualityForCapabilities({ coarse: true, compact: true, cores: 8, memory: 8, dpr: 2 });
    expect(quality.tier).toBe('balanced');
    expect(quality.dpr).toBe(1.2);
  });

  it('starts genuinely constrained devices on the bounded low tier', () => {
    const quality = renderQualityForCapabilities({ coarse: false, compact: false, cores: 4, memory: 4, dpr: 3 });
    expect(quality.tier).toBe('low');
    expect(quality.dpr).toBe(1.15);
  });
});


it('keeps loading and hidden-tab time out of the DPR measurement, while still responding to slow rendering', () => {
  vi.stubGlobal('devicePixelRatio', 2);
  const renderer = { setPixelRatio: vi.fn() } as unknown as THREE.WebGLRenderer;
  const quality = renderQualityForCapabilities({ coarse:false, compact:false, cores:8, memory:8, dpr:2 });
  const adaptive = createAdaptiveDpr(renderer, quality);
  adaptive.resetSampling(10_000);
  for (let frame=1; frame<=120; frame++) adaptive.update(10_000 + frame*16.7);
  expect(adaptive.getTier()).toBe('high');
  adaptive.resetSampling(60_000);
  for (let frame=1; frame<=120; frame++) adaptive.update(60_000 + frame*16.7);
  expect(renderer.setPixelRatio).not.toHaveBeenCalled();
  for (let frame=1; frame<=120; frame++) adaptive.update(62_004 + frame*30);
  expect(adaptive.getTier()).toBe('low');
  expect(renderer.setPixelRatio).toHaveBeenCalledWith(1);
  vi.unstubAllGlobals();
});

it('adapts within a short film even when a slow GPU cannot deliver 120 frames', () => {
  vi.stubGlobal('devicePixelRatio', 2);
  const renderer = { setPixelRatio: vi.fn() } as unknown as THREE.WebGLRenderer;
  const downgrade = vi.fn();
  const recover = vi.fn();
  const quality = renderQualityForCapabilities({ coarse:false, compact:false, cores:8, memory:8, dpr:2 });
  const adaptive = createAdaptiveDpr(renderer, quality, downgrade, recover);
  adaptive.resetSampling(0);
  for (let frame = 1; frame <= 4; frame++) adaptive.update(frame * 600);
  expect(adaptive.getTier()).toBe('low');
  expect(downgrade).toHaveBeenCalledOnce();
  // A few fast frames must not oscillate back to the expensive tier.
  for (let frame = 1; frame <= 120; frame++) adaptive.update(2_400 + frame * 16);
  expect(recover).not.toHaveBeenCalled();
  // Recovery still works after five sustained healthy sampling windows.
  for (let frame = 121; frame <= 600; frame++) adaptive.update(2_400 + frame * 16);
  expect(adaptive.getTier()).toBe('balanced');
  expect(recover).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});
