export const COMPACT_INTERACTION_MEDIA =
  "(max-width: 900px), (max-height: 520px) and (pointer: coarse)";

export function usesCompactInteractionLayout() {
  return window.matchMedia(COMPACT_INTERACTION_MEDIA).matches;
}
