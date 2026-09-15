import { describe, expect, it } from 'vitest';
import { canStand, moveSafely } from './navigation';

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
  it('cannot tunnel through a partition or bench during a long frame', () => {
    expect(moveSafely(10, 1, 4, 0)[0]).toBeLessThan(12);
    expect(moveSafely(10, 4, 4, 0)[0]).toBeCloseTo(14);
    expect(moveSafely(3, 4, 6, 0)[0]).toBeLessThan(4.2);
  });
});
