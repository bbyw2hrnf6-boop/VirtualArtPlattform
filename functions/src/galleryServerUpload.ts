import { createHash } from "node:crypto";
import {
  decodeTrustedGalleryImage,
  galleryUploadDescriptors,
  inspectStoredGalleryUpload,
  TRUSTED_GALLERY_CACHE_CONTROL,
  type GalleryUploadDescriptor,
  type InspectableStorageFile,
} from "./galleryUploadInspection.js";
import { galleryUploadRoot } from "./galleryManifest.js";

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;
const CONTENT_TYPES = new Set(["image/avif", "image/jpeg", "image/png", "image/webp"]);
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const SAFE_INVOCATION_ID = /^[A-Za-z0-9_-]{20,128}$/;
const SHA256 = /^[a-f0-9]{64}$/;
export const GALLERY_ASSET_UPLOAD_LEASE_MS = 2 * 60_000;
export const GALLERY_ASSET_CLEANUP_GRACE_MS = 60_000;
export const GALLERY_ASSET_UPLOAD_MAX_ATTEMPTS = 40;

type UnknownRecord = Record<string, unknown>;

export type GalleryServerAssetUpload = {
  requestId: string;
  galleryId: string;
  kind: "cover" | "artwork";
  index?: number;
  contentType: string;
  bytesBase64: string;
  revisionId?: string;
  expectedRevision?: number;
};

export type GalleryServerUploadFile = InspectableStorageFile & {
  save(
    bytes: Buffer,
    options: {
      resumable: false;
      validation: "crc32c";
      preconditionOpts: { ifGenerationMatch: 0 };
      metadata: {
        contentType: string;
        cacheControl: typeof TRUSTED_GALLERY_CACHE_CONTROL;
        metadata: Record<string, string>;
      };
    },
  ): Promise<void>;
};

function fail(reason: string): never {
  throw new Error(`Invalid trusted gallery asset upload: ${reason}.`);
}

function plainObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("payload is missing");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail("payload must be a plain object");
  return value as UnknownRecord;
}

function safeSegment(value: unknown, label: string) {
  if (typeof value !== "string" || !SAFE_SEGMENT.test(value)) fail(`${label} is invalid`);
  return value;
}

function maximumBytes(kind: "cover" | "artwork") {
  return kind === "cover" ? 1024 * 1024 : 2 * 1024 * 1024;
}

function milliseconds(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (
    value
    && typeof value === "object"
    && "toMillis" in value
    && typeof (value as { toMillis?: unknown }).toMillis === "function"
  ) return (value as { toMillis: () => number }).toMillis();
  return Number.NaN;
}

/** Serialize writes for one permit and keep destructive workers outside the
 * callable's maximum runtime. */
export function claimGalleryAssetUploadLease(
  permit: UnknownRecord | undefined,
  uploadId: string,
  uploadKey: string,
  nowMs: number,
) {
  if (!permit || !SAFE_INVOCATION_ID.test(uploadId) || !SHA256.test(uploadKey) ||
    !Number.isSafeInteger(nowMs) || nowMs < 0)
    fail("asset upload lease state is invalid");
  const currentLeaseUntil = milliseconds(permit.assetUploadLeaseUntil);
  const attempts = permit.assetUploadAttempts === undefined ? 0 : Number(permit.assetUploadAttempts);
  if (!Number.isSafeInteger(attempts) || attempts < 0 || attempts > GALLERY_ASSET_UPLOAD_MAX_ATTEMPTS)
    fail("asset upload attempt state is invalid");
  if (permit.assetUploadId === uploadId && Number.isSafeInteger(currentLeaseUntil)) {
    if (permit.assetUploadKey !== uploadKey) fail("asset upload request changed");
    if (currentLeaseUntil > nowMs) {
      return {
        assetUploadAttempts: attempts,
        assetUploadId: uploadId,
        assetUploadKey: uploadKey,
        assetUploadLeaseUntil: new Date(currentLeaseUntil),
      };
    }
    // The callable is capped below the lease lifetime. Once this lease has
    // expired, the original invocation cannot still be writing. Renew the
    // exact request so a delayed response-loss replay can verify the immutable
    // object and finish the permit transaction.
    if (attempts >= GALLERY_ASSET_UPLOAD_MAX_ATTEMPTS)
      fail("asset upload attempt limit reached");
    return {
      assetUploadAttempts: attempts + 1,
      assetUploadId: uploadId,
      assetUploadKey: uploadKey,
      assetUploadLeaseUntil: new Date(nowMs + GALLERY_ASSET_UPLOAD_LEASE_MS),
    };
  }
  if (Number.isFinite(currentLeaseUntil) && currentLeaseUntil > nowMs)
    fail("another asset upload is active");
  if (attempts >= GALLERY_ASSET_UPLOAD_MAX_ATTEMPTS)
    fail("asset upload attempt limit reached");
  return {
    assetUploadAttempts: attempts + 1,
    assetUploadId: uploadId,
    assetUploadKey: uploadKey,
    assetUploadLeaseUntil: new Date(nowMs + GALLERY_ASSET_UPLOAD_LEASE_MS),
  };
}

