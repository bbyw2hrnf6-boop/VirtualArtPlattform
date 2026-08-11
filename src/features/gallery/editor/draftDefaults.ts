import type { GalleryDraft, TemplateId } from '../types';

const DEFAULT_ATMOSPHERES: Record<TemplateId, Pick<GalleryDraft, 'wall' | 'floor' | 'ceiling' | 'lighting'>> = {
  'white-cube': { wall: 'chalk', floor: 'concrete', ceiling: 'gallery', lighting: 'daylight' },
  nocturne: { wall: 'charcoal', floor: 'dark-oak', ceiling: 'dark', lighting: 'evening' },
  pavilion: { wall: 'travertine', floor: 'marble', ceiling: 'skylight', lighting: 'daylight' }
};

export function createGalleryDraft(templateId: TemplateId): GalleryDraft {
  return {
    title: 'Untitled exhibition',
    artist: 'Your name',
    templateId,
    ...DEFAULT_ATMOSPHERES[templateId],
    decor: [],
    artworks: []
  };
}
