import { describe, expect, it } from 'vitest';
import type { Artwork, GalleryDraft } from '../features/gallery/types';
import {
  GalleryRepositoryDataError,
  prepareGalleryDraftForPublication,
  validateGalleryDraft
} from './galleryValidation';

const image = 'data:image/webp;base64,YQ==';

function artwork(overrides: Partial<Artwork> = {}): Artwork {
  return {
    id: 'art-1',
    title: 'Test work',
    src: image,
    aspect: 1,
    wall: 'north',
    x: 0,
    y: 1.5,
    scale: 1,
    ...overrides
  };
}

function draft(artworks: Artwork[]): GalleryDraft {
  return {
    title: 'Test exhibition',
    artist: 'Test artist',
    templateId: 'white-cube',
    wall: 'chalk',
    floor: 'concrete',
    ceiling: 'gallery',
    lighting: 'daylight',
    decor: [],
    artworks
  };
}

describe('gallery publication payload', () => {
  it('keeps visitor-facing frame choices', () => {
    const result = prepareGalleryDraftForPublication(draft([artwork({ frame: 'oak' })]));
    expect(result.artworks[0].frame).toBe('oak');
  });

  it('keeps the selected plant-pot finish', () => {
    const source = draft([artwork()]);
    source.decor = [{
      id: 'plant-1',
      type: 'olive',
      x: 2,
      z: 1,
      rotation: 0,
      scale: 1,
      potColor: 'black'
    }];
    const result = prepareGalleryDraftForPublication(source);
    expect(result.decor[0].potColor).toBe('black');
  });

  it('omits hidden works and editor lock state from the public record', () => {
    const result = prepareGalleryDraftForPublication(draft([
      artwork({ id: 'visible', locked: true }),
      artwork({ id: 'hidden', hidden: true, src: '' })
    ]));
    expect(result.artworks).toHaveLength(1);
    expect(result.artworks[0].id).toBe('visible');
    expect(result.artworks[0]).not.toHaveProperty('locked');
    expect(result.artworks[0]).not.toHaveProperty('hidden');
  });

  it('requires at least one publishable artwork', () => {
    expect(() => prepareGalleryDraftForPublication(draft([
      artwork({ hidden: true })
    ]))).toThrow(GalleryRepositoryDataError);
  });

  it('rejects unsupported public frame values', () => {
    const invalid = draft([artwork()]) as unknown as { artworks: Array<Record<string, unknown>> };
    invalid.artworks[0].frame = 'gold';
    expect(() => validateGalleryDraft(invalid)).toThrow(GalleryRepositoryDataError);
  });
});
