import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  claimGalleryAssetUploadLease,
  decodeGalleryServerAssetUpload,
  galleryAssetCleanupNotBefore,
  galleryServerAssetDescriptor,
  galleryServerAssetUploadKey,
  GALLERY_ASSET_UPLOAD_MAX_ATTEMPTS,
  GALLERY_ASSET_UPLOAD_LEASE_MS,
  ownsGalleryAssetUploadLease,
  parseGalleryServerAssetUpload,
  persistGalleryServerAsset,
  type GalleryServerUploadFile,
} from "./galleryServerUpload.js";
import { TRUSTED_GALLERY_CACHE_CONTROL } from "./galleryUploadInspection.js";

async function image(color = "#ff00ffff") {
  return sharp({
    create: { width: 3, height: 2, channels: 4, background: color },
  }).png().toBuffer();
}

async function initialUpload(overrides: Record<string, unknown> = {}) {
  const bytes = await image();
  return parseGalleryServerAssetUpload({
    requestId: "request-abcdefghijklmnopqrst",
    galleryId: "space-1",
    kind: "cover",
    contentType: "image/png",
    bytesBase64: bytes.toString("base64"),
    ...overrides,
  });
}

function descriptor(upload: Awaited<ReturnType<typeof initialUpload>>) {
  return galleryServerAssetDescriptor(upload, {
    ownerId: "owner-1",
    expiresAtMs: 1_800_000_000_000,
    visibility: "private",
    retention: "account-preview",
    ...(upload.revisionId ? { uploaderId: "editor-1" } : {}),
  });
}

class MemoryFile implements GalleryServerUploadFile {
  bytes?: Buffer;
  objectMetadata?: {
    size: string;
    contentType: string;
    cacheControl: string;
    generation: string;
    metageneration: string;
    crc32c: string;
    metadata: Record<string, string>;
  };

  constructor(readonly name: string) {}

  async save(bytes: Buffer, options: Parameters<GalleryServerUploadFile["save"]>[1]) {
    expect(options.preconditionOpts).toEqual({ ifGenerationMatch: 0 });
    expect(options.resumable).toBe(false);
    expect(options.validation).toBe("crc32c");
    expect(options.metadata.cacheControl).toBe(TRUSTED_GALLERY_CACHE_CONTROL);
    expect(options.metadata.metadata).not.toHaveProperty("firebaseStorageDownloadTokens");
    if (this.bytes) throw Object.assign(new Error("conditionNotMet"), { code: 412 });
    this.bytes = Buffer.from(bytes);
    this.objectMetadata = {
      size: String(bytes.length),
      contentType: options.metadata.contentType,
      cacheControl: options.metadata.cacheControl,
      generation: "1",
      metageneration: "1",
      crc32c: "crc",
      metadata: { ...options.metadata.metadata },
    };
  }

  async getMetadata() {
    if (!this.objectMetadata) throw new Error("missing");
    return [this.objectMetadata] as [NonNullable<MemoryFile["objectMetadata"]>];
  }

  async setMetadata(): Promise<[unknown]> {
    throw new Error("server uploads must already have exact private metadata");
  }

  async download() {
    if (!this.bytes) throw new Error("missing");
    return [Buffer.from(this.bytes)] as [Buffer];
  }
}