export function ownsGalleryAssetUploadLease(
  permit: UnknownRecord | undefined,
  uploadId: string,
  nowMs: number,
  uploadKey?: string,
) {
  return Boolean(
    permit
    && permit.assetUploadId === uploadId
    && (uploadKey === undefined || permit.assetUploadKey === uploadKey)
    && milliseconds(permit.assetUploadLeaseUntil) > nowMs,
  );
}

export function galleryAssetCleanupNotBefore(permit: UnknownRecord | undefined, nowMs: number) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) fail("cleanup time is invalid");
  const leaseUntil = milliseconds(permit?.assetUploadLeaseUntil);
  return new Date(Math.max(
    nowMs + GALLERY_ASSET_UPLOAD_LEASE_MS + GALLERY_ASSET_CLEANUP_GRACE_MS,
    (Number.isFinite(leaseUntil) ? leaseUntil : nowMs) + GALLERY_ASSET_CLEANUP_GRACE_MS,
  ));
}

function exactKeys(value: UnknownRecord, expected: readonly string[]) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index]))
    fail("payload fields do not match the trusted contract");
}

/** Parse without decoding first, so authorization can run before Sharp and the
 * base64 allocation. The encoded length is still bounded at this boundary. */
export function parseGalleryServerAssetUpload(value: unknown): GalleryServerAssetUpload {
  const data = plainObject(value);
  const requestId = safeSegment(data.requestId, "request ID");
  if (!SAFE_INVOCATION_ID.test(requestId)) fail("request ID is invalid");
  const galleryId = safeSegment(data.galleryId, "gallery ID");
  const kind = data.kind;
  if (kind !== "cover" && kind !== "artwork") fail("asset kind is invalid");
  const revision = data.revisionId !== undefined || data.expectedRevision !== undefined;
  const expectedKeys = [
    "bytesBase64",
    "contentType",
    "galleryId",
    "kind",
    "requestId",
    ...(kind === "artwork" ? ["index"] : []),
    ...(revision ? ["expectedRevision", "revisionId"] : []),
  ];
  exactKeys(data, expectedKeys);
  const index = kind === "artwork" ? data.index : undefined;
  if (kind === "artwork" && (!Number.isSafeInteger(index) || Number(index) < 0 || Number(index) >= 14))
    fail("artwork slot is invalid");
  const contentType = data.contentType;
  if (typeof contentType !== "string" || !CONTENT_TYPES.has(contentType))
    fail("content type is invalid");
  const bytesBase64 = data.bytesBase64;
  const encodedLimit = 4 * Math.ceil((maximumBytes(kind) - 1) / 3);
  if (
    typeof bytesBase64 !== "string"
    || bytesBase64.length < 4
    || bytesBase64.length > encodedLimit
    || !BASE64.test(bytesBase64)
  ) fail("base64 bytes are malformed or exceed their limit");

  if (!revision) return {
    requestId,
    galleryId,
    kind,
    ...(kind === "artwork" ? { index: Number(index) } : {}),
    contentType,
    bytesBase64,
  };
  const revisionId = safeSegment(data.revisionId, "revision ID");
  if (
    !Number.isSafeInteger(data.expectedRevision)
    || Number(data.expectedRevision) < 1
    || Number(data.expectedRevision) >= 1_000_000
  ) fail("base revision is invalid");
  return {
    requestId,
    galleryId,
    kind,
    ...(kind === "artwork" ? { index: Number(index) } : {}),
    contentType,
    bytesBase64,
    revisionId,
    expectedRevision: Number(data.expectedRevision),
  };
}

