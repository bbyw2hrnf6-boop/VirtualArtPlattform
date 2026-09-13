import type { GalleryPresentation } from '../gallery/GalleryScene';
export const STORY_CHAPTERS = [
  { label: 'Your space', title: 'Give your work a place.', body: 'Create a space people can enter. Choose a room, bring your work, and make it yours — directly in your browser.' },
  { label: 'Your collection', title: 'A collection. In context.', body: 'Upload your images. Place, frame and scale each work until the whole collection feels considered.' },
  { label: 'Your atmosphere', title: 'Set the feeling.', body: 'Mineral or timber. Soft daylight or a warmer mood. Shape the room around your work.' },
  { label: 'Their experience', title: 'Made by you. Open to the world.', body: 'Walk through your exhibition. Then publish one link people can explore, wherever they are.' },
] as const;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
export function storyScrollProgress(scroll: number, top: number, travel: number, reduced = false) {
  return reduced ? 0 : clamp((scroll - top) / Math.max(1, travel));
}
export function advanceStoryProgress(current: number, target: number, elapsed: number) {
  const delta = clamp(target) - clamp(current);
  if (Math.abs(delta) < .0001) return clamp(target);
  // Exponential smoothing is stable for long frames too. Capping elapsed time
  // made chapter changes lag behind native scroll on software/slow renderers.
  return clamp(current + delta * (1 - Math.exp(-Math.max(0, elapsed) / 125)));
}
export const STORY_DURATION_MS = 20_000;
/** Catch up after a long frame without skipping an authored material comparison. */
export function filmProgress(current: number, target: number) {
  const next = Math.max(12, Math.floor(current * 24) + 1);
  return clamp(next <= 17 ? Math.min(target, (next + .01) / 24) : target);
}
// The twenty-four story beats keep their 20-second score. Position and gaze
// travel on continuous rails, with deliberate holds for upload and comparison.
const poses: Array<[number, number, number, number, number, number]> = [
  [0, 11, 19, 0, .7, -1], [0, 10.9, 18.9, 0, .7, -1],
  [0, 10.8, 18.8, 0, .7, -1], [0, 10.7, 18.7, 0, .7, -1],
  [.3, 10.5, 18.4, 0, .8, -1], [.6, 10.3, 18, 0, .9, -1],
  [.6, 10.3, 18, 0, .9, -1], [.6, 10.3, 18, 0, .9, -1],
  [.3, 9, 16, 0, 1.4, -2], [.2, 8.6, 15.5, 0, 1.6, -2.5],
  [.15, 8.3, 14.7, 0, 1.3, -1.6], [.07, 7.9, 13.6, 0, 1.15, -1.2],
  [0, 7.5, 12.5, 0, 1, -1], [0, 7.5, 12.5, 0, 1, -1],
  [0, 7.5, 12.5, 0, 1, -1], [0, 7.5, 12.5, 0, 1, -1],
  [0, 7.5, 12.5, 0, 1, -1], [0, 7.5, 12.5, 0, 1, -1],
  [0, 7.5, 12.5, 0, 1, -1], [.25, 5.9, 10.25, .15, 1.35, -2.6],
  [.3, 4.25, 8.15, .05, 1.6, -3.8], [.05, 2.8, 6.35, -.2, 1.75, -4.6],
  [-.25, 1.95, 5.5, -.15, 1.75, -5], [-.5, 1.75, 5.3, 0, 1.75, -5],
  [-.5, 1.75, 5.3, 0, 1.75, -5],
];
export const STORY_CAMERA_STOPS = poses.map((pose, i) => ({ at: i / 24,
  position: pose.slice(0, 3) as [number, number, number], target: pose.slice(3) as [number, number, number], fov: 55 }));
// Shared, shape-preserving Hermite tangents: no stop/start at every waypoint,
// and no overshoot through the shell or drift during a stationary comparison.
const tangents = poses.map((pose, index) => pose.map((value, axis) => {
  if (index === 0 || index === poses.length - 1) return 0;
  const incoming = value - poses[index - 1][axis], outgoing = poses[index + 1][axis] - value;
  return incoming * outgoing > 0 ? 2 * incoming * outgoing / (incoming + outgoing) : 0;
}));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
export function storyReveals(progress: number) {
  const shot = clamp(progress) * 24;
  return { floor: smooth((shot - 1) / 2), walls: smooth(shot - 3), light: smooth(shot - 4),
    art: [7, 8, 9].map(start => smooth((shot - start) / .85)), decor: smooth(shot - 10) };
}
export const STORY_FINISHES = {
  floor: [
    ['concrete', 'Mineral', 'premium-v3/honed-concrete.webp'],
    ['oak', 'Oak', 'premium-v3/natural-oak.webp'],
    ['black-marble', 'Marble', 'aura-nero-marquina-v2.webp'],
  ],
  wall: [
    ['chalk', 'Plaster', 'aura-chalk-plaster-v5.webp'],
    ['warm', 'Clay', 'aura-clay-limewash-v5.webp'],
    ['travertine', 'Travertine', 'aura-roman-travertine-v2.webp'],
  ],
} as const;
export function storyFinishes(progress: number) {
  const shot = clamp(progress) * 24;
  const floor = shot < 13 ? 0 : shot < 14 ? 1 : 2;
  const wall = shot < 16 ? 0 : shot < 17 ? 1 : 2;
  return { floor: STORY_FINISHES.floor[shot < 12 ? 0 : floor][0],
    wall: STORY_FINISHES.wall[wall][0], group: shot < 15 ? 'floor' : 'wall',
    stage: shot < 12 ? -1 : shot < 15 ? floor : 3 + wall } as const;
}

/** All transforms are derived from scroll, so reversing never leaves stale props. */
export function storyPresentation(raw: number, compact = false, reduced = false): GalleryPresentation {
  const progress = reduced ? 1 : clamp(raw);
  const index = Math.min(23, Math.floor(progress * 24));
  const a = STORY_CAMERA_STOPS[index], b = STORY_CAMERA_STOPS[index + 1];
  const t = clamp(progress * 24 - index), t2 = t * t, t3 = t2 * t;
  const mix = (a: number, b: number, axis: number) => a + (b - a) * (3 * t2 - 2 * t3)
    + tangents[index][axis] * (t3 - 2 * t2 + t) + tangents[index + 1][axis] * (t3 - t2);
  const position = a.position.map((value, axis) => mix(value, b.position[axis], axis)) as [number, number, number];
  const target = a.target.map((value, axis) => mix(value, b.target[axis], axis + 3)) as [number, number, number];
  if (compact) {
    const aerial = 1 - smooth((progress - 18 / 24) / (5 / 24));
    position[0] *= .5; position[1] += aerial; position[2] += 2.8 * aerial;
  }
  // The authored shell has a solid front wall: keep that cutaway open until
  // the camera is inside, then close it behind the viewer, without crossing it.
  return { position, target, fov: (compact ? 65 : 55) + 7 * smooth((progress - .75) / .125), progress,
    cutaway: position[2] > 5.5 || position[1] > 4.8, interactive: false };
}
