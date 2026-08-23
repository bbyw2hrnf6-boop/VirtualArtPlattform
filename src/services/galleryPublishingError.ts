export type GalleryPublishingErrorCode =
  | 'app-check'
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
      `Firestore rejected the authenticated room write in “${projectId}”. Copy the current firestore.rules into the Firebase Rules editor, publish them there manually, then retry. Your room is still saved locally.`,
      error
    );
  }
  if (code === 'functions/unauthenticated' || code === 'functions/permission-denied') {
    return new GalleryPublishingError(
      'app-check',
      'Firebase could not verify this publishing request. Reload the page, sign in again if needed, then retry. Your room is still saved locally.',
      error
    );
  }
  if (code === 'storage/unauthorized') {
    return new GalleryPublishingError(
      'configuration',
      `Firebase Storage rejected the authenticated image upload in “${projectId}”. Create the Storage bucket and publish the repository's storage.rules manually, then retry. Your room is still saved locally.`,
      error
    );
  }
  if (code === 'storage/bucket-not-found' || code === 'storage/no-default-bucket' || code === 'storage/project-not-found') {
    return new GalleryPublishingError(
      'configuration',
      `Firebase Storage is not ready for “${projectId}”. Confirm the Blaze plan and create the default Storage bucket, then retry. Your room is still saved locally.`,
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
      `Account publishing is not enabled correctly for “${projectId}”. Confirm Email/Password and Google Authentication are enabled, then retry. Your room is still saved locally.`,
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
    code === 'internal'
    || code === 'functions/internal'
  ) {
    return new GalleryPublishingError(
      'configuration',
      'AURA publishing reached the room service, but the server could not finish the request. Your room is still saved locally; retry once, then check the Firebase Functions logs if it continues.',
      error
    );
  }
  if (code === 'functions/not-found' || code === 'functions/unimplemented') {
    return new GalleryPublishingError(
      'configuration',
      'AURA publishing is not available because the core Firebase Functions are missing. Your room is still saved locally; deploy them, then retry.',
      error
    );
  }
  if (
    code === 'resource-exhausted'
    || code === 'firestore/resource-exhausted'
    || code === 'functions/resource-exhausted'
    || code === 'auth/too-many-requests'
    || code === 'storage/quota-exceeded'
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
    || code === 'functions/unavailable'
    || code === 'functions/deadline-exceeded'
    || code === 'auth/network-request-failed'
    || code === 'storage/retry-limit-exceeded'
    || code === 'storage/unknown'
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