/** Bind a replayable client request ID to every authorization- and byte-bearing
 * field so reusing an ID with another slot or body can never share a lease. */
export function galleryServerAssetUploadKey(upload: GalleryServerAssetUpload) {
  return createHash("sha256").update(JSON.stringify([
    upload.galleryId,
    upload.kind,
    upload.index ?? null,
    upload.contentType,
    upload.bytesBase64,
    upload.revisionId ?? null,
    upload.expectedRevision ?? null,
  ])).digest("hex");
}

export async function decodeGalleryServerAssetUpload(upload: GalleryServerAssetUpload) {
  const bytes = Buffer.from(upload.bytesBase64, "base64");
  if (bytes.toString("base64") !== upload.bytesBase64)
    fail("base64 bytes are not canonical");
  const image = await decodeTrustedGalleryImage(bytes, {
    contentType: upload.contentType,
    maximumBytes: maximumBytes(upload.kind),
  });
  return { bytes, image };
}

export function galleryServerAssetDescriptor(
  upload: GalleryServerAssetUpload,
  authorization: {
    ownerId: string;
    expiresAtMs: number;
    visibility: string;
    retention: string;
    uploaderId?: string;
  },
) {
  const context = {
    ownerId: authorization.ownerId,
    galleryId: upload.galleryId,
    ...(upload.revisionId ? { revisionId: upload.revisionId } : {}),
  };
  const root = galleryUploadRoot(context);
  const index = upload.kind === "cover" ? 0 : Number(upload.index) + 1;
  const paths = [
    `${root}/cover.webp`,
    ...Array.from({ length: index }, (_, artworkIndex) =>
      `${root}/artworks/${artworkIndex + 1}.webp`),
  ];
  return galleryUploadDescriptors({
    ownerId: authorization.ownerId,
    galleryId: upload.galleryId,
    paths,
    expiresAtMs: authorization.expiresAtMs,
    visibility: authorization.visibility,
    retention: authorization.retention,
    ...(authorization.uploaderId ? { uploaderId: authorization.uploaderId } : {}),
    ...(upload.revisionId ? { revisionId: upload.revisionId } : {}),
  })[index];
}

function createConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    statusCode?: unknown;
    errors?: Array<{ reason?: unknown }>;
  };
  return candidate.code === 412
    || candidate.statusCode === 412
    || candidate.errors?.some((item) => item.reason === "conditionNotMet") === true;
}

/** Create a private immutable object. A retry after a lost response succeeds
 * only when the existing trusted object contains the exact same bytes. */
export async function persistGalleryServerAsset(
  file: GalleryServerUploadFile,
  descriptor: GalleryUploadDescriptor,
  bytes: Buffer,
  contentType: string,
) {
  if (file.name !== descriptor.path) fail("Storage path does not match");
  if (!CONTENT_TYPES.has(contentType)) fail("content type is invalid");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  let idempotent = false;
  try {
    await file.save(bytes, {
      resumable: false,
      validation: "crc32c",
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType,
        cacheControl: TRUSTED_GALLERY_CACHE_CONTROL,
        metadata: { ...descriptor.metadata },
      },
    });
  } catch (error) {
    if (!createConflict(error)) throw error;
    idempotent = true;
  }
  const stored = await inspectStoredGalleryUpload(file, descriptor);
  if (stored.sha256 !== sha256)
    fail("immutable slot already contains different bytes");
  return {
    path: descriptor.path,
    bytes: bytes.length,
    sha256,
    idempotent,
  };
}
