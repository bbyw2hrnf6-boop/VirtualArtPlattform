import { describe, expect, it } from 'vitest';
import {
  GalleryPublishingError,
  normalizeGalleryPublishingError
} from './galleryPublishingError';

describe('gallery publishing errors', () => {
  it.each([
    ['permission-denied', 'configuration', 'publish them there manually'],
    ['storage/unauthorized', 'configuration', 'storage.rules'],
    ['storage/bucket-not-found', 'configuration', 'Storage bucket'],
    ['failed-precondition', 'configuration', 'Firestore indexes'],
    ['auth/operation-not-allowed', 'authentication-disabled', 'Enable Anonymous Authentication'],
    ['auth/configuration-not-found', 'authentication-disabled', 'Enable Anonymous Authentication'],
    ['auth/unauthorized-domain', 'unauthorized-domain', 'Authorized domains'],
    ['functions/internal', 'configuration', 'trusted room service'],
    ['functions/not-found', 'configuration', 'core Firebase Functions'],
    ['resource-exhausted', 'quota', 'quota'],
    ['storage/quota-exceeded', 'quota', 'quota'],
    ['unavailable', 'unavailable', 'cannot reach Firebase']
  ])('maps %s to an actionable error', (firebaseCode, expectedCode, copy) => {
    const result = normalizeGalleryPublishingError({ code: firebaseCode }, 'test-project');
    expect(result).toBeInstanceOf(GalleryPublishingError);
    expect((result as GalleryPublishingError).code).toBe(expectedCode);
    expect(result.message).toContain(copy);
    expect(result.message).toContain('saved locally');
  });

  it('does not hide local validation failures', () => {
    const original = new Error('Invalid gallery data');
    expect(normalizeGalleryPublishingError(original, 'test-project')).toBe(original);
  });
});
