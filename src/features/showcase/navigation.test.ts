import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { canStand, moveSafely, createObsidianNavigation } from './navigation';

describe('Obsidian visitor boundary', () => {
  it('keeps the closed shell and benches solid while both portals connect', () => {
    for (const x of [12, 22]) {
      expect(canStand(x, 1)).toBe(false);
      expect(canStand(x, 4)).toBe(true);
    }
    for (const x of [6, 17, 28]) expect(canStand(x, 4)).toBe(false);
    expect(canStand(-1, 4)).toBe(false);
    expect(canStand(35, 4)).toBe(false);
    expect(canStand(NaN, 4)).toBe(false);
  });
  it('routes floor taps around benches and through both actual portals', () => {
    const navigation = createObsidianNavigation();
    let previous = new Vector3(1.5, 1.75, -1.5);
    const path = navigation.findPath(previous, new Vector3(32, 1.75, -6));
    expect(path).not.toBeNull();
    for (const point of path!) {
      const steps = Math.ceil(point.distanceTo(previous) / .05);
      for (let i = 1; i <= steps; i++) {
        const p = previous.clone().lerp(point, i / steps);
        expect(canStand(p.x, -p.z)).toBe(true);
      }
      previous = point;
    }
    expect(navigation.findPath(previous, new Vector3(17, 1.75, -4))).toBeNull();
    expect(navigation.findPath(previous, new Vector3(12, 1.75, -1))).toBeNull();
    expect(navigation.findPath(previous, new Vector3(35, 1.75, -4))).toBeNull();
  });
  it('cannot tunnel through a partition or bench during a long frame', () => {
    expect(moveSafely(10, 1, 4, 0)[0]).toBeLessThan(12);
    expect(moveSafely(10, 4, 4, 0)[0]).toBeCloseTo(14);
    expect(moveSafely(3, 4, 6, 0)[0]).toBeLessThan(4.2);
  });
});
