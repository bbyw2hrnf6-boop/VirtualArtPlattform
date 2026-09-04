import { createHash } from "node:crypto";
import sharp from "sharp";

const CONTENT_TYPE_BY_FORMAT = Object.freeze({
  avif: "image/avif",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
});
const MAXIMUM_IMAGE_PIXELS = 25_000_000;
const MAXIMUM_IMAGE_EDGE = 12_000;
const MINIMUM_IMAGE_BYTES = 32;
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;
const VISIBILITIES = new Set(["public", "unlisted", "private"]);
const MAXIMUM_UPLOADS = 15;
export const TRUSTED_GALLERY_CACHE_CONTROL = "private,no-store";

export type GalleryUploadDescriptor = {
  path: string;
  maximumBytes: number;
  metadata: Readonly<Record<string, string>>;
};

type StorageObjectMetadata = {
  size?: string | number;
  contentType?: string;
  cacheControl?: string;
  generation?: string | number;
  metageneration?: string | number;
  md5Hash?: string;
  crc32c?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

export type InspectableStorageFile = {
  name: string;
  getMetadata(): Promise<[StorageObjectMetadata, ...unknown[]]>;
  setMetadata(
    metadata: {
      cacheControl: string;
      metadata: Record<string, string | null>;
    },
    options?: { ifMetagenerationMatch?: number },
  ): Promise<[unknown, ...unknown[]]>;
  download(options?: { validation?: false | "crc32c" | "md5" }): Promise<[Buffer, ...unknown[]]>;
};

function fail(reason: string): never {
  throw new Error(`Untrusted gallery upload: ${reason}.`);
}

function integerBytes(value: unknown) {
  const parsed = typeof value === "string" && /^[0-9]+$/.test(value)
    ? Number(value)
    : value;
  if (!Number.isSafeInteger(parsed) || Number(parsed) < MINIMUM_IMAGE_BYTES)
    fail("object size is invalid");
  return Number(parsed);
}

function stableObjectIdentity(metadata: StorageObjectMetadata) {
  return JSON.stringify({
    generation: String(metadata.generation ?? ""),
    metageneration: String(metadata.metageneration ?? ""),
    size: String(metadata.size ?? ""),
    contentType: metadata.contentType ?? "",
    md5Hash: metadata.md5Hash ?? "",
    crc32c: metadata.crc32c ?? "",
    // Google does not promise object-key insertion order across two metadata
    // reads. Compare a canonical representation to avoid false race alarms.
    customMetadata: Object.entries(metadata.metadata ?? {}).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0),
  });
}

function safeSegment(value: unknown, label: string) {
  if (typeof value !== "string" || !SAFE_SEGMENT.test(value)) fail(`${label} is invalid`);
  return value;
}

function exactUploadPaths(options: {
  ownerId: string;
  galleryId: string;
  paths: string[];
  revisionId?: string;
}) {
  const ownerId = safeSegment(options.ownerId, "owner ID");
  const galleryId = safeSegment(options.galleryId, "gallery ID");
  const revisionId = options.revisionId === undefined
    ? undefined
    : safeSegment(options.revisionId, "revision ID");
  if (!Array.isArray(options.paths) || options.paths.length < 1 || options.paths.length > MAXIMUM_UPLOADS)
    fail("upload path inventory is invalid");
  const root = `published/${ownerId}/${galleryId}${revisionId ? `/revisions/${revisionId}` : ""}`;
  const expected = [
    `${root}/cover.webp`,
    ...options.paths.slice(1).map((_, index) => `${root}/artworks/${index + 1}.webp`),
  ];
  if (options.paths.some((path, index) => path !== expected[index]))
    fail("upload paths do not match their trusted slots");
  return expected;
}

/** Reject files that were uploaded under the permit but are not referenced by
 * the server-validated manifest. The caller must list the exact initial or
 * revision prefix and pass every returned object name. */
export function validateGalleryUploadInventory(
  actualPaths: readonly unknown[],
  expectedPaths: readonly string[],
) {
  if (!Array.isArray(actualPaths) || !Array.isArray(expectedPaths))
    fail("upload inventory is invalid");
  const normalize = (values: readonly unknown[], label: string) => {
    if (values.length < 1 || values.length > MAXIMUM_UPLOADS)
      fail(`${label} inventory is invalid`);
    const paths = values.map((value) => {
      if (typeof value !== "string" || value.length < 1 || value.length > 512)
        fail(`${label} path is invalid`);
      return value;
    });
    if (new Set(paths).size !== paths.length) fail(`${label} inventory contains duplicates`);
    return paths.sort();
  };
  const actual = normalize(actualPaths, "actual");
  const expected = normalize(expectedPaths, "expected");
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    fail("upload inventory contains missing or unexpected objects");
  return expected;
}

