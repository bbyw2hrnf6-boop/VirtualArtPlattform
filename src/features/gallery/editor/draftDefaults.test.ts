import { describe, expect, it } from 'vitest';
import { createGalleryDraft } from './draftDefaults';

describe('template draft defaults', () => {
  it('starts every template with a visually distinct authored atmosphere', () => {
    expect(createGalleryDraft('white-cube')).toMatchObject({ wall: 'chalk', floor: 'concrete', ceiling: 'gallery', lighting: 'daylight' });
    expect(createGalleryDraft('nocturne')).toMatchObject({ wall: 'charcoal', floor: 'dark-oak', ceiling: 'dark', lighting: 'evening' });
    expect(createGalleryDraft('pavilion')).toMatchObject({ wall: 'travertine', floor: 'marble', ceiling: 'skylight', lighting: 'museum' });
  });

  it('returns fresh collections so one draft cannot mutate another', () => {
    const first = createGalleryDraft('white-cube');
    const second = createGalleryDraft('white-cube');
    expect(first.artworks).not.toBe(second.artworks);
    expect(first.decor).not.toBe(second.decor);
  });
});
