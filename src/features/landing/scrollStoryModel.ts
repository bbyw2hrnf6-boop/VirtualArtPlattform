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
export const STORY_DURATION_MS = 72_000;
// Twenty-four three-second shots, with holds where the work needs time to read.
// Comparison shots share one pose; materials change without a moving baseline.
const poses: Array<[number, number, number, number, number, number]> = [
  [0, 11, 19, 0, .7, -1], [0, 10.9, 18.9, 0, .7, -1],
  [0, 10.8, 18.8, 0, .7, -1], [0, 10.7, 18.7, 0, .7, -1],
  [.3, 10.5, 18.4, 0, .8, -1], [.6, 10.3, 18, 0, .9, -1],
  [.6, 10.3, 18, 0, .9, -1], [.6, 10.3, 18, 0, .9, -1],
  [.3, 9, 16, 0, 1.4, -2], [.2, 8.6, 15.5, 0, 1.6, -2.5],
  [.6, 9, 15, 0, 1, -1], [.3, 8.3, 13.8, 0, 1, -1],
  [0, 7.5, 12.5, 0, 1, -1], [0, 7.5, 12.5, 0, 1, -1],
  [0, 7.5, 12.5, 0, 1, -1], [0, 7.5, 12.5, 0, 1, -1],
  [0, 7.5, 12.5, 0, 1, -1], [1, 6.4, 10.8, 1, .3, -.5],
  [0, 7.5, 12.5, 0, 1, -1], [0, 5.6, 9.7, 0, 1.75, -4],
  [0, 3.5, 7, 0, 1.75, -5], [0, 1.75, 5.35, 0, 1.75, -5],
  [-.3, 1.75, 5.3, -.4, 1.75, -5], [-.5, 1.75, 5.3, 0, 1.75, -5],
  [-.5, 1.75, 5.3, 0, 1.75, -5],
];
export const STORY_CAMERA_STOPS = poses.map((pose, i) => ({ at: i / 24,
  position: pose.slice(0, 3) as [number, number, number], target: pose.slice(3) as [number, number, number], fov: 55 }));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
export function storyReveals(progress: number) {
  const shot = clamp(progress) * 24;
  return { floor: smooth((shot - 1) / 2), walls: smooth(shot - 3), light: smooth(shot - 4),
    art: [7, 8, 9].map(start => smooth((shot - start) / .85)), decor: smooth(shot - 10) };
}
export function storyFloor(progress: number) {
  return progress < 14 / 24 ? 'concrete' : progress < 15 / 24 ? 'oak' : 'black-marble';
}

/** All transforms are derived from scroll, so reversing never leaves stale props. */
export function storyPresentation(raw: number, compact = false, reduced = false): GalleryPresentation {
  const progress = reduced ? 1 : clamp(raw);
  const index = Math.min(23, Math.floor(progress * 24));
  const a = STORY_CAMERA_STOPS[index], b = STORY_CAMERA_STOPS[index + 1];
  const t = smooth((progress - a.at) / (b.at - a.at));
  const mix = (a: number, b: number) => a + (b - a) * t;
  const position = a.position.map((value, axis) => mix(value, b.position[axis])) as [number, number, number];
  const target = a.target.map((value, axis) => mix(value, b.target[axis])) as [number, number, number];
  if (compact) {
    const aerial = 1 - smooth((progress - 16 / 24) / (5 / 24));
    position[0] *= .5; position[1] += aerial; position[2] += 2.8 * aerial;
  }
  // The authored shell has a solid front wall: keep that cutaway open until
  // the camera is inside, then close it behind the viewer, without crossing it.
  return { position, target, fov: (compact ? 65 : 55) + 7 * smooth((progress - .75) / .125), progress,
    cutaway: position[2] > 5.5 || position[1] > 4.8, interactive: false };
}