export function validateGalleryUploadMetadata(
  metadata: StorageObjectMetadata,
  descriptor: GalleryUploadDescriptor,
) {
  const size = integerBytes(metadata.size);
  if (size >= descriptor.maximumBytes) fail("object exceeds its byte limit");
  if (!Object.values(CONTENT_TYPE_BY_FORMAT).includes(metadata.contentType as never))
    fail("declared content type is unsupported");
  const custom = metadata.metadata;
  if (!custom || typeof custom !== "object" || Array.isArray(custom))
    fail("custom metadata is missing");
  const actualKeys = Object.keys(custom).sort();
  const expectedKeys = Object.keys(descriptor.metadata).sort();
  if (
    actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])
  ) fail("custom metadata fields do not match");
  for (const [key, expected] of Object.entries(descriptor.metadata)) {
    if (custom[key] !== expected) fail(`metadata ${key} does not match`);
  }
  return { size, contentType: metadata.contentType as string };
}

/** Firebase download tokens bypass Storage Rules. The legacy uploaderId is
 * accepted only as migration input. The trusted finalizer removes both with an
 * optimistic metageneration guard before the manifest becomes discoverable. */
export async function sanitizeStoredGalleryUpload(
  file: InspectableStorageFile,
  descriptor: GalleryUploadDescriptor,
) {
  if (file.name !== descriptor.path) fail("Storage path does not match");
  const [before] = await file.getMetadata();
  const custom = before.metadata;
  if (!custom || typeof custom !== "object" || Array.isArray(custom))
    fail("custom metadata is missing");
  const allowedKeys = new Set([
    ...Object.keys(descriptor.metadata),
    "firebaseStorageDownloadTokens",
    "uploaderId",
  ]);
  if (Object.keys(custom).some((key) => !allowedKeys.has(key)))
    fail("custom metadata fields do not match");
  const withoutSensitiveMetadata = Object.fromEntries(
    Object.entries(custom).filter(([key]) =>
      key !== "firebaseStorageDownloadTokens" && key !== "uploaderId"),
  );
  const migratedMetadata = custom.uploaderId !== undefined &&
    descriptor.metadata.provenance === "revision-upload" &&
    !Object.prototype.hasOwnProperty.call(withoutSensitiveMetadata, "provenance")
    ? { ...withoutSensitiveMetadata, provenance: "revision-upload" }
    : withoutSensitiveMetadata;
  validateGalleryUploadMetadata({ ...before, metadata: migratedMetadata }, descriptor);
  const metageneration = typeof before.metageneration === "string"
    && /^[1-9][0-9]*$/.test(before.metageneration)
    ? Number(before.metageneration)
    : before.metageneration;
  if (!Number.isSafeInteger(metageneration) || Number(metageneration) < 1)
    fail("object metageneration is invalid");
  await file.setMetadata({
    cacheControl: TRUSTED_GALLERY_CACHE_CONTROL,
    metadata: {
      ...descriptor.metadata,
      firebaseStorageDownloadTokens: null,
      uploaderId: null,
    },
  }, { ifMetagenerationMatch: Number(metageneration) });
  return inspectStoredGalleryUpload(file, descriptor);
}

export function validateGalleryImageAspect(
  image: Pick<Awaited<ReturnType<typeof decodeTrustedGalleryImage>>, "width" | "height">,
  expectedAspect: number,
) {
  if (
    !Number.isFinite(expectedAspect)
    || expectedAspect <= 0
    || !Number.isSafeInteger(image.width)
    || !Number.isSafeInteger(image.height)
    || image.width < 1
    || image.height < 1
  ) fail("image aspect is invalid");
  const actualAspect = image.width / image.height;
  if (Math.abs(actualAspect - expectedAspect) / expectedAspect > 0.05)
    fail("decoded image aspect does not match the manifest");
  return actualAspect;
}

