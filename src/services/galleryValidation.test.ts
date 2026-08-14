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
    expect(parsed.visibility).toBe('public');
    expect(parsed.retention).toBe('guest-10-days');
  });

  it('accepts account-backed schema v3 access settings', () => {
    const published = new Date('2026-08-12T12:00:00.000Z');
    const expires = new Date('2027-08-12T12:00:00.000Z');
    const parsed = parseGalleryDocument('private-room', {
      ...draft([artwork({
        src: '',
        storagePath: 'published/owner_1/private-room/artworks/1.webp',
      })]),
      ownerId: 'owner_1',
      coverPath: 'published/owner_1/private-room/cover.webp',
      publishedAt: Timestamp.fromDate(published),
      expiresAt: Timestamp.fromDate(expires),
      visibility: 'private',
      retention: 'account-preview',
      accessVersion: 1,
      schemaVersion: 3,
    });
    expect(parsed.visibility).toBe('private');
    expect(parsed.retention).toBe('account-preview');
    expect(parsed.accessVersion).toBe(1);
  });

  it('rejects a private guest publication', () => {
    const published = new Date('2026-08-12T12:00:00.000Z');
    expect(() => parseGalleryDocument('invalid-private-guest', {
      ...draft([artwork({
        src: '',
        storagePath: 'published/owner_1/invalid-private-guest/artworks/1.webp',
      })]),
      ownerId: 'owner_1',
      coverPath: 'published/owner_1/invalid-private-guest/cover.webp',
      publishedAt: Timestamp.fromDate(published),
      expiresAt: Timestamp.fromDate(new Date('2026-08-22T12:00:00.000Z')),
      visibility: 'private',
      retention: 'guest-10-days',
      accessVersion: 1,
      schemaVersion: 3,
    })).toThrow(GalleryRepositoryDataError);
  });

  it('rejects account previews beyond the bounded retention window', () => {
    const published = new Date('2026-08-12T12:00:00.000Z');
    expect(() => parseGalleryDocument('overlong-account-room', {
      ...draft([artwork({
        src: '',
        storagePath: 'published/owner_1/overlong-account-room/artworks/1.webp',
      })]),
      ownerId: 'owner_1',
      coverPath: 'published/owner_1/overlong-account-room/cover.webp',
      publishedAt: Timestamp.fromDate(published),
      expiresAt: Timestamp.fromDate(new Date('2027-09-01T12:00:00.000Z')),
      visibility: 'unlisted',
      retention: 'account-preview',
      accessVersion: 1,
      schemaVersion: 3,
    })).toThrow(GalleryRepositoryDataError);
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
