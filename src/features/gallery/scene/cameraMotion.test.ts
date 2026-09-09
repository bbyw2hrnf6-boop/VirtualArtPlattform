import { describe, expect, it } from 'vitest';
import { CatmullRomCurve3, Quaternion, Vector3 } from 'three';
import { cameraTourFrame, cameraTourTiming, dollyProgress } from './cameraMotion';
import paths from './roomIntroductions.json';
const pose = (z: number, yaw = 0, isStop = true) => ({ position: new Vector3(0, 1.75, z), quaternion: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw), isStop });
describe('Architectural camera pacing', () => {
  it('caps actual movement and rotation on both short and Forum-length segments, with stationary artwork holds', () => {
    const poses = [pose(29), pose(26), pose(-26, Math.PI)];
    const timing = cameraTourTiming(poses);
    expect(timing.duration).toBeGreaterThan(45000);
    let previous = poses[0].position.clone(), orientation = poses[0].quaternion.clone();
    for (let time = 20; time < timing.duration; time += 20) {
      const { index, amount } = cameraTourFrame(timing, time);
      const position = poses[index].position.clone().lerp(poses[index + 1].position, amount);
      const rotation = poses[index].quaternion.clone().slerp(poses[index + 1].quaternion, amount);
      expect(position.distanceTo(previous) / .02).toBeLessThanOrEqual(1.451);
      expect(rotation.angleTo(orientation) / .02).toBeLessThanOrEqual(Math.PI / 7 + .001);
      previous = position; orientation = rotation;
    }
    expect(cameraTourFrame(timing, timing.segments[0].end - 900).amount).toBe(1);
  });
  it('provides a short, continuous introduction for every room, safely away from the Forum divider', () => {
    for (const [id, path] of Object.entries(paths)) {
      const curve = new CatmullRomCurve3(path.positions.map(p => new Vector3(...p)), false, 'centripetal');
      expect(curve.getLength()).toBeLessThan(14);
      for (let i = 0; i <= 200; i++) {
        const p = curve.getPointAt(dollyProgress(i / 200));
        expect(p.y).toBeGreaterThanOrEqual(1.74);
        if (id === 'pavilion') { expect(p.z).toBeGreaterThan(15); expect(Math.abs(p.x)).toBeLessThan(4); }
        if (id === 'nocturne') expect(p.x).toBeLessThan(-2.4);
      }
    }
  });
  it('settles exactly, with continuous speed at the dolly ramps', () => {
    expect(dollyProgress(0)).toBe(0); expect(dollyProgress(1)).toBe(1);
    for (const t of [.14, .86]) {
      const before = (dollyProgress(t) - dollyProgress(t - .00001)) / .00001;
      const after = (dollyProgress(t + .00001) - dollyProgress(t)) / .00001;
      expect(Math.abs(after - before)).toBeLessThan(.001);
    }
  });
});
