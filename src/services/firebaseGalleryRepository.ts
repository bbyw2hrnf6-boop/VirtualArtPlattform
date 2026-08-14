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
import {
  GalleryAccessDeniedError,
  type GalleryRepository,
  type GalleryRecord,
} from "./galleryRepository";
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
import type { GalleryMember, GalleryRole } from "./galleryAccess";
import type { AccountSession } from "./accountTypes";

const MAX_ARTWORK_DOWNLOAD_BYTES = 2 * 1024 * 1024;
const MAX_COVER_DOWNLOAD_BYTES = 1024 * 1024;
const MAX_CACHED_OBJECT_URLS = 64;
const ARTWORK_DOWNLOAD_CONCURRENCY = 6;
const DISCOVER_COVER_CONCURRENCY = 4;
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

function accountSession(user: User | null): AccountSession | null {
  if (!user) return null;
  return {
    uid: user.uid,
    ...(user.email ? { email: user.email } : {}),
    ...(user.displayName ? { displayName: user.displayName } : {}),
    isAnonymous: user.isAnonymous,
    emailVerified: user.emailVerified,
    providers: user.providerData.map((provider) => provider.providerId),
  };
}

function normalizedMemberEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (
    normalized.length > 254 ||
    !/^[a-z0-9.!#$%&'*+=?^_{}|~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(
      normalized,
    )
  )
    throw new Error("Enter a valid member email address.");
  return normalized;
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

  async currentUserId() {
    await firebaseAuth.authStateReady();
    return firebaseAuth.currentUser?.uid ?? null;
  }

  async currentSession() {
    await firebaseAuth.authStateReady();
    return accountSession(firebaseAuth.currentUser);
  }

  async publish(
    draft: Parameters<GalleryRepository["publish"]>[0],
    roomCoverSource?: string,
    options: Parameters<GalleryRepository["publish"]>[2] = {
      visibility: "public",
    },
  ): Promise<GalleryRecord> {
    const uploaded: StorageReference[] = [];
    let galleryRef: DocumentReference | undefined;
    try {
      const validatedDraft = prepareGalleryDraftForPublication(
        await embedLocalArtworkSources(draft),
      );
      const owner = await this.authenticatedUser();
      const ownerId = owner.uid;
      const verifiedAccount = !owner.isAnonymous && owner.emailVerified;
      const visibility = options.visibility ?? "public";
      if (!verifiedAccount && visibility !== "public")
        throw new Error(
          "Verify an email or Google account before publishing an unlisted or private room.",
        );
      const retention = verifiedAccount ? "account-preview" : "guest-10-days";
      const base = slugify(`${validatedDraft.artist}-${validatedDraft.title}`) || "gallery";
      const id = `${base}-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
      const now = new Date();
      const expires = new Date(
        now.getTime() + (verifiedAccount ? 365 : 10) * 86_400_000,
      );
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
          schemaVersion: "3",
          visibility,
          retention,
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
              schemaVersion: "3",
              visibility,
              retention,
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
        schemaVersion: 3,
        visibility,
        retention,
        accessVersion: 1,
      });
      return {
        ...validatedDraft,
        coverSrc: coverSource,
        coverPath,
        id,
        ownerId,
        publishedAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        visibility,
        retention,
        accessVersion: 1,
      };
    } catch (error) {
      if (galleryRef) await bestEffortDeleteDocuments([galleryRef]);
      if (uploaded.length) await bestEffortDeleteObjects(uploaded);
      throw normalizeGalleryPublishingError(error, FIREBASE_PROJECT_ID);
    }
  }

  async find(id: string): Promise<GalleryRecord | null> {
    await firebaseAuth.authStateReady();
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
        where("visibility", "==", "public"),
        where("expiresAt", ">", safelyActiveAt),
        orderBy("expiresAt", "desc"),
        limit(1),
      );
      try {
        await getDocs(permissionProbe);
      } catch {
        throw error;
      }
      throw new GalleryAccessDeniedError(id);
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
    const publicActive = query(
      collection(firebaseDb, "galleries"),
      where("visibility", "==", "public"),
      where("expiresAt", ">", safelyActiveAt),
      orderBy("expiresAt", "desc"),
      limit(12),
    );
    const legacyActive = query(
      collection(firebaseDb, "galleries"),
      where("schemaVersion", "in", [1, 2]),
      where("expiresAt", ">", safelyActiveAt),
      orderBy("expiresAt", "desc"),
      limit(12),
    );
    const snapshotResults = await Promise.allSettled([
      getDocs(publicActive),
      getDocs(legacyActive),
    ]);
    const snapshots = snapshotResults.flatMap((result) => {
      if (result.status === "fulfilled") return [result.value];
      console.warn("One Discover query was unavailable.", result.reason);
      return [];
    });
    if (!snapshots.length) {
      const failure = snapshotResults.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      throw failure?.reason ?? new Error("Discover is unavailable.");
    }
    const items = Array.from(
      new Map(
        snapshots.flatMap((snapshot) => snapshot.docs).map((item) => [item.id, item]),
      ).values(),
    ).slice(0, 12);
    const records: GalleryRecord[] = [];
    const discovered = await mapWithConcurrency(
      items,
      DISCOVER_COVER_CONCURRENCY,
      async (item) => {
        try {
          const record = fromFirestore(item.id, item.data());
          if (
            record.visibility !== "public" ||
            new Date(record.expiresAt).getTime() <= Date.now()
          )
            return null;
          let coverSrc = record.coverSrc;
          if (record.coverPath) {
            try {
              coverSrc = await storageObjectUrl(
                validateStoragePathOwnership(
                  record.coverPath,
                  record.ownerId,
                  record.id,
                  "coverPath",
                ),
                MAX_COVER_DOWNLOAD_BYTES,
              );
            } catch (error) {
              // A missing or inaccessible cover must not hide an otherwise
              // valid exhibition from Discover. The card has a room fallback.
              console.warn("Discover cover unavailable.", record.id, error);
            }
          }
          return { ...record, ...(coverSrc ? { coverSrc } : {}) };
        } catch (error) {
          console.warn("Skipping invalid Discover gallery.", error);
          return null;
        }
      },
    );
    records.push(
      ...discovered
        .filter((record): record is GalleryRecord => Boolean(record))
        .sort(
          (a, b) =>
            new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
        ),
    );
    return records;
  }

  async mine(): Promise<GalleryRecord[]> {
    const owner = await this.authenticatedUser();
    if (owner.isAnonymous)
      throw new Error("Sign in to see rooms saved to your account.");
    // Owner-only listing does not need a composite index. Filtering expiry in
    // the client also lets the account screen survive while an index is being
    // created and avoids coupling the whole list to one Storage cover.
    const owned = query(
      collection(firebaseDb, "galleries"),
      where("ownerId", "==", owner.uid),
      limit(30),
    );
    const records = await mapWithConcurrency(
      (await getDocs(owned)).docs,
      DISCOVER_COVER_CONCURRENCY,
      async (item) => {
        const record = fromFirestore(item.id, item.data());
        let coverSrc = record.coverSrc;
        if (record.coverPath) {
          try {
            coverSrc = await storageObjectUrl(
              validateStoragePathOwnership(
                record.coverPath,
                record.ownerId,
                record.id,
                "coverPath",
              ),
              MAX_COVER_DOWNLOAD_BYTES,
            );
          } catch (error) {
            console.warn("Account room cover unavailable.", record.id, error);
          }
        }
        return { ...record, ...(coverSrc ? { coverSrc } : {}) };
      },
    );
    const activeAt = Date.now() + 60_000;
    return records
      .filter((record) => new Date(record.expiresAt).getTime() > activeAt)
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );
  }

  async editableDraft(id: string): Promise<GalleryDraft> {
    const owner = await this.authenticatedUser();
    const gallery = await this.find(id);
    if (!gallery) throw new Error("This room no longer exists.");
    if (gallery.ownerId !== owner.uid)
      throw new Error("Only the room owner can edit this publication.");
    const artworks = await mapWithConcurrency(
      gallery.artworks,
      ARTWORK_DOWNLOAD_CONCURRENCY,
      async (artwork) => {
        const editable = { ...artwork };
        delete editable.assetId;
        delete editable.storagePath;
        return {
          ...editable,
          src: /^blob:/i.test(artwork.src)
            ? await fetch(artwork.src).then(async (response) => {
                if (!response.ok)
                  throw new Error(`“${artwork.title}” could not be prepared for editing.`);
                return blobAsDataUrl(await response.blob());
              })
            : artwork.src,
        };
      },
    );
    return {
      title: gallery.title,
      artist: gallery.artist,
      templateId: gallery.templateId,
      wall: gallery.wall,
      floor: gallery.floor,
      ceiling: gallery.ceiling,
      lighting: gallery.lighting,
      decor: gallery.decor.map((item) => ({ ...item })),
      artworks,
    };
  }

  private async ownedGallery(id: string) {
    const owner = await this.authenticatedUser();
    if (owner.isAnonymous || !owner.emailVerified)
      throw new Error("Use a verified account to manage room access.");
    const reference = doc(firebaseDb, "galleries", id);
    const snapshot = await getDoc(reference);
    if (!snapshot.exists()) throw new Error("This room no longer exists.");
    const gallery = fromFirestore(snapshot.id, snapshot.data());
    if (gallery.ownerId !== owner.uid)
      throw new Error("Only the room owner can manage access.");
    return owner;
  }

  async listMembers(id: string): Promise<GalleryMember[]> {
    await this.ownedGallery(id);
    const snapshot = await getDocs(
      query(collection(firebaseDb, "galleries", id, "members"), limit(50)),
    );
    return snapshot.docs
      .map((item) => {
        const data = item.data();
        const role = data.role;
        if (role !== "editor" && role !== "viewer") return null;
        const addedAt = data.addedAt;
        return {
          email: item.id,
          role,
          addedAt:
            addedAt instanceof Timestamp
              ? addedAt.toDate().toISOString()
              : new Date(0).toISOString(),
        } satisfies GalleryMember;
      })
      .filter((member): member is GalleryMember => Boolean(member))
      .sort((a, b) => a.email.localeCompare(b.email));
  }

  async setMember(
    id: string,
    email: string,
    role: Exclude<GalleryRole, "owner">,
  ): Promise<void> {
    const owner = await this.ownedGallery(id);
    const normalizedEmail = normalizedMemberEmail(email);
    if (normalizedEmail === owner.email?.toLowerCase())
      throw new Error("The owner already has full access.");
    const memberReference = doc(
      firebaseDb,
      "galleries",
      id,
      "members",
      normalizedEmail,
    );
    if (!(await getDoc(memberReference)).exists()) {
      const current = await getDocs(
        query(collection(firebaseDb, "galleries", id, "members"), limit(50)),
      );
      if (current.size >= 50)
        throw new Error("This preview supports up to 50 invited accounts per room.");
    }
    await setDoc(memberReference, {
      email: normalizedEmail,
      role,
      addedAt: Timestamp.now(),
      addedBy: owner.uid,
    });
  }

  async removeMember(id: string, email: string): Promise<void> {
    await this.ownedGallery(id);
    await deleteDoc(
      doc(firebaseDb, "galleries", id, "members", normalizedMemberEmail(email)),
    );
  }

  async delete(id: string): Promise<void> {
    const ownerId = (await this.authenticatedUser()).uid;
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
    const members = await getDocs(
      query(collection(firebaseDb, "galleries", id, "members"), limit(50)),
    );
    members.docs.forEach((member) => batch.delete(member.ref));
    assetIds.forEach((assetId) =>
      batch.delete(doc(firebaseDb, "galleryArtworks", assetId)),
    );
    batch.delete(galleryRef);
    await batch.commit();
  }
}

export const firebaseGalleryRepository: GalleryRepository =
  new FirebaseGalleryRepository();
