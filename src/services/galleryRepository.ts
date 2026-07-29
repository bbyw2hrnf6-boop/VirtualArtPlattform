import type { GalleryDraft } from '../features/gallery/types';

export interface GalleryRecord extends GalleryDraft { id: string; publishedAt: string }
export interface GalleryRepository {
  publish(draft: GalleryDraft): Promise<GalleryRecord>;
  find(id: string): Promise<GalleryRecord | null>;
}

const PREFIX = 'aura:gallery:';

export class LocalGalleryRepository implements GalleryRepository {
  async publish(draft: GalleryDraft): Promise<GalleryRecord> {
    const id = `${draft.artist}-${draft.title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42) || crypto.randomUUID().slice(0, 8);
    const record = { ...draft, id: `${id}-${Date.now().toString(36).slice(-4)}`, publishedAt: new Date().toISOString() };
    localStorage.setItem(PREFIX + record.id, JSON.stringify(record));
    return record;
  }
  async find(id: string): Promise<GalleryRecord | null> {
    const value = localStorage.getItem(PREFIX + id);
    return value ? JSON.parse(value) as GalleryRecord : null;
  }
}

// Swap this implementation for FirebaseGalleryRepository when cloud persistence is enabled.
export const galleryRepository: GalleryRepository = new LocalGalleryRepository();
