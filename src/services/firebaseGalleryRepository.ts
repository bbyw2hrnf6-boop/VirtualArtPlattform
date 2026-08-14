import { signInAnonymously, signOut, type User } from "firebase/auth";
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
  type DocumentReference,
} from "firebase/firestore";
import {
  deleteObject,
  getBlob,
  ref,
  uploadBytes,
  type StorageReference,
} from "firebase/storage";
import {
  firebaseAuth,
  firebaseDb,
  firebaseStorage,
  FIREBASE_PROJECT_ID,
} from "./firebase";
import type { GalleryRepository, GalleryRecord } from "./galleryRepository";
import {
  GalleryRepositoryDataError,
  parseArtworkAsset,
  parseGalleryDocument,
  validateGalleryCoverSource,
  prepareGalleryDraftForPublication,
} from "./galleryValidation";
import { normalizeGalleryPublishingError } from "./galleryPublishingError";
import type { GalleryDraft } from "../features/gallery/types";
import {
  galleryArtworkPath,
  galleryCoverPath,
  isOwnedGalleryStoragePath,
} from "./galleryStoragePaths";

const MAX_ARTWORK_DOWNLOAD_BYTES = 2 * 1024 * 1024;
const MAX_COVER_DOWNLOAD_BYTES = 1024 * 1024;
const MAX_CACHED_OBJECT_URLS = 64;
const ARTWORK_DOWNLOAD_CONCURRENCY = 6;
const objectUrls = new Map<string, Promise<string>>();

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 38);
const fromFirestore = (id: string, data: unknown): GalleryRecord => ({
  ...parseGalleryDocument(id, data),
  id,
});

function firebaseErrorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error
    ? String(error.code).toLowerCase()
    : "";
}

const RECOVERABLE_ANONYMOUS_SESSION_ERRORS = new Set([
  "auth/id-token-expired",
  "auth/invalid-user-token",
  "auth/user-disabled",
  "auth/user-not-found",
  "auth/user-token-expired",
]);

async function bestEffortDeleteDocuments(references: DocumentReference[]) {
  return Promise.allSettled(references.map((reference) => deleteDoc(reference)));
}

async function bestEffortDeleteObjects(references: StorageReference[]) {
  return Promise.allSettled(references.map((reference) => deleteObject(reference)));
}

async function deleteObjects(references: StorageReference[]) {
  const results = await Promise.allSettled(
    references.map((reference) => deleteObject(reference)),
  );
  const failure = results.find(
    (result): result is PromiseRejectedResult =>
      result.status === "rejected" &&
      firebaseErrorCode(result.reason) !== "storage/object-not-found",
  );
  if (failure) throw failure.reason;
}

async function createThumbnail(source?: string) {
  if (!source) return "";
  const image = new Image();
  image.src = source;
  await image.decode();
  let candidate = "";
  for (const maximumWidth of [640, 480, 360, 280]) {
    const width = Math.min(maximumWidth, image.width);
    const ratio = width / image.width;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("The gallery cover could not be prepared in this browser.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.76, 0.64, 0.52, 0.42]) {
      candidate = canvas.toDataURL("image/webp", quality);
      if (!candidate.startsWith("data:image/webp"))
        candidate = canvas.toDataURL("image/jpeg", quality);
      if (candidate.length < 700_000) return candidate;
    }
  }
  return candidate;
}

function blobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The sample artwork could not be embedded for publishing."));
    });
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("The sample artwork could not be read.")),
    );
    reader.readAsDataURL(blob);
  });
}

async function dataUrlAsBlob(source: string) {
  const response = await fetch(source);
  if (!response.ok) throw new Error("The prepared image could not be read for upload.");
  const blob = await response.blob();
  if (!/^image\/(?:avif|jpeg|png|webp)$/i.test(blob.type))
    throw new Error("The prepared image uses an unsupported format.");
  return blob;
}

