import { signInAnonymously } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import type { Artwork, GalleryDraft } from '../features/gallery/types';
import { firebaseAuth, firebaseDb, firebaseStorage } from './firebase';

export interface GalleryRecord extends GalleryDraft {
  id: string;
  publishedAt: string;
  expiresAt: string;
  ownerId?: string;
}

export interface GalleryRepository {
  publish(draft: GalleryDraft): Promise<GalleryRecord>;
  find(id: string): Promise<GalleryRecord | null>;
  discover(): Promise<GalleryRecord[]>;
}

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 38);
const timestampToIso = (value: unknown, fallback = new Date().toISOString()) => value instanceof Timestamp ? value.toDate().toISOString() : fallback;

const fromFirestore = (id: string, data: Record<string, unknown>): GalleryRecord => ({
  ...(data as unknown as GalleryDraft),
  id,
  publishedAt: timestampToIso(data.publishedAt),
  expiresAt: timestampToIso(data.expiresAt),
  ownerId: typeof data.ownerId === 'string' ? data.ownerId : undefined
});

class FirebaseGalleryRepository implements GalleryRepository {
  private async userId() {
    if (firebaseAuth.currentUser) return firebaseAuth.currentUser.uid;
    return (await signInAnonymously(firebaseAuth)).user.uid;
  }

  async publish(draft: GalleryDraft): Promise<GalleryRecord> {
    const ownerId = await this.userId();
    const base = slugify(`${draft.artist}-${draft.title}`) || 'gallery';
    const id = `${base}-${crypto.randomUUID().slice(0, 7)}`;
    const now = new Date();
    const expires = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

    const artworks: Artwork[] = await Promise.all(draft.artworks.map(async (artwork, index) => {
      if (!artwork.src.startsWith('data:')) return artwork;
      const assetRef = ref(firebaseStorage, `gallery-assets/${ownerId}/${id}/artwork-${index + 1}.jpg`);
      await uploadString(assetRef, artwork.src, 'data_url', {
        contentType: 'image/jpeg',
        customMetadata: { galleryId: id, expiresAt: expires.toISOString() }
      });
      return { ...artwork, src: await getDownloadURL(assetRef) };
    }));

    const record: GalleryRecord = {
      ...draft, artworks, id, ownerId,
      publishedAt: now.toISOString(), expiresAt: expires.toISOString()
    };
    await setDoc(doc(firebaseDb, 'galleries', id), {
      ...draft, artworks, ownerId,
      publishedAt: serverTimestamp(), expiresAt: Timestamp.fromDate(expires), schemaVersion: 1
    });
    return record;
  }

  async find(id: string): Promise<GalleryRecord | null> {
    try {
      const snapshot = await getDoc(doc(firebaseDb, 'galleries', id));
      return snapshot.exists() ? fromFirestore(snapshot.id, snapshot.data()) : null;
    } catch {
      return null;
    }
  }

  async discover(): Promise<GalleryRecord[]> {
    const active = query(
      collection(firebaseDb, 'galleries'),
      where('expiresAt', '>', Timestamp.now()),
      orderBy('expiresAt', 'desc'),
      limit(12)
    );
    const snapshot = await getDocs(active);
    return snapshot.docs.map((item) => fromFirestore(item.id, item.data()));
  }
}

export const galleryRepository: GalleryRepository = new FirebaseGalleryRepository();
