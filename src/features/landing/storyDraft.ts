import { createDemoCollectionDraft } from '../gallery/editor/demoCollection';
import type { GalleryDraft } from '../gallery/types';

const collection = createDemoCollectionDraft('white-cube', (() => { let n = 0; return () => `story-work-${++n}`; })());
export const STORY_DRAFT: GalleryDraft = { ...collection, artworks: collection.artworks.map((artwork) => ({ ...artwork, scale: 1.65 })), decor: [
  { id: 'story-bench', type: 'leather-bench', x: -4.2, z: 1.5, rotation: 0, scale: 1 },
  { id: 'story-sculpture', type: 'stone-sculpture', x: 4.4, z: -1.5, rotation: 25, scale: 1 },
  { id: 'story-olive', type: 'olive', x: -6.5, z: -4.3, rotation: 0, scale: 1 },
] };

