import { describe, expect, it } from 'vitest';
import { advanceStoryProgress, storyPresentation, storyScrollProgress } from './scrollStoryModel';

describe('Product story motion', () => {
  it('follows ordinary document scroll in either direction and converges promptly after a wheel burst', () => {
    expect(storyScrollProgress(500, 100, 800)).toBe(.5);
    let progress = 0;
    for (let i = 0; i < 60; i++) progress = advanceStoryProgress(progress, 1, 16.67);
    expect(progress).toBeGreaterThan(.998);
    for (let i = 0; i < 60; i++) progress = advanceStoryProgress(progress, .2, 16.67);
    expect(progress).toBeCloseTo(.2, 3);
  });
  it('keeps the camera inside the unobstructed entrance half of White Cube at every sample', () => {
    for (const compact of [false, true]) for (let i = 0; i <= 1000; i++) {
      const pose = storyPresentation(i / 1000, compact);
      expect(pose.position[0]).toBeGreaterThan(-4);
      expect(pose.position[0]).toBeLessThan(0);
      expect(pose.position[2]).toBeGreaterThan(3);
      expect(pose.position[2]).toBeLessThan(5.8);
      if (i > 0) {
        const before = storyPresentation((i - 1) / 1000, compact);
        expect(Math.hypot(...pose.position.map((v, j) => v - before.position[j]))).toBeLessThan(.01);
      }
    }
  });
  it('shows a completed, stationary scene without auto-entering Walk for reduced motion', () => {
    const initial = storyPresentation(0, false, true);
    expect(storyScrollProgress(8000, 0, 2000, true)).toBe(0);
    expect(storyPresentation(1, false, true)).toEqual(initial);
    expect(initial.progress).toBe(1);
    expect(initial.interactive).toBe(false);
  });
  it('hands off to visitor eye height only at the finale and is reversible', () => {
    expect(storyPresentation(1).position[1]).toBe(1.75);
    expect(storyPresentation(1).interactive).toBe(true);
    expect(storyPresentation(.5).interactive).toBe(false);
  });
});
