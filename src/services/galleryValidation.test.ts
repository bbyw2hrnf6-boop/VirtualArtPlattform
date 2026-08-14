import { describe, expect, it } from 'vitest';
import type { Artwork, GalleryDraft } from '../features/gallery/types';
import {
  GalleryRepositoryDataError,
  prepareGalleryDraftForPublication,
  parseGalleryDocument,
  validateGalleryDraft
} from './galleryValidation';
import { Timestamp } from 'firebase/firestore';

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

  it('accepts Storage-backed schema v2 galleries without embedded image data', () => {
    const published = new Date('2026-08-12T12:00:00.000Z');
    const expires = new Date('2026-08-22T12:00:00.000Z');
    const value = {
      ...draft([artwork({
        src: '',
        storagePath: 'published/owner_1/room-1/artworks/1.webp',
      })]),
      ownerId: 'owner_1',
      coverPath: 'published/owner_1/room-1/cover.webp',
      publishedAt: Timestamp.fromDate(published),
      expiresAt: Timestamp.fromDate(expires),
      schemaVersion: 2,
    };
    const parsed = parseGalleryDocument('room-1', value);
    expect(parsed.coverPath).toBe(value.coverPath);
    expect(parsed.artworks[0].storagePath).toBe(value.artworks[0].storagePath);
  });

  it('keeps legacy Firestore image publications readable', () => {
    const published = new Date('2026-08-12T12:00:00.000Z');
    const expires = new Date('2026-08-22T12:00:00.000Z');
    const parsed = parseGalleryDocument('legacy-room', {
      ...draft([artwork({ src: '', assetId: 'legacy-asset' })]),
      ownerId: 'owner_1',
      coverSrc: image,
      publishedAt: Timestamp.fromDate(published),
      expiresAt: Timestamp.fromDate(expires),
      schemaVersion: 1,
    });
    expect(parsed.coverSrc).toBe(image);
    expect(parsed.artworks[0].assetId).toBe('legacy-asset');
  });

  it('rejects malformed Storage paths', () => {
    const invalid = draft([artwork({ src: '' })]) as unknown as { artworks: Array<Record<string, unknown>> };
    invalid.artworks[0].storagePath = 'published/../room/artworks/1.webp';
    expect(() => validateGalleryDraft(invalid)).toThrow(GalleryRepositoryDataError);
  });
});
