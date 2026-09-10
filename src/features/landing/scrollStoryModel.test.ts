import { describe, expect, it } from 'vitest';
import { advanceStoryProgress, storyPresentation, storyScrollProgress, STORY_DURATION_MS, storyReveals, storyFloor } from './scrollStoryModel';

describe('Product story motion', () => {
  it('builds before collecting and reveals works one at a time in either direction', () => {
    expect(storyReveals(0)).toEqual({floor:0,walls:0,light:0,art:[0,0,0],decor:0});
    expect(storyReveals(6/24)).toEqual({floor:1,walls:1,light:1,art:[0,0,0],decor:0});
    for (const [time, art] of [[8, [1,0,0]], [9, [1,1,0]], [10, [1,1,1]], [9, [1,1,0]], [8, [1,0,0]]] as const)
      expect(storyReveals(time/24).art).toEqual(art);
    expect(storyReveals(12/24).decor).toBe(1);
  });
  it('compares three finishes without moving the camera, lights or collection', () => {
    for (const compact of [false,true]) {
      const reference = storyPresentation(13.5/24, compact);
      for (const [time, floor] of [[13.5,'concrete'],[14.5,'oak'],[15.5,'black-marble']] as const) {
        const pose = storyPresentation(time/24, compact);
        expect(pose.position).toEqual(reference.position);
        expect(pose.target).toEqual(reference.target);
        expect(pose.fov).toBe(reference.fov);
        expect(storyFloor(time/24)).toBe(floor);
        expect(storyReveals(time/24)).toEqual(storyReveals(13.5/24));
      }
    }
  });
  it('follows native scroll in either direction without delaying a wheel burst', () => {
    expect(storyScrollProgress(500, 100, 800)).toBe(.5);
    let progress = 0;
    for (let i = 0; i < 60; i++) progress = advanceStoryProgress(progress, 1, 16.67);
    expect(progress).toBeGreaterThan(.998);
    for (let i = 0; i < 60; i++) progress = advanceStoryProgress(progress, .2, 16.67);
    expect(progress).toBeCloseTo(.2, 3);
  });
  it('reaches the same chapter in wall-clock time at low and high frame rates', () => {
    for (const [start, target] of [[0, .755], [.755, .005]]) {
      const slow = advanceStoryProgress(start, target, 1000);
      let fast = start;
      for (let frame = 0; frame < 25; frame++) fast = advanceStoryProgress(fast, target, 40);
      expect(slow).toBeCloseTo(fast, 8);
      expect(Math.abs(target - slow)).toBeLessThan(.001);
      expect(advanceStoryProgress(start, target, -100)).toBe(start);
    }
  });
  it('keeps the descending camera outside closed walls and overhead until inside', () => {
    for (const compact of [false, true]) for (let i = 0; i <= 1728; i++) {
      const pose = storyPresentation(i / 1728, compact);
      if (!pose.cutaway) {
        expect(Math.abs(pose.position[0])).toBeLessThan(7.5);
        expect(pose.position[1]).toBeLessThan(5);
        expect(pose.position[2]).toBeLessThan(5.55);
        expect(pose.position[2]).toBeGreaterThan(2.5); // safe entrance aisle
      }
      if (i > 0) {
        const before = storyPresentation((i - 1) / 1728, compact);
        // 24fps at authored 72 seconds: maximum camera speed stays < 2m/s.
        expect(Math.hypot(...pose.position.map((v, j) => v - before.position[j])) * 24).toBeLessThan(2);
      }
    }
  });
  it('shows a completed stationary scene without auto-entering Walk for reduced motion', () => {
    const initial = storyPresentation(0, false, true);
    expect(storyScrollProgress(8000, 0, 2000, true)).toBe(0);
    expect(storyPresentation(1, false, true)).toEqual(initial);
    expect(initial.progress).toBe(1);
    expect(initial.interactive).toBe(false);
    expect(initial.cutaway).toBe(false);
  });
  it('holds the final interior composition; interaction always needs explicit user intent', () => {
    expect(STORY_DURATION_MS).toBe(72_000);
    expect(storyPresentation(1).position[1]).toBe(1.75);
    expect(storyPresentation(.98).position).toEqual(storyPresentation(1).position);
    expect(storyPresentation(1).interactive).toBe(false);
    expect(storyPresentation(.5).interactive).toBe(false);
  });
});