describe("server-owned gallery asset uploads", () => {
  it("serializes permit uploads and delays cleanup beyond an active callable", () => {
    const now = 1_800_000_000_000;
    const uploadId = "asset-upload-abcdefghijklmnop";
    const uploadKey = "a".repeat(64);
    const lease = claimGalleryAssetUploadLease({}, uploadId, uploadKey, now);
    expect(lease.assetUploadAttempts).toBe(1);
    expect(lease.assetUploadLeaseUntil.getTime()).toBe(now + GALLERY_ASSET_UPLOAD_LEASE_MS);
    expect(ownsGalleryAssetUploadLease(lease, uploadId, now + 1)).toBe(true);
    expect(claimGalleryAssetUploadLease(lease, uploadId, uploadKey, now + 1)).toEqual(lease);
    const delayedReplay = claimGalleryAssetUploadLease(
      lease,
      uploadId,
      uploadKey,
      now + GALLERY_ASSET_UPLOAD_LEASE_MS,
    );
    expect(delayedReplay).toMatchObject({
      assetUploadAttempts: 2,
      assetUploadId: uploadId,
      assetUploadKey: uploadKey,
    });
    expect(delayedReplay.assetUploadLeaseUntil.getTime())
      .toBe(now + (2 * GALLERY_ASSET_UPLOAD_LEASE_MS));
    expect(ownsGalleryAssetUploadLease(
      delayedReplay,
      uploadId,
      now + GALLERY_ASSET_UPLOAD_LEASE_MS + 1,
      uploadKey,
    )).toBe(true);
    expect(() => claimGalleryAssetUploadLease(lease, "different-upload-abcdefghij", uploadKey, now + 1))
      .toThrow(/another asset upload/);
    expect(() => claimGalleryAssetUploadLease(lease, uploadId, "b".repeat(64), now + 1))
      .toThrow(/request changed/);
    expect(galleryAssetCleanupNotBefore(lease, now).getTime())
      .toBeGreaterThan(lease.assetUploadLeaseUntil.getTime());
    expect(() => claimGalleryAssetUploadLease({
      assetUploadAttempts: GALLERY_ASSET_UPLOAD_MAX_ATTEMPTS,
    }, uploadId, uploadKey, now)).toThrow(/attempt limit/);
  });

  it("strictly parses bounded initial and revision slots", async () => {
    const initial = await initialUpload();
    expect(initial).toMatchObject({ galleryId: "space-1", kind: "cover" });
    expect(descriptor(initial)).toMatchObject({
      path: "published/owner-1/space-1/cover.webp",
      maximumBytes: 1024 * 1024,
    });

    const bytes = await image();
    const revision = parseGalleryServerAssetUpload({
      requestId: "request-revision-abcdefghijkl",
      galleryId: "space-1",
      revisionId: "r2-safe",
      expectedRevision: 1,
      kind: "artwork",
      index: 13,
      contentType: "image/png",
      bytesBase64: bytes.toString("base64"),
    });
    expect(descriptor(revision)).toMatchObject({
      path: "published/owner-1/space-1/revisions/r2-safe/artworks/14.webp",
      maximumBytes: 2 * 1024 * 1024,
      metadata: { provenance: "revision-upload", revisionId: "r2-safe", index: "13" },
    });
    expect(descriptor(revision).metadata).not.toHaveProperty("uploaderId");
    await expect(decodeGalleryServerAssetUpload(revision)).resolves.toMatchObject({
      image: { format: "png", width: 3, height: 2 },
    });
    expect(galleryServerAssetUploadKey(revision)).toMatch(/^[a-f0-9]{64}$/);
    expect(galleryServerAssetUploadKey({ ...revision, index: 12 }))
      .not.toBe(galleryServerAssetUploadKey(revision));
  });

  it("rejects malformed, noncanonical, oversized, spoofed, and hostile payloads", async () => {
    const bytes = await image();
    const base = {
      requestId: "request-hostile-abcdefghijkl",
      galleryId: "space-1",
      kind: "cover",
      contentType: "image/png",
      bytesBase64: bytes.toString("base64"),
    };
    expect(() => parseGalleryServerAssetUpload({ ...base, metadata: { public: true } }))
      .toThrow(/payload fields/);
    expect(() => parseGalleryServerAssetUpload({ ...base, firebaseStorageDownloadTokens: "known" }))
      .toThrow(/payload fields/);
    expect(() => parseGalleryServerAssetUpload({ ...base, bytesBase64: "not base64" }))
      .toThrow(/base64/);
    expect(() => parseGalleryServerAssetUpload({ ...base, bytesBase64: "AAAA====" }))
      .toThrow(/base64/);
    expect(() => parseGalleryServerAssetUpload({
      ...base,
      bytesBase64: Buffer.alloc(1024 * 1024).toString("base64"),
    })).toThrow(/exceed/);
    expect(() => parseGalleryServerAssetUpload({ ...base, kind: "artwork", index: 14 }))
      .toThrow(/slot/);
    expect(() => parseGalleryServerAssetUpload({ ...base, revisionId: "r2" }))
      .toThrow(/payload fields/);
    await expect(decodeGalleryServerAssetUpload(parseGalleryServerAssetUpload({
      ...base,
      contentType: "image/jpeg",
    }))).rejects.toThrow(/does not match/);
  });

  it("creates once with private metadata and accepts an exact lost-response retry", async () => {
    const upload = await initialUpload();
    const contract = descriptor(upload);
    const { bytes } = await decodeGalleryServerAssetUpload(upload);
    const file = new MemoryFile(contract.path);

    await expect(persistGalleryServerAsset(file, contract, bytes, upload.contentType))
      .resolves.toMatchObject({ path: contract.path, bytes: bytes.length, idempotent: false });
    await expect(persistGalleryServerAsset(file, contract, bytes, upload.contentType))
      .resolves.toMatchObject({ path: contract.path, bytes: bytes.length, idempotent: true });
    expect(file.objectMetadata?.metadata).toEqual(contract.metadata);
    expect(file.objectMetadata?.metadata).not.toHaveProperty("firebaseStorageDownloadTokens");
  });

  it("rejects different bytes or hostile metadata in an occupied immutable slot", async () => {
    const upload = await initialUpload();
    const contract = descriptor(upload);
    const { bytes } = await decodeGalleryServerAssetUpload(upload);
    const file = new MemoryFile(contract.path);
    await persistGalleryServerAsset(file, contract, bytes, upload.contentType);

    const different = await image("#00ffffff");
    await expect(persistGalleryServerAsset(file, contract, different, upload.contentType))
      .rejects.toThrow(/different bytes/);

    file.objectMetadata!.metadata.firebaseStorageDownloadTokens = "attacker-known-token";
    await expect(persistGalleryServerAsset(file, contract, bytes, upload.contentType))
      .rejects.toThrow(/metadata fields/);
  });
});