async function embedLocalArtworkSources(draft: GalleryDraft): Promise<GalleryDraft> {
  const artworks = await Promise.all(
    draft.artworks.map(async (artwork) => {
      if (artwork.hidden || /^data:image\//i.test(artwork.src)) return artwork;
      const sourceUrl = new URL(artwork.src, document.baseURI);
      if (sourceUrl.origin !== location.origin)
        throw new Error(
          `“${artwork.title}” must use an uploaded image or a same-origin sample asset.`,
        );
      const response = await fetch(sourceUrl);
      if (!response.ok)
        throw new Error(`The sample image for “${artwork.title}” could not be loaded.`);
      const blob = await response.blob();
      if (!/^image\/(?:avif|jpeg|png|webp)$/i.test(blob.type))
        throw new Error(
          `The sample image for “${artwork.title}” uses an unsupported format.`,
        );
      return { ...artwork, src: await blobAsDataUrl(blob) };
    }),
  );
  return { ...draft, artworks };
}

function storageObjectUrl(path: string, maximumBytes: number) {
  const cached = objectUrls.get(path);
  if (cached) return cached;
  const pending = getBlob(ref(firebaseStorage, path), maximumBytes).then((blob) =>
    URL.createObjectURL(blob),
  );
  objectUrls.set(path, pending);
  if (objectUrls.size > MAX_CACHED_OBJECT_URLS) {
    const oldest = objectUrls.entries().next().value as
      | [string, Promise<string>]
      | undefined;
    if (oldest) {
      objectUrls.delete(oldest[0]);
      void oldest[1].then((url) => URL.revokeObjectURL(url), () => undefined);
    }
  }
  pending.catch(() => objectUrls.delete(path));
  return pending;
}

function validateStoragePathOwnership(
  path: string,
  ownerId: string | undefined,
  galleryId: string,
  field: string,
) {
  if (!ownerId || !isOwnedGalleryStoragePath(path, ownerId, galleryId))
    throw new GalleryRepositoryDataError(
      galleryId,
      field,
      "does not belong to the gallery owner",
    );
  return path;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const workers = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor++;
        results[index] = await mapper(values[index], index);
      }
    }),
  );
  const failed = workers.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failed) throw failed.reason;
  return results;
}

