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
  return clamp(current + delta * (1 - Math.exp(-Math.min(80, Math.max(0, elapsed)) / 125)));
}
export const STORY_DURATION_MS = 72_000;
// A pre-authored camera score: elevated establish, collection, descending arc,
// material/detail dolly, then a held interior composition. Units are metres.
export const STORY_CAMERA_STOPS = [
  { at: 0, position: [-9, 12, 18], target: [0, .5, -1], fov: 51 },
  { at: .10, position: [-7, 11.4, 17], target: [0, .6, -1], fov: 51 },
  { at: .24, position: [-3, 10.2, 16], target: [0, 1, -1.5], fov: 50 },
  { at: .36, position: [1.5, 9.2, 15], target: [0, 1.2, -2], fov: 49 },
  { at: .48, position: [3.3, 7.6, 12.5], target: [0, 1.5, -3], fov: 51 },
  { at: .62, position: [1.2, 3.4, 4.8], target: [0, 1.7, -5.4], fov: 62 },
  { at: .73, position: [.2, 2.2, 3.5], target: [2.2, 1.25, -2.4], fov: 58 },
  { at: .84, position: [-1.5, 1.9, 2.8], target: [1.4, 1.6, -4.4], fov: 58 },
  { at: .96, position: [-2.6, 1.75, 3.8], target: [0, 1.8, -5.4], fov: 62 },
  { at: 1, position: [-2.6, 1.75, 3.8], target: [0, 1.8, -5.4], fov: 62 },
] as const;

/** Smooth, bounded interpolation; every shot eases to a composed hold. */
export function storyPresentation(raw: number, compact = false, reduced = false): GalleryPresentation {
  const progress = reduced ? 1 : clamp(raw);
  const index = Math.max(0, STORY_CAMERA_STOPS.findIndex((stop) => stop.at >= progress) - 1);
  const a = STORY_CAMERA_STOPS[index], b = STORY_CAMERA_STOPS[index + 1];
  const local = clamp((progress - a.at) / (b.at - a.at));
  const t = local * local * (3 - 2 * local);
  const mix = (a: number, b: number) => a + (b - a) * t;
  const position = a.position.map((value, axis) => mix(value, b.position[axis])) as [number, number, number];
  const target = a.target.map((value, axis) => mix(value, b.target[axis])) as [number, number, number];
  const descent = clamp(progress / .62);
  const aerial = 1 - descent * descent * (3 - 2 * descent);
  if (compact) { position[0] *= .38; position[1] += aerial * 3; position[2] += aerial * 10; }
  return { position, target, fov: mix(a.fov, b.fov) + (compact ? 10 : 0), progress,
    cutaway: progress < .62, interactive: false };
}
