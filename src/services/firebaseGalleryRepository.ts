import { signInAnonymously, signOut, type User } from "firebase/auth";
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  type DocumentReference,
} from "firebase/firestore";
import {
  deleteObject,
  getBlob,
  ref,
  uploadBytes,
  type StorageReference,
} from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import {
  firebaseAuth,
  firebaseDb,
  firebaseFunctions,
  firebaseStorage,
  FIREBASE_PROJECT_ID,
} from "./firebase";
import {
  discoverCoverSource,
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
import type { Artwork, GalleryDraft } from "../features/gallery/types";
import {
  galleryArtworkPath,
  galleryCoverPath,
  galleryRevisionArtworkPath,
  galleryRevisionCoverPath,
  isOwnedGalleryStoragePath,
} from "./galleryStoragePaths";
import type {
  GalleryEditTarget,
  GalleryMember,
  GalleryRole,
  GalleryInvite,
} from "./galleryAccess";
import type { AccountSession } from "./accountTypes";
import { normalizedImageBlob } from "./imageBlob";
import { isDiscoverEligible } from "./discoverEligibility";

const MAX_ARTWORK_DOWNLOAD_BYTES = 2 * 1024 * 1024;
const MAX_COVER_DOWNLOAD_BYTES = 1024 * 1024;
const MAX_CACHED_OBJECT_URLS = 64;
const ARTWORK_DOWNLOAD_CONCURRENCY = 3;
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
      throw new Error("The Space cover could not be prepared in this browser.");
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
  return normalizedImageBlob(await response.blob());
}