export async function decodeTrustedGalleryImage(
  bytesValue: Uint8Array,
  { contentType, maximumBytes }: { contentType: string; maximumBytes: number },
) {
  const bytes = Buffer.from(bytesValue);
  if (bytes.length < MINIMUM_IMAGE_BYTES || bytes.length >= maximumBytes)
    fail("downloaded bytes are outside their limit");
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  let image: ReturnType<typeof sharp>;
  try {
    image = sharp(bytes, {
      failOn: "warning",
      limitInputPixels: MAXIMUM_IMAGE_PIXELS,
      sequentialRead: true,
    });
    metadata = await image.metadata();
  } catch {
    fail("image decoder rejected the bytes");
  }
  const format = metadata.format as keyof typeof CONTENT_TYPE_BY_FORMAT | undefined;
  const width = metadata.width;
  const height = metadata.height;
  if (
    !format
    || CONTENT_TYPE_BY_FORMAT[format] !== contentType
    || !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || Number(width) < 1
    || Number(height) < 1
    || Number(width) > MAXIMUM_IMAGE_EDGE
    || Number(height) > MAXIMUM_IMAGE_EDGE
    || Number(width) * Number(height) > MAXIMUM_IMAGE_PIXELS
    || (metadata.pages ?? 1) !== 1
  ) fail("decoded image contract does not match its declaration");
  // Only invoke the full pixel decoder after the header has proved this is a
  // supported, single-frame, bounded raster. This keeps spoofed SVG/TIFF/GIF
  // payloads away from the expensive decode path.
  let decoded: { data: Buffer; info: { width: number; height: number; channels: number } };
  try {
    decoded = await image.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch {
    fail("image decoder rejected the bytes");
  }
  if (
    decoded.info.width !== width
    || decoded.info.height !== height
    || decoded.info.channels !== 4
    || decoded.data.length !== Number(width) * Number(height) * decoded.info.channels
  ) fail("image decoder returned incomplete pixels");
  return { format, width: Number(width), height: Number(height), bytes: bytes.length };
}

export async function inspectStoredGalleryUpload(
  file: InspectableStorageFile,
  descriptor: GalleryUploadDescriptor,
) {
  if (file.name !== descriptor.path) fail("Storage path does not match");
  const [before] = await file.getMetadata();
  const checked = validateGalleryUploadMetadata(before, descriptor);
  if (before.cacheControl !== TRUSTED_GALLERY_CACHE_CONTROL)
    fail("object cache policy is unsafe");
  const [bytes] = await file.download({ validation: "crc32c" });
  const [after] = await file.getMetadata();
  if (stableObjectIdentity(before) !== stableObjectIdentity(after))
    fail("object changed during inspection");
  if (bytes.length !== checked.size) fail("downloaded size does not match object metadata");
  const decoded = await decodeTrustedGalleryImage(bytes, {
    contentType: checked.contentType,
    maximumBytes: descriptor.maximumBytes,
  });
  return {
    ...decoded,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function galleryUploadDescriptors(options: {
  ownerId: string;
  galleryId: string;
  paths: string[];
  expiresAtMs: number;
  visibility: string;
  retention: string;
  uploaderId?: string;
  revisionId?: string;
}) {
  if (!Number.isSafeInteger(options.expiresAtMs) || !/^[0-9]{13}$/.test(String(options.expiresAtMs)))
    fail("expiry is invalid");
  if (typeof options.visibility !== "string" || !VISIBILITIES.has(options.visibility))
    fail("visibility is invalid");
  if (options.retention !== "account-preview") fail("retention is invalid");
  if ((options.uploaderId === undefined) !== (options.revisionId === undefined))
    fail("revision identity is incomplete");
  if (options.uploaderId !== undefined) safeSegment(options.uploaderId, "uploader ID");
  const paths = exactUploadPaths(options);
  return paths.map((path, index): GalleryUploadDescriptor => {
    const isCover = index === 0;
    return {
      path,
      maximumBytes: isCover ? 1024 * 1024 : 2 * 1024 * 1024,
      metadata: {
        ownerId: options.ownerId,
        galleryId: options.galleryId,
        kind: isCover ? "cover" : "artwork",
        ...(isCover ? {} : { index: String(index - 1) }),
        expiresAtMs: String(options.expiresAtMs),
        schemaVersion: "3",
        visibility: options.visibility,
        retention: options.retention,
        ...(options.uploaderId ? { provenance: "revision-upload" } : {}),
        ...(options.revisionId ? { revisionId: options.revisionId } : {}),
      },
    };
  });
}
