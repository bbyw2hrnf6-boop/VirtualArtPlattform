import type { GalleryDraft } from '../features/gallery/types';
import type {
  GalleryMember,
  GalleryPublishOptions,
  GalleryRetention,
  GalleryRole,
  GalleryVisibility,
} from './galleryAccess';
import type { AccountSession } from './accountTypes';

export interface GalleryRecord extends GalleryDraft {
  id: string;
  publishedAt: string;
  expiresAt: string;
  ownerId?: string;
  coverSrc?: string;
  coverPath?: string;
  visibility: GalleryVisibility;
  retention: GalleryRetention;
  accessVersion: number;
}

export class GalleryAccessDeniedError extends Error {
  readonly code = 'gallery-access-denied';

  constructor(readonly galleryId: string) {
    super('Sign in with an invited account to enter this private room.');
    this.name = 'GalleryAccessDeniedError';
  }
}

export interface GalleryRepository {
  publish(
    draft: GalleryDraft,
    roomCoverSource?: string,
    options?: GalleryPublishOptions,
  ): Promise<GalleryRecord>;
  find(id: string): Promise<GalleryRecord | null>;
  discover(): Promise<GalleryRecord[]>;
  mine(): Promise<GalleryRecord[]>;
  currentUserId(): Promise<string | null>;
  currentSession(): Promise<AccountSession | null>;
  listMembers(id: string): Promise<GalleryMember[]>;
  setMember(id: string, email: string, role: Exclude<GalleryRole, 'owner'>): Promise<void>;
  removeMember(id: string, email: string): Promise<void>;
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
  async publish(draft, roomCoverSource, options) { return (await loadRepository()).publish(draft, roomCoverSource, options); },
  async find(id) { return (await loadRepository()).find(id); },
  async discover() { return (await loadRepository()).discover(); },
  async mine() { return (await loadRepository()).mine(); },
  async currentUserId() { return (await loadRepository()).currentUserId(); },
  async currentSession() { return (await loadRepository()).currentSession(); },
  async listMembers(id) { return (await loadRepository()).listMembers(id); },
  async setMember(id, email, role) { return (await loadRepository()).setMember(id, email, role); },
  async removeMember(id, email) { return (await loadRepository()).removeMember(id, email); },
  async delete(id) { return (await loadRepository()).delete(id); }
};
