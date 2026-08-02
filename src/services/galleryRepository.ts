import type { GalleryDraft } from '../features/gallery/types';

export interface GalleryRecord extends GalleryDraft {
  id: string;
  publishedAt: string;
  expiresAt: string;
  ownerId?: string;
  coverSrc?: string;
}

export interface GalleryRepository {
  publish(draft: GalleryDraft, roomCoverSource?: string): Promise<GalleryRecord>;
  find(id: string): Promise<GalleryRecord | null>;
  discover(): Promise<GalleryRecord[]>;
  currentUserId(): Promise<string | null>;
  delete(id: string): Promise<void>;
}

let repositoryPromise: Promise<GalleryRepository> | undefined;

function loadRepository(): Promise<GalleryRepository> {
  repositoryPromise ??= import('./firebaseGalleryRepository').then(
    ({ firebaseGalleryRepository }) => firebaseGalleryRepository
  );
  return repositoryPromise;
}

/**
 * Lightweight boundary used by the React bundle. Firebase, authentication,
 * Firestore, and the public-record validator are fetched only when a visitor
 * opens Discover, publishes, or follows a shared gallery link.
 */
export const galleryRepository: GalleryRepository = {
  async publish(draft, roomCoverSource) { return (await loadRepository()).publish(draft, roomCoverSource); },
  async find(id) { return (await loadRepository()).find(id); },
  async discover() { return (await loadRepository()).discover(); },
  async currentUserId() { return (await loadRepository()).currentUserId(); },
  async delete(id) { return (await loadRepository()).delete(id); }
};
