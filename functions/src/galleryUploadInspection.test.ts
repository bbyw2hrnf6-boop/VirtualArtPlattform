import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  decodeTrustedGalleryImage,
  galleryUploadDescriptors,
  inspectStoredGalleryUpload,
  sanitizeStoredGalleryUpload,
  TRUSTED_GALLERY_CACHE_CONTROL,
  validateGalleryImageAspect,
  validateGalleryUploadInventory,
  validateGalleryUploadMetadata,
  type InspectableStorageFile,
} from "./galleryUploadInspection.js";

async function png() {
  return sharp({
    create: { width: 3, height: 2, channels: 4, background: "#ff00ffff" },
  }).png().toBuffer();
}

const descriptor = galleryUploadDescriptors({
  ownerId: "owner-1",
  galleryId: "space-1",
  paths: ["published/owner-1/space-1/cover.webp"],
  expiresAtMs: 1_800_000_000_000,
  visibility: "public",
  retention: "account-preview",
})[0];

function objectMetadata(size: number) {
  return {
    size: String(size),
    contentType: "image/png",
    cacheControl: TRUSTED_GALLERY_CACHE_CONTROL,
    generation: "7",
    metageneration: "1",
    crc32c: "checksum",
    metadata: { ...descriptor.metadata },
  };
}

