import type { GalleryDraft, TemplateId } from '../types';
import { getTemplate } from '../templates';

const DEFAULT_ATMOSPHERES: Record<TemplateId, Pick<GalleryDraft, 'wall' | 'floor' | 'ceiling'>> = {
  'white-cube': { wall: 'chalk', floor: 'concrete', ceiling: 'gallery' },
  nocturne: { wall: 'charcoal', floor: 'dark-oak', ceiling: 'dark' },
  pavilion: { wall: 'travertine', floor: 'marble', ceiling: 'skylight' }
};

export function createGalleryDraft(templateId: TemplateId): GalleryDraft {
  return {
    title: 'Untitled exhibition',
    artist: 'Your name',
    templateId,
    ...DEFAULT_ATMOSPHERES[templateId],
    lighting: getTemplate(templateId).defaultLighting,
    decor: [],
    artworks: []
  };
}
