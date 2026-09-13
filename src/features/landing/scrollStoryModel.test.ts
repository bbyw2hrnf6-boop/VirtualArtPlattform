import { describe, expect, it } from 'vitest';
import { advanceStoryProgress, filmProgress, storyPresentation, storyScrollProgress, STORY_CAMERA_STOPS, STORY_DURATION_MS, storyReveals, storyFinishes } from './scrollStoryModel';

const velocity = (from: readonly number[], to: readonly number[], seconds: number) =>
  to.map((value, axis) => (value - from[axis]) / seconds);
const lookDirection = (pose: ReturnType<typeof storyPresentation>) => {
  const direction = pose.target.map((value, axis) => value - pose.position[axis]);
  const length = Math.hypot(...direction);
  return direction.map(value => value / length);
};

describe('Product story motion', () => {
  it('shows every finish when a blocked renderer resumes beyond the comparison shots', () => {
    let progress = .49;
    const floors = new Set<string>(), walls = new Set<string>();
    for (let frame = 0; frame < 8; frame++) {
      progress = filmProgress(progress, 1);
      const finish = storyFinishes(progress);
      floors.add(finish.floor); walls.add(finish.wall);
    }
    expect([...floors]).toEqual(['concrete', 'oak', 'black-marble']);
    expect([...walls]).toEqual(['chalk', 'warm', 'travertine']);
    expect(progress).toBe(1);
    expect(filmProgress(.1, .101)).toBe(.101);
  });
  it('builds before collecting and reveals works one at a time in either direction', () => {
    expect(storyReveals(0)).toEqual({floor:0,walls:0,light:0,art:[0,0,0],decor:0});
    expect(storyReveals(6/24)).toEqual({floor:1,walls:1,light:1,art:[0,0,0],decor:0});
    for (const [time, art] of [[8, [1,0,0]], [9, [1,1,0]], [10, [1,1,1]], [9, [1,1,0]], [8, [1,0,0]]] as const)
      expect(storyReveals(time/24).art).toEqual(art);
    expect(storyReveals(12/24).decor).toBe(1);
  });
  it('compares all six finishes without moving the camera, lights or collection', () => {
    for (const compact of [false,true]) {
      const reference = storyPresentation(12.5/24, compact);
      for (const [time, floor, wall] of [
        [12.5,'concrete','chalk'],[13.5,'oak','chalk'],[14.5,'black-marble','chalk'],
        [15.5,'black-marble','chalk'],[16.5,'black-marble','warm'],[17.5,'black-marble','travertine'],
      ] as const) {
        const pose = storyPresentation(time/24, compact);
        expect(pose.position).toEqual(reference.position);
        expect(pose.target).toEqual(reference.target);
        expect(pose.fov).toBe(reference.fov);
        expect(storyFinishes(time/24).floor).toBe(floor);
        expect(storyFinishes(time/24).wall).toBe(wall);
        expect(storyReveals(time/24)).toEqual(storyReveals(13.5/24));
      }
    }
  });
  it('automatically shows three walls after the floors and reverses without stale finishes', () => {
    for (const [shot, wall] of [[15.5,'chalk'],[16.5,'warm'],[17.5,'travertine'],[23.5,'travertine'],[16.5,'warm'],[15.5,'chalk']] as const) {
      expect(storyFinishes(shot/24).wall).toBe(wall);
      expect(storyFinishes(shot/24).floor).toBe('black-marble');
      expect(storyFinishes(shot/24).group).toBe('wall');
    }
    expect(storyFinishes(0).floor).toBe('concrete');
    expect(storyFinishes(0).wall).toBe('chalk');
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
  it('carries motion through moving waypoints instead of braking at every beat', () => {
    const epsilon = 1e-6;
    for (const compact of [false, true]) for (const shot of [1,2,3,4,8,9,10,11,19,20,21,22]) {
      const before = storyPresentation(shot / 24 - epsilon, compact);
      const after = storyPresentation(shot / 24 + epsilon, compact);
      const speed = Math.hypot(...velocity(before.position, after.position, 2 * epsilon * STORY_DURATION_MS / 1000));
      // A per-segment smoothstep also has continuous velocity, but its velocity
      // is zero at every knot. Guard actual through-motion, not continuity alone.
      expect(speed).toBeGreaterThan(.12);
    }
  });
  it('joins the camera and normalized gaze rails with continuous velocity', () => {
    const epsilon = 1e-6;
    const seconds = epsilon * STORY_DURATION_MS / 1000;
    for (const compact of [false, true]) for (let shot = 1; shot < 24; shot++) {
      const before = storyPresentation(shot / 24 - epsilon, compact);
      const at = storyPresentation(shot / 24, compact);
      const after = storyPresentation(shot / 24 + epsilon, compact);
      for (const values of [
        [before.position, at.position, after.position],
        [before.target, at.target, after.target],
        [lookDirection(before), lookDirection(at), lookDirection(after)],
        [[before.fov!], [at.fov!], [after.fov!]],
      ]) {
        const incoming = velocity(values[0], values[1], seconds);
        const outgoing = velocity(values[1], values[2], seconds);
        expect(Math.hypot(...outgoing.map((value, axis) => value - incoming[axis]))).toBeLessThan(.005);
      }
    }
  });
  it('stays inside each authored segment envelope without spline overshoot', () => {
    for (const compact of [false, true]) for (let shot = 0; shot < 24; shot++) {
      const from = storyPresentation(shot / 24, compact);
      const to = storyPresentation((shot + 1) / 24, compact);
      for (let sample = 0; sample <= 36; sample++) {
        const pose = storyPresentation((shot + sample / 36) / 24, compact);
        for (const key of ['position', 'target'] as const) for (let axis = 0; axis < 3; axis++) {
          expect(pose[key][axis]).toBeGreaterThanOrEqual(Math.min(from[key][axis], to[key][axis]) - 1e-9);
          expect(pose[key][axis]).toBeLessThanOrEqual(Math.max(from[key][axis], to[key][axis]) + 1e-9);
        }
      }
    }
  });
  it('descends and advances toward the entrance without a backward or upward lurch', () => {
    for (const compact of [false, true]) {
      let before = storyPresentation(7 / 24, compact);
      for (let sample = 1; sample <= 1224; sample++) {
        const pose = storyPresentation((7 + 17 * sample / 1224) / 24, compact);
        expect(pose.position[1]).toBeLessThanOrEqual(before.position[1] + 1e-9);
        expect(pose.position[2]).toBeLessThanOrEqual(before.position[2] + 1e-9);
        before = pose;
      }
    }
  });
  it('reverses the same deterministic rail and preserves its original endpoint framing', () => {
    expect(STORY_CAMERA_STOPS).toHaveLength(25);
    for (const compact of [false, true]) {
      const forward = Array.from({length: 97}, (_, sample) => storyPresentation(sample / 96, compact));
      for (let sample = 96; sample >= 0; sample--) expect(storyPresentation(sample / 96, compact)).toEqual(forward[sample]);
      expect(forward[0].position).toEqual(compact ? [0,12,21.8] : [0,11,19]);
      expect(forward[0].target).toEqual([0,.7,-1]);
      expect(forward[0].fov).toBe(compact ? 65 : 55);
      expect(forward[96].position).toEqual(compact ? [-.25,1.75,5.3] : [-.5,1.75,5.3]);
      expect(forward[96].target).toEqual([0,1.75,-5]);
      expect(forward[96].fov).toBe(compact ? 72 : 62);
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
        // Preserve the existing displacement budget across 1,729 samples while
        // the continuous rail follows the unchanged 20-second story score.
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
    expect(STORY_DURATION_MS).toBe(20_000);
    expect(storyPresentation(1).position[1]).toBe(1.75);
    expect(storyPresentation(.98).position).toEqual(storyPresentation(1).position);
    expect(storyPresentation(1).interactive).toBe(false);
    expect(storyPresentation(.5).interactive).toBe(false);
  });
});