class FirebaseGalleryRepository implements GalleryRepository {
  private async authenticatedUser(): Promise<User> {
    await firebaseAuth.authStateReady();
    const currentUser = firebaseAuth.currentUser;
    if (currentUser) {
      try {
        await currentUser.getIdToken(true);
        return currentUser;
      } catch (error) {
        if (!RECOVERABLE_ANONYMOUS_SESSION_ERRORS.has(firebaseErrorCode(error)))
          throw error;
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

  async publish(
    draft: Parameters<GalleryRepository["publish"]>[0],
    roomCoverSource?: string,
  ): Promise<GalleryRecord> {
    const uploaded: StorageReference[] = [];
    let galleryRef: DocumentReference | undefined;
    try {
      const validatedDraft = prepareGalleryDraftForPublication(
        await embedLocalArtworkSources(draft),
      );
      const ownerId = await this.userId();
      const base = slugify(`${validatedDraft.artist}-${validatedDraft.title}`) || "gallery";
      const id = `${base}-${crypto.randomUUID().slice(0, 7)}`;
      const now = new Date();
      const expires = new Date(now.getTime() + 10 * 86_400_000);
      const publishedAt = Timestamp.fromDate(now);
      const expiresAt = Timestamp.fromDate(expires);
      const expiresAtMs = String(expires.getTime());
      const coverSource = validateGalleryCoverSource(
        await createThumbnail(roomCoverSource || validatedDraft.artworks[0]?.src),
      );
      const coverPath = galleryCoverPath(ownerId, id);
      const coverReference = ref(firebaseStorage, coverPath);
      uploaded.push(coverReference);
      await uploadBytes(coverReference, await dataUrlAsBlob(coverSource), {
        contentType: coverSource.slice(5, coverSource.indexOf(";")),
        cacheControl: "public,max-age=3600",
        customMetadata: {
          ownerId,
          galleryId: id,
          kind: "cover",
          expiresAtMs,
          schemaVersion: "2",
        },
      });

      const artworks = await mapWithConcurrency(
        validatedDraft.artworks,
        3,
        async (artwork, index) => {
          const storagePath = galleryArtworkPath(ownerId, id, index);
          const reference = ref(firebaseStorage, storagePath);
          uploaded.push(reference);
          await uploadBytes(reference, await dataUrlAsBlob(artwork.src), {
            contentType: artwork.src.slice(5, artwork.src.indexOf(";")),
            cacheControl: "public,max-age=3600",
            customMetadata: {
              ownerId,
              galleryId: id,
              kind: "artwork",
              index: String(index),
              expiresAtMs,
              schemaVersion: "2",
            },
          });
          return { ...artwork, storagePath, src: "" };
        },
      );

      galleryRef = doc(firebaseDb, "galleries", id);
      await setDoc(galleryRef, {
        ...validatedDraft,
        artworks,
        coverPath,
        ownerId,
        publishedAt,
        expiresAt,
        schemaVersion: 2,
      });
      return {
        ...validatedDraft,
        coverSrc: coverSource,
        coverPath,
        id,
        ownerId,
        publishedAt: now.toISOString(),
        expiresAt: expires.toISOString(),
      };
    } catch (error) {
      if (galleryRef) await bestEffortDeleteDocuments([galleryRef]);
      if (uploaded.length) await bestEffortDeleteObjects(uploaded);
      throw normalizeGalleryPublishingError(error, FIREBASE_PROJECT_ID);
    }
  }

  async find(id: string): Promise<GalleryRecord | null> {
    const safelyActiveAt = Timestamp.fromMillis(Date.now() + 60_000);
    let snapshot;
    try {
      snapshot = await getDoc(doc(firebaseDb, "galleries", id));
    } catch (error) {
      const code = firebaseErrorCode(error);
      if (code !== "permission-denied" && code !== "firestore/permission-denied")
        throw error;
      const permissionProbe = query(
        collection(firebaseDb, "galleries"),
        where("expiresAt", ">", safelyActiveAt),
        orderBy("expiresAt", "desc"),
        limit(1),
      );
      try {
        await getDocs(permissionProbe);
        return null;
      } catch {
        throw error;
      }
    }
    if (!snapshot.exists()) return null;
    const record = fromFirestore(snapshot.id, snapshot.data());
    if (new Date(record.expiresAt).getTime() <= Date.now()) return null;
    const artworks = await mapWithConcurrency(
      record.artworks,
      ARTWORK_DOWNLOAD_CONCURRENCY,
      async (artwork, index) => {
        if (artwork.storagePath) {
          validateStoragePathOwnership(
            artwork.storagePath,
            record.ownerId,
            record.id,
            `artworks[${index}].storagePath`,
          );
          return {
            ...artwork,
            src: await storageObjectUrl(
              artwork.storagePath,
              MAX_ARTWORK_DOWNLOAD_BYTES,
            ),
          };
        }
        if (!artwork.assetId) return artwork;
        const asset = await getDoc(
          doc(firebaseDb, "galleryArtworks", artwork.assetId),
        );
        if (!asset.exists())
          throw new GalleryRepositoryDataError(
            artwork.assetId,
            "asset",
            "referenced artwork document is missing",
          );
        const parsed = parseArtworkAsset(artwork.assetId, asset.data(), {
          galleryId: record.id,
          ownerId: record.ownerId,
          index,
          expiresAt: record.expiresAt,
        });
        if (new Date(parsed.expiresAt).getTime() <= Date.now())
          return { ...artwork, src: "" };
        return { ...artwork, src: parsed.src };
      },
    );
    if (artworks.some((artwork) => !artwork.src)) return null;
    // The public viewer renders the room itself and never consumes its Discover
    // cover. Avoid delaying the first usable frame with a separate cover download.
    // Legacy records keep their already-embedded coverSrc through `record`.
    return { ...record, artworks };
  }

  async discover(): Promise<GalleryRecord[]> {
    const safelyActiveAt = Timestamp.fromMillis(Date.now() + 60_000);
    const active = query(
      collection(firebaseDb, "galleries"),
      where("expiresAt", ">", safelyActiveAt),
      orderBy("expiresAt", "desc"),
      limit(12),
    );
    const records: GalleryRecord[] = [];
    for (const item of (await getDocs(active)).docs) {
      try {
        const record = fromFirestore(item.id, item.data());
        if (new Date(record.expiresAt).getTime() <= Date.now()) continue;
        const coverSrc = record.coverPath
          ? await storageObjectUrl(
              validateStoragePathOwnership(record.coverPath, record.ownerId, record.id, "coverPath"),
              MAX_COVER_DOWNLOAD_BYTES,
            )
          : record.coverSrc;
        records.push({ ...record, ...(coverSrc ? { coverSrc } : {}) });
      } catch (error) {
        if (!(error instanceof GalleryRepositoryDataError)) throw error;
        console.warn("Skipping invalid Discover gallery.", error);
      }
    }
    return records;
  }

  async delete(id: string): Promise<void> {
    const ownerId = await this.userId();
    const galleryRef = doc(firebaseDb, "galleries", id);
    const snapshot = await getDoc(galleryRef);
    if (!snapshot.exists()) return;
    const gallery = fromFirestore(snapshot.id, snapshot.data());
    if (gallery.ownerId !== ownerId)
      throw new Error("Only the artist who published this gallery can delete it.");
    const storagePaths = [
      gallery.coverPath,
      ...gallery.artworks.map((artwork) => artwork.storagePath),
    ].filter((path): path is string => Boolean(path));
    if (storagePaths.length)
      await deleteObjects(storagePaths.map((path) => ref(firebaseStorage, path)));
    const assetIds = gallery.artworks
      .map((artwork) => artwork.assetId)
      .filter((assetId): assetId is string => Boolean(assetId));
    const batch = writeBatch(firebaseDb);
    assetIds.forEach((assetId) =>
      batch.delete(doc(firebaseDb, "galleryArtworks", assetId)),
    );
    batch.delete(galleryRef);
    await batch.commit();
  }
}

export const firebaseGalleryRepository: GalleryRepository =
  new FirebaseGalleryRepository();
