export type GalleryPublishingErrorCode =
  | 'authentication-disabled'
  | 'configuration'
  | 'quota'
  | 'unavailable'
  | 'unauthorized-domain';

export class GalleryPublishingError extends Error {
  readonly code: GalleryPublishingErrorCode;

  constructor(code: GalleryPublishingErrorCode, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'GalleryPublishingError';
    this.code = code;
  }
}

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('code' in error)) return '';
  return String(error.code).toLowerCase();
}

/**
 * Turns Firebase's intentionally terse client errors into actionable product
 * copy. Draft data is not discarded by any of these failures; IndexedDB keeps
 * the editable room in the originating browser.
 */
export function normalizeGalleryPublishingError(error: unknown, projectId: string): Error {
  if (error instanceof GalleryPublishingError) return error;
  const code = errorCode(error);

  if (code === 'permission-denied' || code === 'firestore/permission-denied') {
    return new GalleryPublishingError(
      'configuration',
      `Firestore rejected this publication. Deploy the repository's Firestore rules to “${projectId}”, confirm Anonymous Authentication is enabled, then retry. Your room is still saved locally.`,
      error
    );
  }
  if (code === 'failed-precondition' || code === 'firestore/failed-precondition') {
    return new GalleryPublishingError(
      'configuration',
      `Firestore is missing an index required by this deployment. Deploy the repository's Firestore indexes to “${projectId}”, then retry. Your room is still saved locally.`,
      error
    );
  }
  if (
    code === 'auth/operation-not-allowed'
    || code === 'auth/configuration-not-found'
    || code === 'auth/admin-restricted-operation'
  ) {
    return new GalleryPublishingError(
      'authentication-disabled',
      `Anonymous publishing is disabled for “${projectId}”. Enable Anonymous Authentication in Firebase, then retry. Your room is still saved locally.`,
      error
    );
  }
  if (code === 'auth/unauthorized-domain') {
    return new GalleryPublishingError(
      'unauthorized-domain',
      'This hostname is not authorized for Firebase Authentication. Add it under Authentication → Settings → Authorized domains, then retry. Your room is still saved locally.',
      error
    );
  }
  if (
    code === 'resource-exhausted'
    || code === 'firestore/resource-exhausted'
    || code === 'auth/too-many-requests'
  ) {
    return new GalleryPublishingError(
      'quota',
      'The publishing quota is currently exhausted. Your room is still saved locally; retry after checking Firebase usage.',
      error
    );
  }
  if (
    code === 'unavailable'
    || code === 'firestore/unavailable'
    || code === 'auth/network-request-failed'
  ) {
    return new GalleryPublishingError(
      'unavailable',
      'Publishing cannot reach Firebase right now. Your room is still saved locally; check the connection and retry.',
      error
    );
  }

  return error instanceof Error
    ? error
    : new Error('Publishing failed. Your room is still saved locally; please retry.');
}
