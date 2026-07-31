import { signInAnonymously } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  type DocumentReference
} from 'firebase/firestore';
import type { GalleryDraft } from '../features/gallery/types';
import { firebaseAuth, firebaseDb } from './firebase';
import {
  GalleryRepositoryDataError,
  parseArtworkAsset,
  parseGalleryDocument,
  validateGalleryCoverSource,
  validateGalleryDraft
} from './galleryValidation';

export { GalleryRepositoryDataError } from './galleryValidation';

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
  currentUserId(): Promise<string | null>;
  delete(id: string): Promise<void>;
}

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 38);
const fromFirestore = (id: string, data: unknown): GalleryRecord => ({ ...parseGalleryDocument(id, data), id });

async function bestEffortDelete(references: DocumentReference[]) {
  return Promise.allSettled(references.map((reference) => deleteDoc(reference)));
}

async function createThumbnail(source?: string) {
  if (!source) return '';
  const image = new Image(); image.src = source; await image.decode();
  let candidate = '';
  for (const maximumWidth of [480, 360, 280, 220]) {
    const width = Math.min(maximumWidth, image.width); const ratio = width / image.width;
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.width * ratio)); canvas.height = Math.max(1, Math.round(image.height * ratio)); const context = canvas.getContext('2d');
    if (!context) throw new Error('The gallery cover could not be prepared in this browser.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [.64, .52, .42, .34]) {
      candidate = canvas.toDataURL('image/webp', quality);
      if (!candidate.startsWith('data:image/webp')) candidate = canvas.toDataURL('image/jpeg', quality);
      if (candidate.length < 390_000) return candidate;
    }
  }
  return candidate;
}

class FirebaseGalleryRepository implements GalleryRepository {
  private async userId() { return firebaseAuth.currentUser?.uid ?? (await signInAnonymously(firebaseAuth)).user.uid; }

  async currentUserId() {
    await firebaseAuth.authStateReady();
    return firebaseAuth.currentUser?.uid ?? null;
  }

  async publish(draft: GalleryDraft): Promise<GalleryRecord> {
    const validatedDraft = validateGalleryDraft(draft, { recordId: 'publication draft', requireArtworkSources: true });
    const ownerId = await this.userId(); const base = slugify(`${validatedDraft.artist}-${validatedDraft.title}`) || 'gallery'; const id = `${base}-${crypto.randomUUID().slice(0, 7)}`;
    const now = new Date(); const expires = new Date(now.getTime() + 10 * 86400000); const coverSrc = validateGalleryCoverSource(await createThumbnail(validatedDraft.artworks[0]?.src));
    const galleryRef = doc(firebaseDb, 'galleries', id);
    const assetRefs = validatedDraft.artworks.map((_, index) => doc(firebaseDb, 'galleryArtworks', `${id}-${index + 1}`));
    const artworks = validatedDraft.artworks.map((artwork, index) => ({ ...artwork, assetId: assetRefs[index].id, src: '' }));
    const assetWrites = await Promise.allSettled(validatedDraft.artworks.map((artwork, index) => setDoc(assetRefs[index], {
      galleryId: id, ownerId, index, src: artwork.src,
      publishedAt: serverTimestamp(), expiresAt: Timestamp.fromDate(expires), schemaVersion: 1
    })));
    const failedAssetWrite = assetWrites.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (failedAssetWrite) {
      await bestEffortDelete(assetRefs);
      throw failedAssetWrite.reason;
    }
    try {
      await setDoc(galleryRef, {
        ...validatedDraft, artworks, coverSrc, ownerId,
        publishedAt: serverTimestamp(), expiresAt: Timestamp.fromDate(expires), schemaVersion: 1
      });
    } catch (error) {
      await bestEffortDelete([galleryRef, ...assetRefs]);
      throw error;
    }
    return { ...validatedDraft, coverSrc, id, ownerId, publishedAt: now.toISOString(), expiresAt: expires.toISOString() };
  }

  async find(id: string): Promise<GalleryRecord | null> {
    const safelyActiveAt = Timestamp.fromMillis(Date.now() + 60_000);
    let snapshot;
    try {
      snapshot = await getDoc(doc(firebaseDb, 'galleries', id));
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      if (code !== 'permission-denied') throw error;
      // The expiry rule intentionally returns permission-denied for a missing or
      // expired direct link. Probe the public active-gallery query: if it works,
      // Firebase itself is healthy and this link is simply unavailable.
      const permissionProbe = query(
        collection(firebaseDb, 'galleries'),
        where('expiresAt', '>', safelyActiveAt),
        orderBy('expiresAt', 'desc'),
        limit(1)
      );
      try { await getDocs(permissionProbe); return null; }
      catch { throw error; }
    }
    if (!snapshot.exists()) return null;
    const record = fromFirestore(snapshot.id, snapshot.data());
    if (new Date(record.expiresAt).getTime() <= Date.now()) return null;
    const artworks = await Promise.all(record.artworks.map(async (artwork, index) => {
      if (!artwork.assetId) return artwork;
      const asset = await getDoc(doc(firebaseDb, 'galleryArtworks', artwork.assetId));
      if (!asset.exists()) throw new GalleryRepositoryDataError(artwork.assetId, 'asset', 'referenced artwork document is missing');
      const parsed = parseArtworkAsset(asset.id, asset.data(), { galleryId: record.id, ownerId: record.ownerId, index, expiresAt: record.expiresAt });
      if (new Date(parsed.expiresAt).getTime() <= Date.now()) return { ...artwork, src: '' };
      return { ...artwork, src: parsed.src };
    }));
    if (artworks.some((artwork) => !artwork.src)) return null;
    return { ...record, artworks };
  }

  async discover(): Promise<GalleryRecord[]> {
    // The public-read rule compares against request.time. A small future cutoff lets
    // Firestore prove that every query result is still live when the request arrives.
    const safelyActiveAt = Timestamp.fromMillis(Date.now() + 60_000);
    const active = query(collection(firebaseDb, 'galleries'), where('expiresAt', '>', safelyActiveAt), orderBy('expiresAt', 'desc'), limit(12));
    const records: GalleryRecord[] = [];
    for (const item of (await getDocs(active)).docs) {
      try {
        const record = fromFirestore(item.id, item.data());
        if (new Date(record.expiresAt).getTime() > Date.now()) records.push(record);
      } catch (error) {
        // A single legacy or corrupted public document must not take the entire
        // Discover section offline. Direct navigation still reports the error.
        if (!(error instanceof GalleryRepositoryDataError)) throw error;
        console.warn('Skipping invalid Discover gallery.', error);
      }
    }
    return records;
  }

  async delete(id: string): Promise<void> {
    const ownerId = await this.userId();
    const galleryRef = doc(firebaseDb, 'galleries', id);
    const snapshot = await getDoc(galleryRef);
    if (!snapshot.exists()) return;
    const gallery = fromFirestore(snapshot.id, snapshot.data());
    if (gallery.ownerId !== ownerId) throw new Error('Only the artist who published this gallery can delete it.');
    const assetIds = gallery.artworks.map((artwork) => artwork.assetId).filter((assetId): assetId is string => Boolean(assetId));
    const batch = writeBatch(firebaseDb); assetIds.forEach((assetId) => batch.delete(doc(firebaseDb, 'galleryArtworks', assetId))); batch.delete(galleryRef); await batch.commit();
  }
}

export const galleryRepository: GalleryRepository = new FirebaseGalleryRepository();
