import { signInAnonymously } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, where } from 'firebase/firestore';
import type { GalleryDraft } from '../features/gallery/types';
import { firebaseAuth, firebaseDb } from './firebase';

export interface GalleryRecord extends GalleryDraft {
  id: string;
  publishedAt: string;
  expiresAt: string;
  ownerId?: string;
  coverSrc?: string;
}

export interface GalleryRepository {
  publish(draft: GalleryDraft): Promise<GalleryRecord>;
  find(id: string): Promise<GalleryRecord | null>;
  discover(): Promise<GalleryRecord[]>;
}

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 38);
const timestampToIso = (value: unknown, fallback = new Date().toISOString()) => value instanceof Timestamp ? value.toDate().toISOString() : fallback;
const fromFirestore = (id: string, data: Record<string, unknown>): GalleryRecord => ({
  ...(data as unknown as GalleryDraft), id,
  publishedAt: timestampToIso(data.publishedAt), expiresAt: timestampToIso(data.expiresAt),
  ownerId: typeof data.ownerId === 'string' ? data.ownerId : undefined,
  coverSrc: typeof data.coverSrc === 'string' ? data.coverSrc : undefined
});

async function createThumbnail(source?: string) {
  if (!source) return '';
  const image = new Image(); image.src = source; await image.decode(); const width = Math.min(480, image.width); const ratio = width / image.width;
  const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio); canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', .62);
}

class FirebaseGalleryRepository implements GalleryRepository {
  private async userId() { return firebaseAuth.currentUser?.uid ?? (await signInAnonymously(firebaseAuth)).user.uid; }

  async publish(draft: GalleryDraft): Promise<GalleryRecord> {
    const ownerId = await this.userId(); const base = slugify(`${draft.artist}-${draft.title}`) || 'gallery'; const id = `${base}-${crypto.randomUUID().slice(0, 7)}`;
    const now = new Date(); const expires = new Date(now.getTime() + 10 * 86400000); const coverSrc = await createThumbnail(draft.artworks[0]?.src);
    const artworks = draft.artworks.map((artwork, index) => ({ ...artwork, assetId: `${id}-${index + 1}`, src: '' }));
    await Promise.all(draft.artworks.map((artwork, index) => setDoc(doc(firebaseDb, 'galleryArtworks', `${id}-${index + 1}`), {
      galleryId: id, ownerId, index, src: artwork.src,
      publishedAt: serverTimestamp(), expiresAt: Timestamp.fromDate(expires), schemaVersion: 1
    })));
    await setDoc(doc(firebaseDb, 'galleries', id), {
      ...draft, artworks, coverSrc, ownerId,
      publishedAt: serverTimestamp(), expiresAt: Timestamp.fromDate(expires), schemaVersion: 1
    });
    return { ...draft, artworks: draft.artworks, coverSrc, id, ownerId, publishedAt: now.toISOString(), expiresAt: expires.toISOString() };
  }

  async find(id: string): Promise<GalleryRecord | null> {
    try {
      const snapshot = await getDoc(doc(firebaseDb, 'galleries', id)); if (!snapshot.exists()) return null; const record = fromFirestore(snapshot.id, snapshot.data());
      const artworks = await Promise.all(record.artworks.map(async (artwork) => {
        if (!artwork.assetId) return artwork; const asset = await getDoc(doc(firebaseDb, 'galleryArtworks', artwork.assetId));
        return asset.exists() ? { ...artwork, src: String(asset.data().src || '') } : artwork;
      }));
      return { ...record, artworks };
    } catch { return null; }
  }

  async discover(): Promise<GalleryRecord[]> {
    // The public-read rule compares against request.time. A small future cutoff lets
    // Firestore prove that every query result is still live when the request arrives.
    const safelyActiveAt = Timestamp.fromMillis(Date.now() + 60_000);
    const active = query(collection(firebaseDb, 'galleries'), where('expiresAt', '>', safelyActiveAt), orderBy('expiresAt', 'desc'), limit(12));
    return (await getDocs(active)).docs.map((item) => fromFirestore(item.id, item.data())).filter((item) => new Date(item.expiresAt).getTime() > Date.now());
  }
}

export const galleryRepository: GalleryRepository = new FirebaseGalleryRepository();
