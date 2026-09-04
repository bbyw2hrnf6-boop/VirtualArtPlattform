import { createHash } from "node:crypto";

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;
const VISIBILITIES = new Set(["public", "unlisted", "private"]);
const TEMPLATE_IDS = new Set(["white-cube", "nocturne", "pavilion"]);
const MAXIMUM_PUBLICATION_WINDOW_MS = 366 * 86_400_000;

type UnknownRecord = Record<string, unknown>;

function fail(reason: string): never {
  throw new Error(`Invalid gallery publication state: ${reason}.`);
}

function objectValue(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} is missing`);
  return value as UnknownRecord;
}

export function trustedTimestampMilliseconds(value: unknown, label: string) {
  const milliseconds = value instanceof Date
    ? value.getTime()
    : typeof (value as { toMillis?: unknown } | undefined)?.toMillis === "function"
      ? (value as { toMillis: () => number }).toMillis()
      : Number.NaN;
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) fail(`${label} is invalid`);
  return milliseconds;
}

function safeId(value: unknown, label: string) {
  if (typeof value !== "string" || !SAFE_SEGMENT.test(value)) fail(`${label} is invalid`);
  return value;
}

function commonPermit(
  value: unknown,
  expected: { ownerId: string; galleryId: string; now: number },
) {
  const permit = objectValue(value, "permit");
  if (permit.ownerId !== expected.ownerId || permit.galleryId !== expected.galleryId)
    fail("permit ownership does not match");
  if (permit.status !== "pending") fail("permit is not pending");
  const visibility = permit.visibility;
  if (typeof visibility !== "string" || !VISIBILITIES.has(visibility))
    fail("permit visibility is invalid");
  if (permit.retention !== "account-preview") fail("permit retention is invalid");
  const expiresAtMs = trustedTimestampMilliseconds(permit.expiresAt, "expiry");
  const permitExpiresAtMs = trustedTimestampMilliseconds(permit.permitExpiresAt, "permit expiry");
  if (
    !Number.isSafeInteger(expected.now)
    || permitExpiresAtMs <= expected.now
    || expiresAtMs <= expected.now
    || expiresAtMs - expected.now > MAXIMUM_PUBLICATION_WINDOW_MS
  ) fail("permit expired or exceeds its publication window");
  return { permit, visibility, retention: "account-preview" as const, expiresAtMs, permitExpiresAtMs };
}

export function validateInitialPublicationPermit(
  value: unknown,
  expected: { ownerId: string; galleryId: string; now: number },
) {
  const checked = commonPermit(value, expected);
  if (checked.permit.kind !== "initial") fail("permit kind is not initial");
  return checked;
}

export function galleryRevisionPermitId(galleryIdValue: unknown, revisionIdValue: unknown) {
  const galleryId = safeId(galleryIdValue, "gallery ID");
  const revisionId = safeId(revisionIdValue, "revision ID");
  return `${galleryId}_${revisionId}`;
}

export function galleryRevisionAbortKey(galleryIdValue: unknown, revisionIdValue: unknown) {
  return createHash("sha256")
    .update(`revision-abort:${galleryRevisionPermitId(galleryIdValue, revisionIdValue)}`)
    .digest("hex");
}

export function validateRevisionPermit(
  value: unknown,
  expected: {
    ownerId: string;
    uploaderId: string;
    galleryId: string;
    revisionId: string;
    baseRevision: number;
    now: number;
  },
) {
  const checked = commonPermit(value, expected);
  if (
    checked.permit.kind !== "revision"
    || checked.permit.uploaderId !== expected.uploaderId
    || checked.permit.revisionId !== expected.revisionId
    || checked.permit.baseRevision !== expected.baseRevision
  ) fail("revision permit does not match");
  return checked;
}

export function validateRevisionAuthorization(options: {
  gallery: unknown;
  member: unknown;
  uid: string;
  email?: string;
  expectedRevision: number;
  now: number;
}) {
  const gallery = objectValue(options.gallery, "gallery");
  const ownerId = safeId(gallery.ownerId, "gallery owner");
  if (!Number.isSafeInteger(options.now) || options.now < 0)
    fail("current time is invalid");
  if (!Number.isSafeInteger(options.expectedRevision) || options.expectedRevision < 1)
    fail("base revision is invalid");
  if (gallery.revision !== options.expectedRevision) fail("gallery revision changed");
  if (gallery.lifecycleStatus !== "active") fail("gallery is not active");
  const expiresAtMs = trustedTimestampMilliseconds(gallery.expiresAt, "gallery expiry");
  if (expiresAtMs <= options.now + 60_000) fail("gallery is expired or too close to expiry");
  const member = options.member && typeof options.member === "object"
    ? options.member as UnknownRecord
    : undefined;
  const isOwner = ownerId === options.uid;
  const isEditor = Boolean(
    options.email
    && member?.email === options.email
    && member.role === "editor"
    && (member.status === undefined || member.status === "active"),
  );
  if (!isOwner && !isEditor) fail("uploader is not an active Owner or Editor");
  const visibility = gallery.visibility;
  if (typeof visibility !== "string" || !VISIBILITIES.has(visibility))
    fail("gallery visibility is invalid");
  const templateId = gallery.templateId;
  if (typeof templateId !== "string" || !TEMPLATE_IDS.has(templateId))
    fail("gallery template is invalid");
  if (gallery.retention !== "account-preview") fail("gallery retention is invalid");
  // This value is carried into the server-authored replacement document. Do
  // not let a corrupt record bypass Firestore's former timestamp validation.
  trustedTimestampMilliseconds(gallery.publishedAt, "gallery publication time");
  return {
    ownerId,
    templateId,
    visibility,
    retention: "account-preview" as const,
    expiresAtMs,
    publishedAt: gallery.publishedAt,
    accessVersion: gallery.accessVersion === 1 ? 1 : fail("gallery access version is invalid"),
    exploreListed: typeof gallery.exploreListed === "boolean" ? gallery.exploreListed : true,
    creatorProfileListed: typeof gallery.creatorProfileListed === "boolean" ? gallery.creatorProfileListed : true,
  };
}