async function embeddableArtworkSource(
  artwork: Artwork,
  source: string,
): Promise<string> {
  if (/^data:image\//i.test(source)) return source;
  const sourceUrl = new URL(source, document.baseURI);
  if (sourceUrl.protocol !== "blob:" && sourceUrl.origin !== location.origin)
    throw new Error(
      `“${artwork.title}” must use an uploaded image or a same-origin sample asset.`,
    );
  const response = await fetch(sourceUrl);
  if (!response.ok)
    throw new Error(`The image for “${artwork.title}” could not be loaded.`);
  try {
    const { blob } = await normalizedImageBlob(await response.blob());
    return blobAsDataUrl(blob);
  } catch {
    throw new Error(`The image for “${artwork.title}” uses an unsupported format.`);
  }
}

async function embedLocalArtworkSources(
  draft: GalleryDraft,
  publishedFallback?: (
    artwork: Artwork,
    index: number,
  ) => Promise<string | undefined>,
): Promise<GalleryDraft> {
  const artworks = await Promise.all(
    draft.artworks.map(async (artwork, index) => {
      if (artwork.hidden || /^data:image\//i.test(artwork.src)) return artwork;
      try {
        return {
          ...artwork,
          src: await embeddableArtworkSource(artwork, artwork.src),
        };
      } catch (sourceError) {
        const fallback = await publishedFallback?.(artwork, index);
        if (!fallback) throw sourceError;
        return {
          ...artwork,
          src: await embeddableArtworkSource(artwork, fallback),
        };
      }
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

async function publishedArtworkSource(
  gallery: GalleryRecord,
  artwork: Artwork,
  index: number,
): Promise<string | undefined> {
  if (artwork.storagePath) {
    validateStoragePathOwnership(
      artwork.storagePath,
      gallery.ownerId,
      gallery.id,
      `artworks[${index}].storagePath`,
    );
    return storageObjectUrl(artwork.storagePath, MAX_ARTWORK_DOWNLOAD_BYTES);
  }
  if (artwork.assetId) {
    const asset = await getDoc(doc(firebaseDb, "galleryArtworks", artwork.assetId));
    if (!asset.exists())
      throw new GalleryRepositoryDataError(
        artwork.assetId,
        "asset",
        "referenced artwork document is missing",
      );
    return parseArtworkAsset(artwork.assetId, asset.data(), {
      galleryId: gallery.id,
      ownerId: gallery.ownerId,
      index,
      expiresAt: gallery.expiresAt,
    }).src;
  }
  return artwork.src || undefined;
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

export class FirebaseGalleryRepository implements GalleryRepository {
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
    let permittedGalleryId: string | undefined;
    try {
      const validatedDraft = prepareGalleryDraftForPublication(
        await embedLocalArtworkSources(draft),
      );
      const owner = await this.authenticatedUser();
      const ownerId = owner.uid;
      const verifiedAccount = !owner.isAnonymous && owner.emailVerified;
      const visibility = options.visibility ?? "public";
      if (!verifiedAccount)
        throw new Error(
          "Sign in with Google or create and verify a LIEUVA account before publishing. Your Project and Walk Preview remain available.",
        );
      const retention = "account-preview" as const;
      const base = slugify(`${validatedDraft.artist}-${validatedDraft.title}`) || "gallery";
      const id = `${base}-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
      permittedGalleryId = id;
      const permit = await httpsCallable<
        { galleryId: string; visibility: string },
        { expiresAt: string; retention: "account-preview" }
      >(firebaseFunctions, "beginAuraGalleryPublication")({
        galleryId: id,
        visibility,
      });
      const now = new Date();
      const expires = new Date(permit.data.expiresAt);
      if (!Number.isFinite(expires.getTime()))
        throw new Error("The publication permit returned an invalid expiry.");
      const publishedAt = Timestamp.fromDate(now);
      const expiresAt = Timestamp.fromDate(expires);
      const expiresAtMs = String(expires.getTime());
      const coverSource = validateGalleryCoverSource(
        await createThumbnail(roomCoverSource || validatedDraft.artworks[0]?.src),
      );
      const coverPath = galleryCoverPath(ownerId, id);
      const coverReference = ref(firebaseStorage, coverPath);
      const coverUpload = await dataUrlAsBlob(coverSource);
      uploaded.push(coverReference);
      await uploadBytes(coverReference, coverUpload.blob, {
        contentType: coverUpload.contentType,
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
          const artworkUpload = await dataUrlAsBlob(artwork.src);
          uploaded.push(reference);
          await uploadBytes(reference, artworkUpload.blob, {
            contentType: artworkUpload.contentType,
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
        revision: 1,
        updatedAt: publishedAt,
        lifecycleStatus: "active",
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
        revision: 1,
        updatedAt: now.toISOString(),
        lifecycleStatus: "active",
      };
    } catch (error) {
      if (permittedGalleryId) {
        await httpsCallable(firebaseFunctions, "abortAuraGalleryPublication")({
          galleryId: permittedGalleryId,
        }).catch((abortError) => console.warn("Publication cleanup deferred to the scheduled worker.", abortError));
      }
      if (galleryRef) await bestEffortDeleteDocuments([galleryRef]);
      if (uploaded.length) await bestEffortDeleteObjects(uploaded);
      throw normalizeGalleryPublishingError(error, FIREBASE_PROJECT_ID);
    }
  }

  async updatePublished(
    target: GalleryEditTarget,
    draft: Parameters<GalleryRepository["updatePublished"]>[1],
    roomCoverSource?: string,
  ): Promise<GalleryRecord> {
    const uploaded: StorageReference[] = [];
    try {
      const user = await this.authenticatedUser();
      const galleryReference = doc(firebaseDb, "galleries", target.id);
      const currentSnapshot = await getDoc(galleryReference);
      if (!currentSnapshot.exists()) throw new Error("This Space no longer exists.");
      const current = fromFirestore(currentSnapshot.id, currentSnapshot.data());
      const role = await this.editableRole(current, user);
      if (current.ownerId !== target.ownerId)
        throw new Error("The published Space owner changed. Reload the Space before editing.");
      if (current.revision !== target.revision)
        throw new Error(
          "This Space was changed in another session. Reopen it from Account to load the latest version; your local Project stays saved.",
        );
      if (!current.ownerId) throw new Error("This Space has no editable Owner record.");
      if (new Date(current.expiresAt).getTime() <= Date.now() + 60_000)
        throw new Error("This Space has expired and can no longer be updated.");

      const currentArtworks = new Map(
        current.artworks.map((artwork, index) => [artwork.id, { artwork, index }]),
      );
      const validatedDraft = prepareGalleryDraftForPublication(
        await embedLocalArtworkSources(draft, async (artwork, index) => {
          const exact = currentArtworks.get(artwork.id);
          const sameSlot = current.artworks[index];
          const published = exact ?? (
            sameSlot?.title === artwork.title
              ? { artwork: sameSlot, index }
              : undefined
          );
          if (!published) return undefined;
          return publishedArtworkSource(
            current,
            published.artwork,
            published.index,
          );
        }),
      );

      const nextRevision = current.revision + 1;
      const revisionId = `r${nextRevision}-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
      const expiresAtMs = String(new Date(current.expiresAt).getTime());
      const coverSource = validateGalleryCoverSource(
        await createThumbnail(roomCoverSource || validatedDraft.artworks[0]?.src),
      );
      const coverPath = galleryRevisionCoverPath(
        current.ownerId,
        current.id,
        revisionId,
      );
      const coverReference = ref(firebaseStorage, coverPath);
      const coverUpload = await dataUrlAsBlob(coverSource);
      uploaded.push(coverReference);
      await uploadBytes(coverReference, coverUpload.blob, {
        contentType: coverUpload.contentType,
        cacheControl: "public,max-age=3600",
        customMetadata: {
          ownerId: current.ownerId,
          galleryId: current.id,
          uploaderId: user.uid,
          revisionId,
          kind: "cover",
          expiresAtMs,
          schemaVersion: "3",
          visibility: current.visibility,
          retention: current.retention,
        },
      });
      const artworks = await mapWithConcurrency(
        validatedDraft.artworks,
        3,
        async (artwork, index) => {
          const storagePath = galleryRevisionArtworkPath(
            current.ownerId!,
            current.id,
            revisionId,
            index,
          );
          const reference = ref(firebaseStorage, storagePath);
          const artworkUpload = await dataUrlAsBlob(artwork.src);
          uploaded.push(reference);
          await uploadBytes(reference, artworkUpload.blob, {
            contentType: artworkUpload.contentType,
            cacheControl: "public,max-age=3600",
            customMetadata: {
              ownerId: current.ownerId!,
              galleryId: current.id,
              uploaderId: user.uid,
              revisionId,
              kind: "artwork",
              index: String(index),
              expiresAtMs,
              schemaVersion: "3",
              visibility: current.visibility,
              retention: current.retention,
            },
          });
          return { ...artwork, storagePath, src: "" };
        },
      );
      const updatedAt = new Date();
      await runTransaction(firebaseDb, async (transaction) => {
        const latestSnapshot = await transaction.get(galleryReference);
        if (!latestSnapshot.exists()) throw new Error("This Space no longer exists.");
        const latest = fromFirestore(latestSnapshot.id, latestSnapshot.data());
        if (latest.revision !== target.revision)
          throw new Error(
            "This Space was changed in another session. Reopen it from Account to load the latest version; your local Project stays saved.",
          );
        transaction.set(galleryReference, {
          ...validatedDraft,
          artworks,
          coverPath,
          ownerId: current.ownerId,
          publishedAt: Timestamp.fromDate(new Date(current.publishedAt)),
          expiresAt: Timestamp.fromDate(new Date(current.expiresAt)),
          schemaVersion: 3,
          visibility: current.visibility,
          retention: current.retention,
          accessVersion: current.accessVersion,
          revision: nextRevision,
          updatedAt: serverTimestamp(),
          lifecycleStatus: current.lifecycleStatus,
        });
      });
      return {
        ...validatedDraft,
        coverSrc: coverSource,
        coverPath,
        id: current.id,
        ownerId: current.ownerId,
        publishedAt: current.publishedAt,
        expiresAt: current.expiresAt,
        visibility: current.visibility,
        retention: current.retention,
        accessVersion: current.accessVersion,
        revision: nextRevision,
        updatedAt: updatedAt.toISOString(),
        effectiveRole: role,
        lifecycleStatus: current.lifecycleStatus,
      };
    } catch (error) {
      if (uploaded.length) await bestEffortDeleteObjects(uploaded);
      throw normalizeGalleryPublishingError(error, FIREBASE_PROJECT_ID);
    }
  }

  async findManifest(id: string): Promise<GalleryRecord | null> {
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
    if (
      record.lifecycleStatus !== "active" ||
      new Date(record.expiresAt).getTime() <= Date.now()
    ) return null;
    return record;
  }

  async hydrateGalleryArtworks(
    gallery: GalleryRecord,
    onArtwork?: (gallery: GalleryRecord, loaded: number, total: number) => void,
  ): Promise<GalleryRecord> {
    const hydrated = gallery.artworks.map((artwork) => ({ ...artwork }));
    let loaded = hydrated.filter((artwork) => Boolean(artwork.src)).length;
    await mapWithConcurrency(
      gallery.artworks,
      ARTWORK_DOWNLOAD_CONCURRENCY,
      async (artwork, index) => {
        let next = artwork;
        if (artwork.storagePath || artwork.assetId) {
          next = {
            ...artwork,
            src: (await publishedArtworkSource(gallery, artwork, index)) ?? "",
          };
        }
        hydrated[index] = next;
        loaded += artwork.src ? 0 : 1;
        onArtwork?.({ ...gallery, artworks: hydrated.map((item) => ({ ...item })) }, loaded, hydrated.length);
        return next;
      },
    );
    if (hydrated.some((artwork) => !artwork.src))
      throw new GalleryRepositoryDataError(gallery.id, "artworks", "an artwork image is unavailable");
    return { ...gallery, artworks: hydrated };
  }

  async find(id: string): Promise<GalleryRecord | null> {
    const record = await this.findManifest(id);
    if (!record) return null;
    const hydrated = await this.hydrateGalleryArtworks(record);
    // The public viewer renders the room itself and never consumes its Discover
    // cover. Avoid delaying the first usable frame with a separate cover download.
    // Legacy records keep their already-embedded coverSrc through `record`.
    return hydrated;
  }

  async discover(): Promise<GalleryRecord[]> {
    const safelyActiveAt = Timestamp.fromMillis(Date.now() + 60_000);
    const publicActive = query(
      collection(firebaseDb, "galleries"),
      where("visibility", "==", "public"),
      where("expiresAt", ">", safelyActiveAt),
      orderBy("expiresAt", "desc"),
      limit(30),
    );
    const legacyActive = query(
      collection(firebaseDb, "galleries"),
      where("schemaVersion", "in", [1, 2]),
      where("expiresAt", ">", safelyActiveAt),
      orderBy("expiresAt", "desc"),
      limit(30),
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
    );
    const records: GalleryRecord[] = [];
    const discovered = await mapWithConcurrency(
      items,
      DISCOVER_COVER_CONCURRENCY,
      async (item) => {
        try {
          const record = fromFirestore(item.id, item.data());
          if (!isDiscoverEligible(record))
            return null;
          // Discover is a directory request, not a media-hydration request.
          // Waiting for Storage retries here used to hold the complete feed for
          // minutes when one cover was unavailable. Legacy embedded covers are
          // still rendered; Storage-backed covers use the existing room fallback
          // so the Space remains immediately discoverable.
          const coverSrc = discoverCoverSource(record);
          return {
            ...record,
            ...(coverSrc ? { coverSrc } : {}),
          };
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
    return records.slice(0, 12);
  }

  async mine(): Promise<GalleryRecord[]> {
    const owner = await this.authenticatedUser();
    if (owner.isAnonymous)
      throw new Error("Sign in to see Spaces saved to your account.");
    // Owner-only listing does not need a composite index. Filtering expiry in
    // the client also lets the account screen survive while an index is being
    // created and avoids coupling the whole list to one Storage cover.
    const owned = query(
      collection(firebaseDb, "galleries"),
      where("ownerId", "==", owner.uid),
      limit(30),
    );
    const [ownedResult, sharedResult] = await Promise.allSettled([
      getDocs(owned),
      owner.email && owner.emailVerified
        ? getDocs(query(
            collectionGroup(firebaseDb, "members"),
            where("email", "==", owner.email.toLowerCase()),
            limit(30),
          ))
        : Promise.resolve(undefined),
    ]);
    if (ownedResult.status === "rejected") throw ownedResult.reason;
    if (sharedResult.status === "rejected")
      console.warn("Shared rooms could not be listed.", sharedResult.reason);
    const entries = new Map<string, {
      snapshot: (typeof ownedResult.value.docs)[number];
      role: GalleryRole;
    }>();
    ownedResult.value.docs.forEach((snapshot) => {
      entries.set(snapshot.id, { snapshot, role: "owner" });
    });
    if (sharedResult.status === "fulfilled" && sharedResult.value) {
      const shared = await Promise.allSettled(
        sharedResult.value.docs.map(async (membership) => {
          const role = membership.data().role;
          if (role !== "editor" && role !== "viewer") return null;
          const galleryReference = membership.ref.parent.parent;
          if (!galleryReference) return null;
          const snapshot = await getDoc(galleryReference);
          return snapshot.exists() ? { snapshot, role } : null;
        }),
      );
      shared.forEach((result) => {
        if (result.status !== "fulfilled" || !result.value) return;
        if (!entries.has(result.value.snapshot.id))
          entries.set(result.value.snapshot.id, result.value);
      });
    }
    const records = await mapWithConcurrency(
      [...entries.values()],
      DISCOVER_COVER_CONCURRENCY,
      async ({ snapshot, role }) => {
        const record = fromFirestore(snapshot.id, snapshot.data());
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
        return {
          ...record,
          effectiveRole: role,
          ...(coverSrc ? { coverSrc } : {}),
        };
      },
    );
    return records
      .sort(
        (a, b) =>
          new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
      );
  }

  private async editableRole(
    gallery: GalleryRecord,
    user: User,
  ): Promise<Extract<GalleryRole, "owner" | "editor">> {
    if (gallery.ownerId === user.uid) return "owner";
    if (!user.email || !user.emailVerified)
      throw new Error("Use a verified invited account to edit this Space.");
    const membership = await getDoc(doc(
      firebaseDb,
      "galleries",
      gallery.id,
      "members",
      user.email.toLowerCase(),
    ));
    if (!membership.exists() || membership.data().role !== "editor")
      throw new Error("This account does not have Editor access to the Space.");
    return "editor";
  }

  async editableDraft(id: string) {
    const user = await this.authenticatedUser();
    const gallery = await this.find(id);
    if (!gallery) throw new Error("This Space no longer exists.");
    if (!gallery.ownerId)
      throw new Error("This legacy Space cannot be edited in place.");
    const role = await this.editableRole(gallery, user);
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
                const { blob } = await normalizedImageBlob(await response.blob());
                return blobAsDataUrl(blob);
              })
            : artwork.src,
        };
      },
    );
    return {
      draft: {
        title: gallery.title,
        artist: gallery.artist,
        templateId: gallery.templateId,
        wall: gallery.wall,
        floor: gallery.floor,
        ceiling: gallery.ceiling,
        lighting: gallery.lighting,
        decor: gallery.decor.map((item) => ({ ...item })),
        artworks,
      },
      target: {
        id: gallery.id,
        ownerId: gallery.ownerId,
        accountUid: user.uid,
        publishedAt: gallery.publishedAt,
        expiresAt: gallery.expiresAt,
        visibility: gallery.visibility,
        retention: gallery.retention,
        accessVersion: gallery.accessVersion,
        revision: gallery.revision,
        role,
      },
    };
  }

  private async ownedGallery(id: string) {
    const owner = await this.authenticatedUser();
    if (owner.isAnonymous || !owner.emailVerified)
      throw new Error("Use a verified account to manage Space access.");
    const reference = doc(firebaseDb, "galleries", id);
    const snapshot = await getDoc(reference);
    if (!snapshot.exists()) throw new Error("This Space no longer exists.");
    const gallery = fromFirestore(snapshot.id, snapshot.data());
    if (gallery.ownerId !== owner.uid)
      throw new Error("Only the Space Owner can manage access.");
    return owner;
  }

  async listMembers(id: string): Promise<GalleryMember[]> {
    const owner = await this.ownedGallery(id);
    const snapshot = await getDocs(
      query(collection(firebaseDb, "galleries", id, "members"), limit(50)),
    );
    const active: GalleryMember[] = snapshot.docs.flatMap((item) => {
        const data = item.data();
        const role = data.role;
        if (role !== "editor" && role !== "viewer") return [];
        const addedAt = data.addedAt;
        return [{
          email: item.id,
          role,
          status: "active" as const,
          addedAt:
            addedAt instanceof Timestamp
              ? addedAt.toDate().toISOString()
              : new Date(0).toISOString(),
        } satisfies GalleryMember];
      }).sort((a, b) => a.email.localeCompare(b.email));
    const pendingSnapshot = await getDocs(query(
      collection(firebaseDb, "galleryInvites"),
      where("ownerId", "==", owner.uid),
      limit(50),
    ));
    const pending = pendingSnapshot.docs.flatMap((item) => {
      const data = item.data();
      if (data.galleryId !== id || data.status !== "pending" || (data.role !== "editor" && data.role !== "viewer") || typeof data.email !== "string") return [];
      return [{
        email: data.email,
        role: data.role,
        status: "pending" as const,
        inviteId: item.id,
        addedAt: data.createdAt instanceof Timestamp
          ? data.createdAt.toDate().toISOString()
          : new Date(0).toISOString(),
      } satisfies GalleryMember];
    });
    return [...active, ...pending].sort((a, b) => a.email.localeCompare(b.email));
  }

  async listInvites(): Promise<GalleryInvite[]> {
    const user = await this.authenticatedUser();
    if (user.isAnonymous || !user.emailVerified || !user.email) return [];
    const snapshot = await getDocs(query(
      collection(firebaseDb, "galleryInvites"),
      where("email", "==", user.email.toLowerCase()),
      limit(30),
    ));
    return snapshot.docs.flatMap((item) => {
      const data = item.data();
      const expiresAt = data.expiresAt instanceof Timestamp ? data.expiresAt.toDate() : new Date(0);
      if (data.status !== "pending" || expiresAt.getTime() <= Date.now() || typeof data.galleryId !== "string" || typeof data.galleryTitle !== "string" || (data.role !== "viewer" && data.role !== "editor")) return [];
      return [{
        id: item.id,
        galleryId: data.galleryId,
        galleryTitle: data.galleryTitle,
        email: user.email!.toLowerCase(),
        role: data.role,
        expiresAt: expiresAt.toISOString(),
      } satisfies GalleryInvite];
    });
  }

  async acceptInvite(inviteId: string): Promise<void> {
    await this.authenticatedUser();
    await httpsCallable(firebaseFunctions, "acceptAuraGalleryInvite")({ inviteId });
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
    await httpsCallable(firebaseFunctions, "createAuraGalleryInvite")({
      galleryId: id,
      email: normalizedEmail,
      role,
    });
  }

  async removeMember(id: string, email: string): Promise<void> {
    await this.ownedGallery(id);
    await httpsCallable(firebaseFunctions, "revokeAuraGalleryAccess")({
      galleryId: id,
      email: normalizedMemberEmail(email),
    });
  }

  async updateLifecycle(
    id: string,
    action: "archive" | "restore" | "renew" | "trash" | "visibility",
    visibility?: "public" | "unlisted" | "private",
  ): Promise<void> {
    await this.authenticatedUser();
    await httpsCallable(firebaseFunctions, "manageAuraGalleryLifecycle")({
      galleryId: id,
      action,
      ...(visibility ? { visibility } : {}),
    });
  }

  async delete(id: string): Promise<void> {
    await this.updateLifecycle(id, "trash");
  }
}

export const firebaseGalleryRepository: GalleryRepository =
  new FirebaseGalleryRepository();
