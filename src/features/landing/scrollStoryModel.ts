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
/** One short, continuous architectural dolly. No full spin or wall crossing. */
export function storyPresentation(raw: number, compact = false, reduced = false): GalleryPresentation {
  const progress = clamp(raw), t = reduced ? .6 : progress * progress * (3 - 2 * progress);
  return { fov: compact ? 74 : 62, progress: reduced ? 1 : progress,
    position: [(-3.6 + 3.2 * t) * (compact ? .45 : 1), 2.35 - .6 * t, compact ? 5.65 - .4 * t : 5.1 - 1.4 * t],
    target: [0, 2.1 - .35 * t, -5.7], interactive: !reduced && progress >= .985 };
}
