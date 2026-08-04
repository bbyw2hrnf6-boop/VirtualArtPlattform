import { signInAnonymously, signOut, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  type DocumentReference
} from 'firebase/firestore';
import { firebaseAuth, firebaseDb, FIREBASE_PROJECT_ID } from './firebase';
import type { GalleryRepository, GalleryRecord } from './galleryRepository';
import {
  GalleryRepositoryDataError,
  parseArtworkAsset,
  parseGalleryDocument,
  validateGalleryCoverSource,
  prepareGalleryDraftForPublication
} from './galleryValidation';
import { normalizeGalleryPublishingError } from './galleryPublishingError';
import type { GalleryDraft } from '../features/gallery/types';

const slugify = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 38);
const fromFirestore = (id: string, data: unknown): GalleryRecord => ({ ...parseGalleryDocument(id, data), id });

function firebaseErrorCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error
    ? String(error.code).toLowerCase()
    : '';
}

const RECOVERABLE_ANONYMOUS_SESSION_ERRORS = new Set([
  'auth/id-token-expired',
  'auth/invalid-user-token',
  'auth/user-disabled',
  'auth/user-not-found',
  'auth/user-token-expired'
]);

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

function blobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('The sample artwork could not be embedded for publishing.'));
    });
    reader.addEventListener('error', () => reject(reader.error ?? new Error('The sample artwork could not be read.')));
    reader.readAsDataURL(blob);
  });
}

async function embedLocalArtworkSources(draft: GalleryDraft): Promise<GalleryDraft> {
  const artworks = await Promise.all(draft.artworks.map(async (artwork) => {
    if (artwork.hidden || /^data:image\//i.test(artwork.src)) return artwork;
    const sourceUrl = new URL(artwork.src, document.baseURI);
    if (sourceUrl.origin !== location.origin) {
      throw new Error(`“${artwork.title}” must use an uploaded image or a same-origin sample asset.`);
    }
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`The sample image for “${artwork.title}” could not be loaded.`);
    const blob = await response.blob();
    if (!/^image\/(?:avif|jpeg|png|webp)$/i.test(blob.type)) {
      throw new Error(`The sample image for “${artwork.title}” uses an unsupported format.`);
    }
    return { ...artwork, src: await blobAsDataUrl(blob) };
  }));
  return { ...draft, artworks };
}

class FirebaseGalleryRepository implements GalleryRepository {
  private async authenticatedUser(): Promise<User> {
    await firebaseAuth.authStateReady();
    const currentUser = firebaseAuth.currentUser;
    if (currentUser) {
      try {
        // IndexedDB can retain an anonymous identity whose server-side record
        // was removed. A forced refresh proves that Firestore will receive a
        // current token before the first room write.
        await currentUser.getIdToken(true);
        return currentUser;
      } catch (error) {
        if (!RECOVERABLE_ANONYMOUS_SESSION_ERRORS.has(firebaseErrorCode(error))) throw error;
        await signOut(firebaseAuth);
      }
    }
    const credential = await signInAnonymously(firebaseAuth);
    await credential.user.getIdToken(true);
    return credential.user;
  }

  private async userId() {
    return (await this.authenticatedUser()).uid;
  }

  async currentUserId() {
    await firebaseAuth.authStateReady();
    return firebaseAuth.currentUser?.uid ?? null;
  }

  async publish(draft: Parameters<GalleryRepository['publish']>[0], roomCoverSource?: string): Promise<GalleryRecord> {
    let cleanupReferences: DocumentReference[] = [];
    try {
      const validatedDraft = prepareGalleryDraftForPublication(await embedLocalArtworkSources(draft));
      const ownerId = await this.userId(); const base = slugify(`${validatedDraft.artist}-${validatedDraft.title}`) || 'gallery'; const id = `${base}-${crypto.randomUUID().slice(0, 7)}`;
      const now = new Date(); const publishedAt = Timestamp.fromDate(now); const expires = new Date(now.getTime() + 10 * 86400000); const coverSrc = validateGalleryCoverSource(await createThumbnail(roomCoverSource || validatedDraft.artworks[0]?.src));
      const galleryRef = doc(firebaseDb, 'galleries', id);
      const assetRefs = validatedDraft.artworks.map((_, index) => doc(firebaseDb, 'galleryArtworks', `${id}-${index + 1}`));
      cleanupReferences = [galleryRef, ...assetRefs];
      const artworks = validatedDraft.artworks.map((artwork, index) => ({ ...artwork, assetId: assetRefs[index].id, src: '' }));
      const assetWrites = await Promise.allSettled(validatedDraft.artworks.map((artwork, index) => setDoc(assetRefs[index], {
        galleryId: id, ownerId, index, src: artwork.src,
        publishedAt, expiresAt: Timestamp.fromDate(expires), schemaVersion: 1
      })));
      const failedAssetWrite = assetWrites.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failedAssetWrite) throw failedAssetWrite.reason;
      await setDoc(galleryRef, {
        ...validatedDraft, artworks, coverSrc, ownerId,
        publishedAt, expiresAt: Timestamp.fromDate(expires), schemaVersion: 1
      });
      return { ...validatedDraft, coverSrc, id, ownerId, publishedAt: now.toISOString(), expiresAt: expires.toISOString() };
    } catch (error) {
      if (cleanupReferences.length) await bestEffortDelete(cleanupReferences);
      throw normalizeGalleryPublishingError(error, FIREBASE_PROJECT_ID);
    }
  }

  async find(id: string): Promise<GalleryRecord | null> {
    const safelyActiveAt = Timestamp.fromMillis(Date.now() + 60_000);
    let snapshot;
    try {
      snapshot = await getDoc(doc(firebaseDb, 'galleries', id));
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
      if (code !== 'permission-denied') throw error;
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
    const safelyActiveAt = Timestamp.fromMillis(Date.now() + 60_000);
    const active = query(collection(firebaseDb, 'galleries'), where('expiresAt', '>', safelyActiveAt), orderBy('expiresAt', 'desc'), limit(12));
    const records: GalleryRecord[] = [];
    for (const item of (await getDocs(active)).docs) {
      try {
        const record = fromFirestore(item.id, item.data());
        if (new Date(record.expiresAt).getTime() > Date.now()) records.push(record);
      } catch (error) {
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

export const firebaseGalleryRepository: GalleryRepository = new FirebaseGalleryRepository();
