import { useSyncExternalStore } from 'react';
const query = '(prefers-reduced-motion: reduce)';
const subscribe = (changed: () => void) => {
  const media = matchMedia(query); media.addEventListener('change', changed);
  return () => media.removeEventListener('change', changed);
};
export const useReducedMotion = () => useSyncExternalStore(subscribe, () => matchMedia(query).matches, () => true);
