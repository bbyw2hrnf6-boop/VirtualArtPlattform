import { Quaternion, Vector3 } from 'three';

export type CameraStop = { position: Vector3; quaternion: Quaternion; isStop?: boolean };
export type TourTiming = { segments: { start: number; travel: number; end: number }[]; duration: number };

/** Physical pacing: smoothstep has a 1.5× peak derivative. Include that in the
 * time allocation so even the long Forum aisles never become a speed-run. */
export function cameraTourTiming(poses: readonly CameraStop[]): TourTiming {
  let duration = 0;
  const segments = poses.slice(1).map((to, index) => {
    const from = poses[index];
    const travel = Math.max(900,
      from.position.distanceTo(to.position) * 1500 / 1.45,
      from.quaternion.angleTo(to.quaternion) * 1500 / (Math.PI / 7));
    const start = duration;
    duration += travel + (to.isStop === false ? 0 : 1800);
    return { start, travel, end: duration };
  });
  return { segments, duration };
}

export function cameraTourFrame(timing: TourTiming, elapsed: number) {
  const time = Math.max(0, Math.min(elapsed, timing.duration));
  const found = timing.segments.findIndex((segment) => time < segment.end);
  const index = found < 0 ? timing.segments.length - 1 : found;
  const segment = timing.segments[index];
  const raw = segment ? Math.min(1, (time - segment.start) / segment.travel) : 1;
  return { index: Math.max(0, index), amount: raw * raw * (3 - 2 * raw) };
}

/** Ease only arrival/departure; keep the middle of a dolly move at steady pace. */
export function dollyProgress(t: number) {
  const x = Math.max(0, Math.min(1, t));
  const ramp = .14;
  if (x < ramp) return x * x / (2 * ramp * (1 - ramp));
  if (x > 1 - ramp) return 1 - (1 - x) ** 2 / (2 * ramp * (1 - ramp));
  return (x - ramp / 2) / (1 - ramp);
}