describe("trusted gallery upload inspection", () => {
  it("fully decodes a bounded image whose metadata and bytes agree", async () => {
    const bytes = await png();
    await expect(decodeTrustedGalleryImage(bytes, {
      contentType: "image/png",
      maximumBytes: descriptor.maximumBytes,
    })).resolves.toMatchObject({ format: "png", width: 3, height: 2, bytes: bytes.length });

    const file: InspectableStorageFile = {
      name: descriptor.path,
      getMetadata: async () => [objectMetadata(bytes.length)],
      setMetadata: async () => [objectMetadata(bytes.length)],
      download: async () => [bytes],
    };
    await expect(inspectStoredGalleryUpload(file, descriptor)).resolves.toMatchObject({ format: "png" });
  });

  it("rejects spoofed types, changed objects, malformed bytes, and wrong metadata", async () => {
    const bytes = await png();
    await expect(decodeTrustedGalleryImage(bytes, {
      contentType: "image/jpeg",
      maximumBytes: descriptor.maximumBytes,
    })).rejects.toThrow(/does not match/);
    await expect(decodeTrustedGalleryImage(Buffer.alloc(100), {
      contentType: "image/png",
      maximumBytes: descriptor.maximumBytes,
    })).rejects.toThrow(/decoder rejected/);
    await expect(decodeTrustedGalleryImage(Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
    ), {
      contentType: "image/png",
      maximumBytes: descriptor.maximumBytes,
    })).rejects.toThrow(/does not match/);
    expect(() => validateGalleryUploadMetadata({
      ...objectMetadata(bytes.length),
      metadata: { ...descriptor.metadata, ownerId: "attacker" },
    }, descriptor)).toThrow(/ownerId/);
    expect(() => validateGalleryUploadMetadata({
      ...objectMetadata(bytes.length),
      metadata: { ...descriptor.metadata, firebaseStorageDownloadTokens: "attacker-token" },
    }, descriptor)).toThrow(/metadata fields/);
    let reads = 0;
    const changed: InspectableStorageFile = {
      name: descriptor.path,
      getMetadata: async () => [{ ...objectMetadata(bytes.length), metageneration: String(++reads) }],
      setMetadata: async () => [objectMetadata(bytes.length)],
      download: async () => [bytes],
    };
    await expect(inspectStoredGalleryUpload(changed, descriptor)).rejects.toThrow(/changed during inspection/);
  });

  it("compares custom metadata canonically across stable object reads", async () => {
    const bytes = await png();
    const first = objectMetadata(bytes.length);
    const second = {
      ...first,
      metadata: Object.fromEntries(Object.entries(first.metadata).reverse()),
    };
    let reads = 0;
    const file: InspectableStorageFile = {
      name: descriptor.path,
      getMetadata: async () => [reads++ === 0 ? first : second],
      setMetadata: async () => [objectMetadata(bytes.length)],
      download: async () => [bytes],
    };
    await expect(inspectStoredGalleryUpload(file, descriptor)).resolves.toMatchObject({ format: "png" });
  });

  it("removes reserved download tokens and legacy uploader identities before trusted inspection", async () => {
    const bytes = await png();
    let metadata: ReturnType<typeof objectMetadata> = {
      ...objectMetadata(bytes.length),
      cacheControl: "public,max-age=3600",
      metadata: {
        ...descriptor.metadata,
        firebaseStorageDownloadTokens: "attacker-token",
        uploaderId: "legacy-editor-account",
      },
    };
    const file: InspectableStorageFile = {
      name: descriptor.path,
      getMetadata: async () => [metadata],
      setMetadata: async (patch, options) => {
        expect(options).toEqual({ ifMetagenerationMatch: 1 });
        metadata = {
          ...metadata,
          cacheControl: patch.cacheControl,
          metageneration: "2",
          metadata: Object.fromEntries(
            Object.entries(patch.metadata).filter(([, value]) => value !== null),
          ) as Record<string, string>,
        };
        return [metadata];
      },
      download: async () => [bytes],
    };
    await expect(sanitizeStoredGalleryUpload(file, descriptor)).resolves.toMatchObject({ format: "png" });
    expect(metadata.metadata).toEqual(descriptor.metadata);
    expect(metadata.cacheControl).toBe(TRUSTED_GALLERY_CACHE_CONTROL);
  });

  it("binds decoded artwork geometry to the trusted manifest aspect", () => {
    expect(validateGalleryImageAspect({ width: 2048, height: 1024 }, 2)).toBe(2);
    expect(() => validateGalleryImageAspect({ width: 2048, height: 1024 }, 1)).toThrow(/aspect/);
  });

  it("derives exact initial and revision metadata contracts", () => {
    const [cover, artwork] = galleryUploadDescriptors({
      ownerId: "owner-1",
      galleryId: "space-1",
      paths: [
        "published/owner-1/space-1/revisions/r2-safe/cover.webp",
        "published/owner-1/space-1/revisions/r2-safe/artworks/1.webp",
      ],
      expiresAtMs: 1_800_000_000_000,
      visibility: "private",
      retention: "account-preview",
      uploaderId: "editor-1",
      revisionId: "r2-safe",
    });
    expect(cover.metadata).toMatchObject({ kind: "cover", provenance: "revision-upload", revisionId: "r2-safe" });
    expect(artwork.metadata).toMatchObject({ kind: "artwork", index: "0", provenance: "revision-upload" });
    expect(cover.metadata).not.toHaveProperty("uploaderId");
    expect(artwork.metadata).not.toHaveProperty("uploaderId");
    expect(() => galleryUploadDescriptors({
      ownerId: "owner-1",
      galleryId: "space-1",
      paths: ["published/owner-1/space-1/revisions/wrong/cover.webp"],
      expiresAtMs: 1_800_000_000_000,
      visibility: "private",
      retention: "account-preview",
      uploaderId: "editor-1",
      revisionId: "r2-safe",
    })).toThrow(/trusted slots/);
    expect(() => galleryUploadDescriptors({
      ownerId: "owner-1",
      galleryId: "space-1",
      paths: ["published/owner-1/space-1/cover.webp"],
      expiresAtMs: 1_800_000_000_000,
      visibility: "private",
      retention: "account-preview",
      revisionId: "r2-safe",
    })).toThrow(/identity is incomplete/);
  });

  it("migrates an in-flight legacy revision object without persisting its uploader UID", async () => {
    const bytes = await png();
    const [revisionDescriptor] = galleryUploadDescriptors({
      ownerId: "owner-1",
      galleryId: "space-1",
      paths: ["published/owner-1/space-1/revisions/r2-safe/cover.webp"],
      expiresAtMs: 1_800_000_000_000,
      visibility: "private",
      retention: "account-preview",
      uploaderId: "editor-1",
      revisionId: "r2-safe",
    });
    const legacyMetadata: Record<string, string> = { ...revisionDescriptor.metadata };
    delete legacyMetadata.provenance;
    let metadata: ReturnType<typeof objectMetadata> = {
      ...objectMetadata(bytes.length),
      metadata: { ...legacyMetadata, uploaderId: "editor-1" },
    };
    const file: InspectableStorageFile = {
      name: revisionDescriptor.path,
      getMetadata: async () => [metadata],
      setMetadata: async (patch) => {
        metadata = {
          ...metadata,
          cacheControl: patch.cacheControl,
          metageneration: "2",
          metadata: Object.fromEntries(
            Object.entries(patch.metadata).filter(([, value]) => value !== null),
          ) as Record<string, string>,
        };
        return [metadata];
      },
      download: async () => [bytes],
    };
    await expect(sanitizeStoredGalleryUpload(file, revisionDescriptor)).resolves.toMatchObject({ format: "png" });
    expect(metadata.metadata).toEqual(revisionDescriptor.metadata);
    expect(metadata.metadata).not.toHaveProperty("uploaderId");
  });

  it("rejects extra, missing, or duplicate objects in a permit prefix", () => {
    const expected = [
      "published/owner-1/space-1/cover.webp",
      "published/owner-1/space-1/artworks/1.webp",
    ];
    expect(validateGalleryUploadInventory([...expected].reverse(), expected)).toEqual([...expected].sort());
    expect(() => validateGalleryUploadInventory([
      ...expected,
      "published/owner-1/space-1/artworks/14.webp",
    ], expected)).toThrow(/unexpected objects/);
    expect(() => validateGalleryUploadInventory([expected[0]], expected)).toThrow(/missing or unexpected/);
    expect(() => validateGalleryUploadInventory([expected[0], expected[0]], expected)).toThrow(/duplicates/);
  });
});
