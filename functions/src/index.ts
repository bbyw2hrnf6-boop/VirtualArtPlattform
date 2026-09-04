import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  FieldPath,
  FieldValue,
  Timestamp,
  getFirestore,
  type DocumentReference,
  type Query,
  type QueryDocumentSnapshot,
  type Transaction,
} from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { defineString } from "firebase-functions/params";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import {
  classifyServerError,
  logOperation,
  parseClientTelemetry,
  safeResourceRef,
} from "./observability.js";
import {
  assertAuraMailBrandConfigured,
  verificationMail,
  welcomeMail,
  type AuraMailBrand,
} from "./emailTemplates.js";
import {
  GALLERY_VISIBILITIES,
  normalizeMemberEmail,
  parseGalleryId,
  publicationTerms,
  type GalleryVisibility,
} from "./galleryPolicy.js";
import {
  assertRecentAuthentication,
  assertAccountAccess,
  assertImmediateAccountExportSize,
  buildAccountExport,
  collectBoundedPages,
  mapInChunks,
  portableValue,
} from "./accountDataRights.js";
import {
  ACCOUNT_DELETION_PAGE_SIZE,
  ACCOUNT_DELETION_LEASE_MS,
  ACCOUNT_DELETION_SCHEMA_VERSION,
  ACCOUNT_DELETION_TOMBSTONE_TTL_MS,
  accountDeletionPermitAuthority,
  accountDeletionPseudonymousReportId,
  accountDeletionAuthenticationAlreadyMissing,
  accountDeletionFollowRelation,
  accountDeletionLeaseAvailable,
  accountMediaUploadLeaseDisposition,
  accountDeletionPublicStatus,
  aggregateAfterRelationRemoval,
  assertAccountDeletionJobState,
  drainAccountDeletionPage,
  existingAuthUidForDeletionFence,
  galleryManifestReferencesPrefix,
  nextAccountDeletionPhase,
  parsePersistedGalleryDocumentId,
  type AccountDeletionJobState,
} from "./accountDeletionJobs.js";
import {
  ACCOUNT_EXPORT_MAX_PAGE_RECORDS,
  accountExportFailureCode,
  accountExportPartIdForOwner,
  accountExportPublicStatus,
  accountExportResumePosition,
  assertAccountExportChunk,
  assertAccountExportJobOwner,
  assertAccountExportJobState,
  classifyAccountExportStep,
  createAccountExportJob,
  currentAccountExportSection,
  parseAccountExportJobId,
  prepareAccountExportStep,
  reusableAccountExportJob,
  type AccountExportJobState,
  type AccountExportPage,
  type AccountExportSection,
} from "./accountExportJobs.js";
import {
  accountInvitation,
  creatorActivityExport as accountExportCreatorActivity,
  creatorComment as accountExportCreatorComment,
  creatorNotification as accountExportCreatorNotification,
  creatorReaction as accountExportCreatorReaction,
  creatorRelationship as accountExportCreatorRelationship,
  creatorReport as accountExportCreatorReport,
  ownedSpaceMediaBatch,
  ownedSpaceMemberBatch,
  safeAccountExportSourceRecord,
  sharedSpaceMembership,
  storageObjectWindowAfterCursor,
} from "./accountExportProjection.js";
import {
  ACCOUNT_EXPORT_CALLABLE_TIMEOUT_SECONDS,
  claimAccountExportLease,
  ownsAccountExportLease,
  type AccountExportLease,
} from "./accountExportLease.js";
import {
  SPACE_CARD_FALLBACK,
  cacheControlForSpace,
  classifySpaceForDelivery,
  metadataForSpace,
  renderPublicSitemap,
  renderSpaceDocument,
  type PublicSpaceDelivery,
  type SpaceDelivery,
} from "./spaceSeo.js";
import {
  CREATOR_HANDLE_CHANGE_COOLDOWN_MS,
  classifyCreatorDocumentRoute,
  creatorPublicContentMatches,
  creatorNotificationProjection,
  creatorFollowTransition,
  creatorCanonicalUrl,
  isCreatorProfileSpaceListed,
  isReviewedPublicCreatorProfile,
  isValidCreatorWebp,
  normalizeCreatorHandle,
  parseCreatorCommentInput,
  parseCreatorPostInput,
  parseCreatorProfileInput,
  parseCreatorReportReason,
  publicCreatorDirectoryEntry,
  renderCreatorDirectoryDocument,
  renderCreatorDocument,
  renderCreatorHubDocument,
  type CreatorDelivery,
  type PublicCreatorPost,
  type PublicCreatorSpace,
} from "./creatorIdentity.js";
import {
  boundedModerationSourceReports,
  creatorPostModerationCaseId,
  creatorPostReportId,
  creatorReportPrincipal,
  creatorReportIntakePatch,
  highestModerationPriority,
  moderationPriorityForReason,
} from "./moderationPolicy.js";
import {
  NEWSLETTER_UNSUBSCRIBE_TOKEN_TTL_MS,
  NewsletterUnsubscribeRequestLimiter,
  newsletterUnsubscribeRequest,
  nextNewsletterTokenVersion,
  shouldRotateNewsletterToken,
  unsubscribeTokenState,
} from "./newsletterLifecycle.js";
import {
  TRUSTED_GALLERY_SCHEMA_VERSION,
  expectedGalleryUploadPaths,
  galleryUploadRoot,
  validateGalleryDistribution,
  validateTrustedGalleryManifest,
  type GalleryManifestContext,
  type TrustedGalleryDraft,
} from "./galleryManifest.js";
import {
  galleryRevisionPermitId,
  validateInitialPublicationPermit,
  validateRevisionAuthorization,
  validateRevisionPermit,
} from "./galleryPublication.js";
import {
  galleryUploadDescriptors,
  sanitizeStoredGalleryUpload,
  validateGalleryImageAspect,
  validateGalleryUploadInventory,
} from "./galleryUploadInspection.js";
import {
  claimGalleryAssetUploadLease,
  decodeGalleryServerAssetUpload,
  galleryAssetCleanupNotBefore,
  galleryServerAssetDescriptor,
  galleryServerAssetUploadKey,
  ownsGalleryAssetUploadLease,
  parseGalleryServerAssetUpload,
  persistGalleryServerAsset,
} from "./galleryServerUpload.js";
import {
  claimGalleryInspectionLease,
  ownsGalleryInspectionLease,
  releasableGalleryInspectionLease,
} from "./galleryInspectionLease.js";
import {
  galleryManifestStoragePaths,
  retiredGalleryStoragePaths,
} from "./galleryAssetRetirement.js";
import {
  creatorActionRateId,
  creatorNotificationAggregateId,
  nextCreatorActionRate,
  type CreatorActionKind,
} from "./notificationPolicy.js";
import {
  CspReportLogLimiter,
  decodeCspReportBody,
  isCspReportMediaType,
  parseCspViolationReports,
} from "./cspReport.js";
import {
  APP_CONTENT_SECURITY_POLICY,
  APP_REPORTING_ENDPOINTS,
} from "./securityHeaders.js";

if (!getApps().length) initializeApp();

const REGION = "europe-west1";
const PUBLIC_APP_URL = defineString("AURA_PUBLIC_APP_URL", {
  default: "https://lieuva.com",
  description: "Legacy-named parameter for the public LIEUVA URL without a trailing slash.",
});
const REPLY_TO = defineString("AURA_REPLY_TO", {
  default: "not-configured@invalid.example",
  description: "Legacy-named parameter for the public support/reply-to email shown in LIEUVA emails.",
});
const LEGAL_FOOTER = defineString("AURA_LEGAL_FOOTER", {
  default: "LIEUVA preview — legal sender details not configured",
  description: "Legal sender name and postal address shown in marketing emails.",
});

const db = getFirestore();
const sources = new Set(["email-create", "email-signin", "google-create", "google-signin", "account-settings"]);
const galleryVisibilities = new Set<string>(GALLERY_VISIBILITIES);
const galleryLifecycleActions = new Set(["archive", "restore", "renew", "trash", "visibility", "distribution"]);
const galleryRoles = new Set(["viewer", "editor"]);
const cspReportLogLimiter = new CspReportLogLimiter();
const newsletterUnsubscribeRequestLimiter = new NewsletterUnsubscribeRequestLimiter();
const publicDeliveryFields = [
  "schemaVersion",
  "title",
  "artist",
  "visibility",
  "lifecycleStatus",
  "expiresAt",
  "publishedAt",
  "updatedAt",
  "revision",
  "ownerId",
  "coverPath",
  "discoverEligible",
  "exploreListed",
  "creatorProfileListed",
  "artworks",
] as const;

/** App Check protected, allow-listed observability boundary. No content or raw IDs are accepted. */
export const recordLieuvaTelemetry = onCall(
  { region: REGION, timeoutSeconds: 15, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const startedAt = Date.now();
    try {
      const events = parseClientTelemetry(request.data?.events);
      for (const event of events) logger.info("lieuva_client_event", {
        schema: "lieuva_client_telemetry_v1",
        ...event,
      });
      logOperation("client_telemetry", "success", startedAt, { count: events.length });
      return { accepted: events.length };
    } catch (error) {
      logOperation("client_telemetry", "rejected", startedAt, { errorClass: classifyServerError(error) });
      throw new HttpsError("invalid-argument", "Invalid telemetry batch.");
    }
  },
);

function brand(): AuraMailBrand {
  return {
    name: "LIEUVA",
    appUrl: PUBLIC_APP_URL.value().replace(/\/$/, ""),
    replyTo: REPLY_TO.value(),
    legalFooter: LEGAL_FOOTER.value(),
  };
}

function requireMailConfiguration() {
  try {
    assertAuraMailBrandConfigured(brand());
  } catch {
    throw new HttpsError("failed-precondition", "LIEUVA email delivery is not configured yet.");
  }
}

function requireAccount(auth: { uid: string; token: Record<string, unknown> } | undefined) {
  const firebaseClaims = auth?.token.firebase;
  const provider = firebaseClaims && typeof firebaseClaims === "object"
    ? (firebaseClaims as { sign_in_provider?: string }).sign_in_provider
    : undefined;
  try {
    return assertAccountAccess(auth?.uid, provider);
  } catch {
    throw new HttpsError("unauthenticated", "Use an email or Google account.");
  }
}

function requireSignedIn(auth: { uid: string; token: Record<string, unknown> } | undefined) {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in before changing a Space.");
  return auth.uid;
}

function accountDeletionJobReference(uid: string) {
  return db.collection("accountDeletionJobs").doc(uid);
}

const ACCOUNT_MEDIA_UPLOAD_LEASE_MS = 60_000;

function accountMediaUploadLeaseReference(uid: string) {
  return db.collection("accountMediaUploadLeases").doc(uid);
}

function accountDeletionFenceError() {
  return new HttpsError("failed-precondition", "Account deletion is already in progress.");
}

async function assertAccountMutationAllowed(uid: string) {
  if ((await accountDeletionJobReference(uid).get()).exists) throw accountDeletionFenceError();
}

async function assertAccountMutationAllowedInTransaction(transaction: Transaction, ...uids: string[]) {
  const uniqueUids = [...new Set(uids)];
  const fences = await Promise.all(uniqueUids.map((uid) => transaction.get(accountDeletionJobReference(uid))));
  if (fences.some((snapshot) => snapshot.exists)) throw accountDeletionFenceError();
}

/** Storage writes cannot share a transaction with the deletion fence. A
 * server-owned lease closes that gap: deletion waits out a lease longer than
 * the callable runtime, then performs the final Storage drain. */
async function acquireAccountMediaUploadLease(uid: string) {
  const leaseId = randomBytes(16).toString("hex");
  const now = Date.now();
  await db.runTransaction(async (transaction) => {
    const leaseReference = accountMediaUploadLeaseReference(uid);
    const [deletion, lease] = await Promise.all([
      transaction.get(accountDeletionJobReference(uid)),
      transaction.get(leaseReference),
    ]);
    if (deletion.exists) throw accountDeletionFenceError();
    const leaseExpiresAt = timestampMilliseconds(lease.data()?.leaseExpiresAt) ?? 0;
    if (lease.exists && leaseExpiresAt > now)
      throw new HttpsError("aborted", "Another profile image update is still running. Retry shortly.");
    const expiresAt = new Date(now + ACCOUNT_MEDIA_UPLOAD_LEASE_MS);
    transaction.set(leaseReference, {
      uid,
      leaseId,
      leaseExpiresAt: expiresAt,
      expiresAt,
      schemaVersion: 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return leaseId;
}

async function releaseAccountMediaUploadLease(uid: string, leaseId: string) {
  await db.runTransaction(async (transaction) => {
    const reference = accountMediaUploadLeaseReference(uid);
    const lease = await transaction.get(reference);
    if (lease.data()?.leaseId === leaseId) transaction.delete(reference);
  }).catch(() => undefined);
}

async function withAccountMediaUploadLease<T>(uid: string, work: () => Promise<T>) {
  const leaseId = await acquireAccountMediaUploadLease(uid);
  try {
    return await work();
  } finally {
    await releaseAccountMediaUploadLease(uid, leaseId);
  }
}

async function mergeForActiveAccount(
  uid: string,
  reference: DocumentReference,
  data: Record<string, unknown>,
) {
  await db.runTransaction(async (transaction) => {
    await assertAccountMutationAllowedInTransaction(transaction, uid);
    transaction.set(reference, data, { merge: true });
  });
}

function verifiedAccount(auth: { uid: string; token: Record<string, unknown> } | undefined) {
  const firebaseClaims = auth?.token.firebase;
  const provider = firebaseClaims && typeof firebaseClaims === "object"
    ? (firebaseClaims as { sign_in_provider?: string }).sign_in_provider
    : undefined;
  return Boolean(
    auth &&
    provider !== "anonymous" &&
    auth.token.email_verified === true &&
    typeof auth.token.email === "string",
  );
}

function galleryIdFrom(value: unknown) {
  const id = parseGalleryId(value);
  if (!id) throw new HttpsError("invalid-argument", "Invalid Space ID.");
  return id;
}

function revisionIdFrom(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value))
    throw new HttpsError("invalid-argument", "Invalid Space revision ID.");
  return value;
}

function revisionNumberFrom(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) >= 1_000_000)
    throw new HttpsError("invalid-argument", "Invalid Space revision.");
  return Number(value);
}

function trustedManifestFrom(value: unknown, context: GalleryManifestContext) {
  try {
    return validateTrustedGalleryManifest(value, context);
  } catch (error) {
    logger.warn("trusted_gallery_manifest_rejected", {
      galleryId: safeResourceRef(context.galleryId),
      errorClass: classifyServerError(error),
    });
    throw new HttpsError("invalid-argument", "The Space manifest failed trusted validation.");
  }
}

function trustedDistributionFrom(value: unknown) {
  try {
    return validateGalleryDistribution(value);
  } catch {
    throw new HttpsError("invalid-argument", "Choose explicit Space placement settings.");
  }
}

function initialPermitFrom(
  value: unknown,
  expected: { ownerId: string; galleryId: string; now: number },
) {
  try {
    return validateInitialPublicationPermit(value, expected);
  } catch {
    throw new HttpsError("failed-precondition", "The publication permit expired or changed. Retry publishing.");
  }
}

function revisionPermitFrom(
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
  try {
    return validateRevisionPermit(value, expected);
  } catch {
    throw new HttpsError("failed-precondition", "The update permit expired or changed. Reload the Space and retry.");
  }
}

function revisionAuthorizationFrom(options: Parameters<typeof validateRevisionAuthorization>[0]) {
  try {
    return validateRevisionAuthorization(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("uploader"))
      throw new HttpsError("permission-denied", "Only an active Owner or Editor can update this Space.");
    if (message.includes("revision changed"))
      throw new HttpsError("aborted", "This Space changed in another session. Reload it and retry.");
    throw new HttpsError("failed-precondition", "This Space cannot be updated in its current state.");
  }
}

function galleryInspectionLeasePatch(
  permit: Record<string, unknown> | undefined,
  inspectionId: string,
  now: number,
) {
  try {
    return claimGalleryInspectionLease(permit, inspectionId, now);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "inspection-state-invalid";
    if (reason === "inspection-busy" || reason === "inspection-backoff")
      throw new HttpsError("aborted", "Trusted image inspection is already running. Retry shortly.");
    if (reason === "inspection-attempt-limit")
      throw new HttpsError("resource-exhausted", "Trusted image inspection retry limit reached. Start the upload again.");
    throw new HttpsError("failed-precondition", "The trusted image inspection state is invalid. Start the upload again.");
  }
}

function galleryAssetUploadLeasePatch(
  permit: Record<string, unknown> | undefined,
  uploadId: string,
  uploadKey: string,
  now: number,
) {
  try {
    return claimGalleryAssetUploadLease(permit, uploadId, uploadKey, now);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("another asset upload"))
      throw new HttpsError("aborted", "Another Space image upload is still running. Retry shortly.");
    if (message.includes("attempt limit"))
      throw new HttpsError("resource-exhausted", "Space image upload retry limit reached. Restart publishing.");
    throw new HttpsError("failed-precondition", "The Space image upload state is invalid. Restart publishing.");
  }
}

async function releaseGalleryAssetUploadLease(
  permitReference: DocumentReference,
  uploadId: string,
  uploadKey: string,
) {
  await db.runTransaction(async (transaction) => {
    const permit = await transaction.get(permitReference);
    if (!permit.exists || permit.data()?.assetUploadId !== uploadId ||
      permit.data()?.assetUploadKey !== uploadKey) return;
    transaction.update(permitReference, {
      assetUploadId: FieldValue.delete(),
      assetUploadKey: FieldValue.delete(),
      assetUploadLeaseUntil: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }, { maxAttempts: 3 }).catch(() => undefined);
}

async function completeGalleryAssetUploadLease(options: {
  permitReference: DocumentReference;
  uploadId: string;
  uploadKey: string;
  upload: ReturnType<typeof parseGalleryServerAssetUpload>;
  uid: string;
  ownerId: string;
}) {
  return db.runTransaction(async (transaction) => {
    const uniqueAccountIds = [...new Set([options.uid, options.ownerId])];
    const [permit, ...deletionFences] = await Promise.all([
      transaction.get(options.permitReference),
      ...uniqueAccountIds.map((id) => transaction.get(accountDeletionJobReference(id))),
    ]);
    const data = permit.data();
    if (!permit.exists) return false;
    const activeRequest = data?.assetUploadId === options.uploadId &&
      data?.assetUploadKey === options.uploadKey;
    const completedReplay = data?.assetUploadCompletedId === options.uploadId &&
      data?.assetUploadCompletedKey === options.uploadKey;
    if (!activeRequest && !completedReplay) return false;
    const now = Date.now();
    let current = (completedReplay || ownsGalleryAssetUploadLease(
      data,
      options.uploadId,
      now,
      options.uploadKey,
    )) && deletionFences.every((snapshot) => !snapshot.exists);
    try {
      if (options.upload.revisionId === undefined) {
        initialPermitFrom(data, {
          ownerId: options.uid,
          galleryId: options.upload.galleryId,
          now,
        });
      } else {
        revisionPermitFrom(data, {
          ownerId: options.ownerId,
          uploaderId: options.uid,
          galleryId: options.upload.galleryId,
          revisionId: options.upload.revisionId,
          baseRevision: options.upload.expectedRevision!,
          now,
        });
      }
    } catch {
      current = false;
    }
    if (activeRequest) transaction.update(options.permitReference, {
      assetUploadId: FieldValue.delete(),
      assetUploadKey: FieldValue.delete(),
      assetUploadLeaseUntil: FieldValue.delete(),
      ...(current ? {
        assetUploadCompletedId: options.uploadId,
        assetUploadCompletedKey: options.uploadKey,
      } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return current;
  }, { maxAttempts: 3 });
}

async function releaseGalleryInspectionLease(
  permitReference: DocumentReference,
  inspectionId: string,
) {
  await db.runTransaction(async (transaction) => {
    const permit = await transaction.get(permitReference);
    if (!permit.exists || !releasableGalleryInspectionLease(permit.data(), inspectionId)) return;
    transaction.update(permitReference, {
      inspectionId: FieldValue.delete(),
      inspectionLeaseUntil: FieldValue.delete(),
      inspectionStartedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }, { maxAttempts: 3 }).catch(() => undefined);
}

function galleryRetirementReference(galleryId: string, revisionId: string) {
  return db.collection("galleryAssetRetirements").doc(galleryRevisionPermitId(galleryId, revisionId));
}

/** Best effort only: the scheduled lifecycle worker owns durable recovery. */
async function drainGalleryAssetRetirement(
  reference: DocumentReference,
  galleryReference: DocumentReference,
  ownerId: string,
  galleryId: string,
  revisionId: string,
) {
  try {
    const [retirement, gallery] = await Promise.all([reference.get(), galleryReference.get()]);
    const data = retirement.data();
    if (
      !retirement.exists
      || data?.ownerId !== ownerId
      || data?.galleryId !== galleryId
      || data?.revisionId !== revisionId
      || !Array.isArray(data?.paths)
    ) return;
    const currentPaths = gallery.exists
      ? galleryManifestStoragePaths(gallery.data(), ownerId, galleryId)
      : [];
    const paths = retiredGalleryStoragePaths({
      previous: { artworks: data.paths.map((storagePath: unknown) => ({ storagePath })) },
      currentPaths,
      ownerId,
      galleryId,
    });
    if (paths.length !== data.paths.length) return;
    await mapInChunks(paths, 5, (path) =>
      getStorage().bucket().file(path).delete({ ignoreNotFound: true }).then(() => undefined));
    await db.runTransaction(async (transaction) => {
      const [latestRetirement, latestGallery] = await Promise.all([
        transaction.get(reference),
        transaction.get(galleryReference),
      ]);
      if (!latestRetirement.exists || JSON.stringify(latestRetirement.data()?.paths) !== JSON.stringify(data.paths))
        return;
      const latestPaths = latestGallery.exists
        ? new Set(galleryManifestStoragePaths(latestGallery.data(), ownerId, galleryId))
        : new Set<string>();
      if (paths.some((path) => latestPaths.has(path))) return;
      transaction.delete(reference);
    }, { maxAttempts: 3 });
  } catch (error) {
    logger.warn("gallery_asset_retirement_deferred", {
      galleryId: safeResourceRef(galleryId),
      errorClass: classifyServerError(error),
    });
  }
}

async function inspectTrustedGalleryUploads(options: {
  draft: TrustedGalleryDraft;
  context: GalleryManifestContext;
  expiresAtMs: number;
  visibility: string;
  retention: string;
  uploaderId?: string;
}) {
  const paths = expectedGalleryUploadPaths(options.draft, options.context);
  const descriptors = galleryUploadDescriptors({
    ownerId: options.context.ownerId,
    galleryId: options.context.galleryId,
    paths,
    expiresAtMs: options.expiresAtMs,
    visibility: options.visibility,
    retention: options.retention,
    ...(options.uploaderId ? { uploaderId: options.uploaderId } : {}),
    ...(options.context.revisionId ? { revisionId: options.context.revisionId } : {}),
  });
  try {
    const prefix = `${galleryUploadRoot(options.context)}/`;
    const [objects] = await getStorage().bucket().getFiles({
      prefix,
      autoPaginate: false,
      maxResults: 16,
    });
    validateGalleryUploadInventory(objects.map((file) => file.name), paths);
    const inspected = await mapInChunks(descriptors, 2, async (descriptor) =>
      sanitizeStoredGalleryUpload(getStorage().bucket().file(descriptor.path), descriptor));
    inspected.slice(1).forEach((image, index) =>
      validateGalleryImageAspect(image, options.draft.artworks[index].aspect));
  } catch (error) {
    logger.warn("trusted_gallery_upload_rejected", {
      galleryId: safeResourceRef(options.context.galleryId),
      errorClass: classifyServerError(error),
    });
    throw new HttpsError(
      "failed-precondition",
      "An uploaded image failed trusted inspection. Re-upload supported image files and retry.",
    );
  }
  return paths;
}

function galleryCallableResult(id: string, data: Record<string, unknown>) {
  const publishedAt = timestampMilliseconds(data.publishedAt);
  const updatedAt = timestampMilliseconds(data.updatedAt);
  const expiresAt = timestampMilliseconds(data.expiresAt);
  if (publishedAt === undefined || updatedAt === undefined || expiresAt === undefined)
    throw new HttpsError("internal", "The published Space timestamps are unavailable.");
  return {
    status: "published" as const,
    id,
    ownerId: data.ownerId,
    coverPath: data.coverPath,
    visibility: data.visibility,
    retention: data.retention,
    accessVersion: data.accessVersion,
    revision: data.revision,
    lifecycleStatus: data.lifecycleStatus ?? "active",
    exploreListed: data.exploreListed ?? true,
    creatorProfileListed: data.creatorProfileListed ?? true,
    discoverEligible: data.discoverEligible === true,
    publishedAt: new Date(publishedAt).toISOString(),
    updatedAt: new Date(updatedAt).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

function creatorActionRateState(
  kind: CreatorActionKind,
  actorPrincipal: string,
  now: number,
  data: Record<string, unknown> | undefined,
) {
  const rate = nextCreatorActionRate(kind, now, {
    count: data?.count,
    windowStartedAtMs: timestampMilliseconds(data?.windowStartedAt),
  });
  if (!rate.allowed) {
    logger.warn("creator_action_rate_limited", { kind, retryAfterMs: rate.retryAfterMs });
    throw new HttpsError(
      "resource-exhausted",
      `Too many ${kind} actions. Try again in ${Math.max(1, Math.ceil(rate.retryAfterMs / 60_000))} minute(s).`,
    );
  }
  return {
    reference: db.collection("creatorActionRateLimits").doc(creatorActionRateId(actorPrincipal, kind)),
    patch: {
      kind,
      count: rate.count,
      windowStartedAt: new Date(rate.windowStartedAtMs),
      updatedAt: FieldValue.serverTimestamp(),
      schemaVersion: 1,
    },
  };
}

function notificationAggregatePatch(fields: Record<string, unknown>) {
  return {
    ...fields,
    occurrenceCount: FieldValue.increment(1),
    createdAt: FieldValue.serverTimestamp(),
    lastOccurredAt: FieldValue.serverTimestamp(),
    read: false,
    readAt: FieldValue.delete(),
    schemaVersion: 2,
  };
}

function memberEmailFrom(value: unknown) {
  const email = normalizeMemberEmail(value);
  if (!email) throw new HttpsError("invalid-argument", "Invalid member email.");
  return email;
}

function inviteIdFor(galleryId: string, email: string) {
  return createHash("sha256").update(`${galleryId}:${email}`).digest("hex");
}

const ACCOUNT_OPERATION_MAX_QUERY_DOCUMENTS = 5_000;

async function accountQueryDocuments(
  query: Query,
  maximumItems = ACCOUNT_OPERATION_MAX_QUERY_DOCUMENTS,
): Promise<QueryDocumentSnapshot[]> {
  try {
    return await collectBoundedPages<QueryDocumentSnapshot, QueryDocumentSnapshot>({
      maximumItems,
      fetchPage: async (cursor, limit) => {
        const page = await (cursor ? query.startAfter(cursor) : query).limit(limit).get();
        return {
          items: page.docs,
          ...(page.size === limit ? { nextCursor: page.docs.at(-1)! } : {}),
        };
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "page-limit-exceeded")
      throw new HttpsError("resource-exhausted", "This immediate account operation is too large. Use the managed export.");
    throw error;
  }
}

/** Re-fetch page one after each commit. Deleted documents cannot shift a
 * cursor, so an interrupted destructive operation resumes safely on retry. */
async function deleteQueryInBatches(query: Query) {
  let deleted = 0;
  while (true) {
    const page = await query.limit(400).get();
    if (page.empty) return deleted;
    const batch = db.batch();
    page.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
    deleted += page.size;
  }
}

function generatedAppShell() {
  return readFileSync(new URL("../generated/app-shell.html", import.meta.url), "utf8");
}

function requestSpaceId(path: string, route: "spaces" | "space-cards") {
  const match = new RegExp(`/${route}/([^/]+)/?$`).exec(path);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

function requestRouteValue(path: string, route: string, suffix = "") {
  const match = new RegExp(`/${route}/([^/]+)${suffix.replace(".", "[.]")}/?$`).exec(path);
  if (!match) return undefined;
  try { return decodeURIComponent(match[1]); } catch { return undefined; }
}

function timestampMilliseconds(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function")
    return value.toMillis();
  if (typeof value === "string" || typeof value === "number") {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : undefined;
  }
  return undefined;
}

async function creatorDeliveryForHandle(handleValue: unknown): Promise<CreatorDelivery> {
  const requestedHandle = normalizeCreatorHandle(handleValue);
  if (!requestedHandle) return { kind: "not-found" };
  const handleSnapshot = await db.collection("creatorHandles").doc(requestedHandle).get();
  const handleData = handleSnapshot.data();
  if (!handleData || typeof handleData.creatorId !== "string")
    return { kind: "not-found", handle: requestedHandle };
  const creatorId = handleData.creatorId;
  const [profileSnapshot, accountSnapshot] = await Promise.all([
    db.collection("creatorProfiles").doc(creatorId).get(),
    db.collection("creatorAccounts").doc(creatorId).get(),
  ]);
  const profileData = profileSnapshot.data();
  const accountData = accountSnapshot.data();
  if (
    !profileData || profileData.profilePublic !== true || profileData.discoverEligible !== true ||
    typeof profileData.handle !== "string" ||
    typeof profileData.displayName !== "string" ||
    typeof accountData?.ownerId !== "string"
  ) return { kind: "not-found", handle: requestedHandle };
  const profile = parseCreatorProfileInput(profileData);
  if (!isReviewedPublicCreatorProfile(profile)) return { kind: "not-found", handle: requestedHandle };
  const [spacesSnapshot, postsSnapshot] = await Promise.all([
    db.collection("galleries")
      .where("ownerId", "==", accountData.ownerId)
      .limit(100)
      .select(...publicDeliveryFields)
      .get(),
    db.collection("creatorAccounts").doc(creatorId).collection("posts")
      .orderBy("createdAt", "desc")
      .limit(12)
      .get(),
  ]);
  const spaces: PublicCreatorSpace[] = spacesSnapshot.docs
    .filter((document) => isCreatorProfileSpaceListed(document.data()))
    .map((document) => classifySpaceForDelivery(document.id, document.data()))
    .filter((delivery): delivery is PublicSpaceDelivery =>
      delivery.kind === "public" && delivery.indexEligible)
    .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
    .map((space) => ({
      id: space.id,
      title: space.title,
      creator: space.creator,
      coverUrl: `${PUBLIC_APP_URL.value().replace(/\/$/, "")}/space-cards/${space.id}?v=${space.revision}`,
      ...(space.updatedAt ? { updatedAt: space.updatedAt } : {}),
    }));
  const updated = timestampMilliseconds(profileData.updatedAt);
  const posts: PublicCreatorPost[] = postsSnapshot.docs.flatMap((document) => {
    if (document.data().moderationStatus === "removed") return [];
    const body = parseCreatorPostInput(document.data().body);
    const createdAt = timestampMilliseconds(document.data().createdAt);
    if (!body || createdAt === undefined) return [];
    return [{
      id: document.id,
      handle: profile.handle,
      displayName: profile.displayName,
      body,
      createdAt: new Date(createdAt).toISOString(),
      reactionCount: Math.max(0, Number.isSafeInteger(document.data().reactionCount) ? document.data().reactionCount : 0),
      commentCount: Math.max(0, Number.isSafeInteger(document.data().commentCount) ? document.data().commentCount : 0),
    }];
  });
  return {
    kind: "public",
    profile: {
      ...profile,
      ...(updated !== undefined ? { updatedAt: new Date(updated).toISOString() } : {}),
    },
    spaces,
    posts,
  };
}

function publicCreatorPayload(delivery: CreatorDelivery) {
  if (delivery.kind !== "public") return undefined;
  return { schemaVersion: 1, profile: delivery.profile, spaces: delivery.spaces, posts: delivery.posts };
}

async function publicDeliveryManifest(spaceId: string) {
  const snapshot = await db.collection("galleries")
    .where(FieldPath.documentId(), "==", spaceId)
    .select(...publicDeliveryFields)
    .limit(1)
    .get();
  return snapshot.docs[0]?.data();
}

function genericErrorShell(delivery: SpaceDelivery) {
  const metadata = metadataForSpace(delivery);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="${metadata.robots}"><title>${metadata.title}</title></head><body><main><h1>Space temporarily unavailable</h1><p>Please try again later.</p></main></body></html>`;
}

async function accountMediaFootprint(ownerId: string, galleryId: string) {
  const bucket = getStorage().bucket();
  const prefix = `published/${ownerId}/${galleryId}/`;
  let files;
  try {
    files = await collectBoundedPages({
      maximumItems: ACCOUNT_OPERATION_MAX_QUERY_DOCUMENTS,
      fetchPage: async (pageToken: string | undefined, limit) => {
        const [items, nextQuery] = await bucket.getFiles({
          prefix,
          autoPaginate: false,
          maxResults: limit,
          ...(pageToken ? { pageToken } : {}),
        });
        return { items, ...(nextQuery?.pageToken ? { nextCursor: nextQuery.pageToken } : {}) };
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "page-limit-exceeded")
      throw new HttpsError("resource-exhausted", "This immediate account operation is too large. Use the managed export.");
    throw error;
  }
  return mapInChunks(files, 10, async (file) => {
    const metadata = await file.getMetadata()
      .then(([value]) => value)
      .catch((error) => {
        logger.warn("immediate_account_export_media_metadata_unavailable", {
          objectRef: safeResourceRef(file.name),
          errorClass: classifyServerError(error),
        });
        return undefined;
      });
    const revisionMatch = /\/revisions\/([^/]+)\//.exec(file.name);
    return {
      path: file.name,
      contentType: metadata?.contentType ?? null,
      sizeBytes: Number(metadata?.size ?? 0),
      updatedAt: metadata?.updated ?? null,
      revisionId: revisionMatch?.[1] ?? null,
      ...(!metadata ? { metadataUnavailable: true } : {}),
    };
  });
}

/** Server-authoritative handle availability. The response never exposes a UID
 * or the private Creator mapping. */
export const checkLieuvaCreatorHandle = onCall(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const handle = normalizeCreatorHandle(request.data?.handle);
    if (!handle) throw new HttpsError("invalid-argument", "Use 3–30 lowercase letters, numbers, or single dashes.");
    const [candidate, owner] = await Promise.all([
      db.collection("creatorHandles").doc(handle).get(),
      db.collection("creatorAccountOwners").doc(uid).get(),
    ]);
    const creatorId = owner.data()?.creatorId;
    return { handle, available: !candidate.exists || candidate.data()?.creatorId === creatorId };
  },
);

export const getMyLieuvaCreatorProfile = onCall(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const owner = await db.collection("creatorAccountOwners").doc(uid).get();
    const creatorId = owner.data()?.creatorId;
    if (typeof creatorId !== "string") return { profile: null };
    const profile = await db.collection("creatorProfiles").doc(creatorId).get();
    const parsed = parseCreatorProfileInput(profile.data());
    return { profile: parsed };
  },
);

/** Creates or updates the narrow public Creator projection. Handle ownership is
 * decided atomically; old handles remain aliases and never become silently
 * available to another account. */
export const saveLieuvaCreatorProfile = onCall(
  { region: REGION, timeoutSeconds: 45, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const input = parseCreatorProfileInput(request.data);
    if (!input) throw new HttpsError("invalid-argument", "Check the public profile fields and HTTPS links.");
    const proposedCreatorId = randomBytes(16).toString("hex");
    const now = Date.now();
    await db.runTransaction(async (transaction) => {
      await assertAccountMutationAllowedInTransaction(transaction, uid);
      const ownerReference = db.collection("creatorAccountOwners").doc(uid);
      const ownerSnapshot = await transaction.get(ownerReference);
      const creatorId = typeof ownerSnapshot.data()?.creatorId === "string"
        ? ownerSnapshot.data()!.creatorId as string
        : proposedCreatorId;
      const accountReference = db.collection("creatorAccounts").doc(creatorId);
      const profileReference = db.collection("creatorProfiles").doc(creatorId);
      const handleReference = db.collection("creatorHandles").doc(input.handle);
      const [accountSnapshot, handleSnapshot, profileSnapshot] = await Promise.all([
        transaction.get(accountReference),
        transaction.get(handleReference),
        transaction.get(profileReference),
      ]);
      const account = accountSnapshot.data();
      const currentProfile = parseCreatorProfileInput(profileSnapshot.data());
      const currentHandle = typeof account?.currentHandle === "string" ? account.currentHandle : undefined;
      if (handleSnapshot.exists && handleSnapshot.data()?.creatorId !== creatorId)
        throw new HttpsError("already-exists", "That public handle is already in use.");
      if (currentHandle && currentHandle !== input.handle) {
        const lastChanged = timestampMilliseconds(account?.handleChangedAt);
        if (lastChanged !== undefined && now - lastChanged < CREATOR_HANDLE_CHANGE_COOLDOWN_MS)
          throw new HttpsError("failed-precondition", "Public handles can be changed once every seven days.");
      }
      transaction.set(ownerReference, {
        creatorId,
        currentHandle: input.handle,
        updatedAt: FieldValue.serverTimestamp(),
        schemaVersion: 1,
      }, { merge: true });
      transaction.set(accountReference, {
        ownerId: uid,
        currentHandle: input.handle,
        ...(currentHandle !== input.handle ? { handleChangedAt: FieldValue.serverTimestamp() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        schemaVersion: 1,
      }, { merge: true });
      transaction.set(profileReference, {
        handle: input.handle,
        displayName: input.displayName,
        bio: input.bio,
        links: input.links,
        profilePublic: input.profilePublic,
        // Approval is preserved only for a byte-for-byte equivalent normalized
        // public projection. Any owner-controlled public change returns to the
        // review queue; request input can never self-approve it.
        discoverEligible: creatorPublicContentMatches(currentProfile, input)
          && currentProfile?.discoverEligible === true,
        imagePresent: profileSnapshot.data()?.imagePresent === true,
        coverPresent: profileSnapshot.data()?.coverPresent === true,
        bioFont: input.bioFont,
        profileTone: input.profileTone,
        followerCount: typeof profileSnapshot.data()?.followerCount === "number"
          ? Math.max(0, profileSnapshot.data()!.followerCount)
          : 0,
        updatedAt: FieldValue.serverTimestamp(),
        schemaVersion: 1,
      });
      transaction.set(handleReference, {
        creatorId,
        canonicalHandle: input.handle,
        kind: "current",
        updatedAt: FieldValue.serverTimestamp(),
        schemaVersion: 1,
      });
      if (currentHandle && currentHandle !== input.handle) {
        transaction.set(db.collection("creatorHandles").doc(currentHandle), {
          creatorId,
          canonicalHandle: input.handle,
          kind: "alias",
          updatedAt: FieldValue.serverTimestamp(),
          schemaVersion: 1,
        });
      }
    });
    const savedProfile = parseCreatorProfileInput((await db.collection("creatorProfiles")
      .where("handle", "==", input.handle).limit(1).get()).docs[0]?.data())
      ?? { ...input, discoverEligible: false };
    return { profile: savedProfile, publicUrl: creatorCanonicalUrl(input.handle) };
  },
);

/** Updates private account media through the same server-owned lease used by
 * Creator media, so deletion can wait for and then drain every late write. */
export const setAuraAccountAvatar = onCall(
  {
    region: REGION,
    timeoutSeconds: 30,
    memory: "512MiB",
    concurrency: 2,
    maxInstances: 10,
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = requireAccount(request.auth);
    const object = getStorage().bucket().file(`profiles/${uid}/avatar.webp`);
    if (request.data?.remove === true) return withAccountMediaUploadLease(uid, async () => {
      await object.delete({ ignoreNotFound: true });
      return { imagePresent: false };
    });
    const encoded = typeof request.data?.base64 === "string" ? request.data.base64 : "";
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 720_000)
      throw new HttpsError("invalid-argument", "Choose a supported profile image under 512 KB.");
    const bytes = Buffer.from(encoded, "base64");
    if (!await isValidCreatorWebp(bytes))
      throw new HttpsError("invalid-argument", "Choose a supported profile image under 512 KB.");
    return withAccountMediaUploadLease(uid, async () => {
      await object.save(bytes, {
        resumable: false,
        metadata: {
          contentType: "image/webp",
          cacheControl: "private, no-store",
          metadata: { kind: "account-avatar", schemaVersion: "1" },
        },
      });
      try {
        await assertAccountMutationAllowed(uid);
      } catch (error) {
        await object.delete({ ignoreNotFound: true }).catch(() => undefined);
        throw error;
      }
      return { imagePresent: true };
    });
  },
);

/** Updates the optional public Creator image without exposing Storage paths or
 * account identifiers. The public image is always mediated by creatorImage. */
export const setLieuvaCreatorProfileImage = onCall(
  {
    region: REGION,
    timeoutSeconds: 30,
    memory: "512MiB",
    concurrency: 2,
    maxInstances: 10,
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = requireAccount(request.auth);
    await assertAccountMutationAllowed(uid);
    const owner = await db.collection("creatorAccountOwners").doc(uid).get();
    const creatorId = owner.data()?.creatorId;
    if (typeof creatorId !== "string") throw new HttpsError("failed-precondition", "Save the public profile first.");
    const profileReference = db.collection("creatorProfiles").doc(creatorId);
    if (!(await profileReference.get()).exists) throw new HttpsError("failed-precondition", "Save the public profile first.");
    const object = getStorage().bucket().file(`creator-public/${creatorId}/avatar.webp`);
    if (request.data?.remove === true) return withAccountMediaUploadLease(uid, async () => {
      await mergeForActiveAccount(uid, profileReference, {
        imagePresent: false,
        discoverEligible: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await object.delete({ ignoreNotFound: true });
      return { imagePresent: false };
    });
    const encoded = typeof request.data?.base64 === "string" ? request.data.base64 : "";
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 720_000)
      throw new HttpsError("invalid-argument", "Choose a supported profile image under 512 KB.");
    const bytes = Buffer.from(encoded, "base64");
    if (!await isValidCreatorWebp(bytes))
      throw new HttpsError("invalid-argument", "Choose a supported profile image under 512 KB.");
    return withAccountMediaUploadLease(uid, async () => {
      // Fail closed before touching the object. If Storage fails, the previous
      // image is no longer publicly mediated as reviewed content.
      await mergeForActiveAccount(uid, profileReference, {
        discoverEligible: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await object.save(bytes, {
        resumable: false,
        metadata: { contentType: "image/webp", cacheControl: "private, no-store", metadata: { kind: "creator-avatar", schemaVersion: "1" } },
      });
      try {
        await assertAccountMutationAllowed(uid);
        await mergeForActiveAccount(uid, profileReference, {
          imagePresent: true,
          discoverEligible: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (error) {
        await object.delete({ ignoreNotFound: true }).catch(() => undefined);
        throw error;
      }
      return { imagePresent: true };
    });
  },
);

/** Updates the optional landscape title image. It follows the same mediated
 * public-delivery contract as the profile image. */
export const setLieuvaCreatorProfileCover = onCall(
  {
    region: REGION,
    timeoutSeconds: 30,
    memory: "512MiB",
    concurrency: 2,
    maxInstances: 10,
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = requireAccount(request.auth);
    await assertAccountMutationAllowed(uid);
    const owner = await db.collection("creatorAccountOwners").doc(uid).get();
    const creatorId = owner.data()?.creatorId;
    if (typeof creatorId !== "string") throw new HttpsError("failed-precondition", "Save the public profile first.");
    const profileReference = db.collection("creatorProfiles").doc(creatorId);
    if (!(await profileReference.get()).exists) throw new HttpsError("failed-precondition", "Save the public profile first.");
    const object = getStorage().bucket().file(`creator-public/${creatorId}/cover.webp`);
    if (request.data?.remove === true) return withAccountMediaUploadLease(uid, async () => {
      await mergeForActiveAccount(uid, profileReference, {
        coverPresent: false,
        discoverEligible: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await object.delete({ ignoreNotFound: true });
      return { coverPresent: false };
    });
    const encoded = typeof request.data?.base64 === "string" ? request.data.base64 : "";
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length > 720_000)
      throw new HttpsError("invalid-argument", "Choose a supported cover image under 512 KB.");
    const bytes = Buffer.from(encoded, "base64");
    if (!await isValidCreatorWebp(bytes))
      throw new HttpsError("invalid-argument", "Choose a supported cover image under 512 KB.");
    return withAccountMediaUploadLease(uid, async () => {
      await mergeForActiveAccount(uid, profileReference, {
        discoverEligible: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await object.save(bytes, {
        resumable: false,
        metadata: { contentType: "image/webp", cacheControl: "private, no-store", metadata: { kind: "creator-cover", schemaVersion: "1" } },
      });
      try {
        await assertAccountMutationAllowed(uid);
        await mergeForActiveAccount(uid, profileReference, {
          coverPresent: true,
          discoverEligible: false,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } catch (error) {
        await object.delete({ ignoreNotFound: true }).catch(() => undefined);
        throw error;
      }
      return { coverPresent: true };
    });
  },
);

/** Authenticated Creator-to-Creator follows. Public profiles expose only an
 * aggregate count; account and Creator identifiers remain server-side. */
export const manageLieuvaCreatorFollow = onCall(
  { region: REGION, timeoutSeconds: 20, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const handle = normalizeCreatorHandle(request.data?.handle);
    const action = request.data?.action;
    if (!handle || !["status", "follow", "unfollow"].includes(action))
      throw new HttpsError("invalid-argument", "Choose a valid public Creator and follow action.");
    const [ownerSnapshot, handleSnapshot] = await Promise.all([
      db.collection("creatorAccountOwners").doc(uid).get(),
      db.collection("creatorHandles").doc(handle).get(),
    ]);
    const followerCreatorId = ownerSnapshot.data()?.creatorId;
    const followedCreatorId = handleSnapshot.data()?.creatorId;
    if (typeof followedCreatorId !== "string") throw new HttpsError("not-found", "Creator profile not found.");
    const targetReference = db.collection("creatorProfiles").doc(followedCreatorId);
    const targetSnapshot = await targetReference.get();
    const target = parseCreatorProfileInput(targetSnapshot.data());
    if (!isReviewedPublicCreatorProfile(target))
      throw new HttpsError("not-found", "Creator profile not found.");
    if (typeof followerCreatorId !== "string")
      return { following: false, followerCount: target.followerCount, canFollow: false, isSelf: false };
    const isSelf = followerCreatorId === followedCreatorId;
    const followReference = db.collection("creatorFollows").doc(`${followerCreatorId}_${followedCreatorId}`);
    const actorProfileReference = db.collection("creatorProfiles").doc(followerCreatorId);
    const actionNow = Date.now();
    const rateReference = db.collection("creatorActionRateLimits")
      .doc(creatorActionRateId(followerCreatorId, "follow"));
    const followNotificationReference = db.collection("creatorNotifications")
      .doc(followedCreatorId)
      .collection("items")
      .doc(creatorNotificationAggregateId({
        kind: "follow",
        actorCreatorId: followerCreatorId,
        targetCreatorId: followedCreatorId,
        now: actionNow,
      }));
    const [outgoingBlock, incomingBlock] = isSelf ? [undefined, undefined] : await Promise.all([
      db.collection("creatorBlocks").doc(`${followerCreatorId}_${followedCreatorId}`).get(),
      db.collection("creatorBlocks").doc(`${followedCreatorId}_${followerCreatorId}`).get(),
    ]);
    const blocked = outgoingBlock?.exists === true || incomingBlock?.exists === true;
    if (action === "status" || isSelf) {
      const follow = isSelf ? undefined : await followReference.get();
      const actorProfile = isSelf
        ? target
        : parseCreatorProfileInput((await actorProfileReference.get()).data());
      return {
        following: blocked ? false : follow?.exists === true,
        followerCount: target.followerCount,
        canFollow: !isSelf && !blocked && isReviewedPublicCreatorProfile(actorProfile),
        isSelf,
        blocked,
      };
    }
    if (blocked) throw new HttpsError("failed-precondition", "This Creator connection is blocked.");
    const transitionResult = await db.runTransaction(async (transaction) => {
      const followedAccount = await transaction.get(db.collection("creatorAccounts").doc(followedCreatorId));
      await assertAccountMutationAllowedInTransaction(
        transaction,
        uid,
        typeof followedAccount.data()?.ownerId === "string" ? followedAccount.data()!.ownerId : uid,
      );
      const [followSnapshot, currentTarget, actorProfileSnapshot, rateSnapshot] = await Promise.all([
        transaction.get(followReference),
        transaction.get(targetReference),
        transaction.get(actorProfileReference),
        transaction.get(rateReference),
      ]);
      const exists = followSnapshot.exists;
      const currentTargetProfile = parseCreatorProfileInput(currentTarget.data());
      const actorProfile = parseCreatorProfileInput(actorProfileSnapshot.data());
      const count = currentTargetProfile?.followerCount ?? 0;
      const transition = creatorFollowTransition(action, exists, count);
      const rate = action === "follow" && transition.changed
        ? creatorActionRateState("follow", followerCreatorId, actionNow, rateSnapshot.data())
        : undefined;
      if (action === "follow" && transition.changed) {
        if (!isReviewedPublicCreatorProfile(currentTargetProfile))
          throw new HttpsError("not-found", "Creator profile not found.");
        if (!isReviewedPublicCreatorProfile(actorProfile))
          throw new HttpsError("failed-precondition", "Your public Creator profile must be reviewed before following.");
        transaction.create(followReference, {
          followerCreatorId,
          followedCreatorId,
          createdAt: FieldValue.serverTimestamp(),
          schemaVersion: 1,
        });
        transaction.set(targetReference, { followerCount: transition.followerCount }, { merge: true });
        transaction.set(rate!.reference, rate!.patch, { merge: true });
        transaction.set(followNotificationReference, notificationAggregatePatch({
          kind: "follow",
          actorCreatorId: followerCreatorId,
          actorHandle: actorProfile.handle,
          actorDisplayName: actorProfile.displayName,
        }), { merge: true });
        return { following: true, changed: true, actorProfilePublic: true };
      }
      if (action === "unfollow" && transition.changed) {
        transaction.delete(followReference);
        transaction.set(targetReference, { followerCount: transition.followerCount }, { merge: true });
        return { following: false, changed: true, actorProfilePublic: isReviewedPublicCreatorProfile(actorProfile) };
      }
      return { following: exists, changed: false, actorProfilePublic: isReviewedPublicCreatorProfile(actorProfile) };
    });
    const updated = parseCreatorProfileInput((await targetReference.get()).data());
    return { following: transitionResult.following, followerCount: updated?.followerCount ?? 0, canFollow: transitionResult.actorProfilePublic, isSelf: false, blocked: false };
  },
);

/** A bounded, text-only public post. The transaction makes the cooldown
 * server-authoritative and prevents clients from writing Creator data directly. */
export const createLieuvaCreatorPost = onCall(
  { region: REGION, timeoutSeconds: 15, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const body = parseCreatorPostInput(request.data?.body);
    if (!body) throw new HttpsError("invalid-argument", "Write between 1 and 600 characters.");
    const owner = await db.collection("creatorAccountOwners").doc(uid).get();
    const creatorId = owner.data()?.creatorId;
    if (typeof creatorId !== "string")
      throw new HttpsError("failed-precondition", "Create your Creator profile before posting.");
    const profileReference = db.collection("creatorProfiles").doc(creatorId);
    const profile = parseCreatorProfileInput((await profileReference.get()).data());
    if (!isReviewedPublicCreatorProfile(profile))
      throw new HttpsError("failed-precondition", "Your public Creator profile must be reviewed before posting.");
    const accountReference = db.collection("creatorAccounts").doc(creatorId);
    const postReference = accountReference.collection("posts").doc();
    const createdAt = new Date();
    await db.runTransaction(async (transaction) => {
      await assertAccountMutationAllowedInTransaction(transaction, uid);
      const account = await transaction.get(accountReference);
      if (account.data()?.ownerId !== uid)
        throw new HttpsError("permission-denied", "This Creator profile is not available to this account.");
      const lastPostAt = timestampMilliseconds(account.data()?.lastPostAt);
      if (lastPostAt !== undefined && createdAt.getTime() - lastPostAt < 30_000)
        throw new HttpsError("resource-exhausted", "Wait a moment before posting again.");
      transaction.set(postReference, {
        body,
        createdAt: FieldValue.serverTimestamp(),
        reactionCount: 0,
        commentCount: 0,
        moderationStatus: "published",
        schemaVersion: 1,
      });
      transaction.set(accountReference, { lastPostAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    return {
      post: {
        id: postReference.id,
        handle: profile.handle,
        displayName: profile.displayName,
        body,
        createdAt: createdAt.toISOString(),
        reactionCount: 0,
        commentCount: 0,
      },
    };
  },
);

/** Moderated post engagement. Reactions and comments are enabled only behind
 * server-owned reporting/blocking boundaries; clients never write the social
 * collections directly. */
export const manageLieuvaCreatorPostInteraction = onCall(
  { region: REGION, timeoutSeconds: 20, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const handle = normalizeCreatorHandle(request.data?.handle);
    const postId = typeof request.data?.postId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(request.data.postId)
      ? request.data.postId
      : null;
    const action = request.data?.action;
    if (!handle || !postId || !["react", "unreact", "comment", "report"].includes(action))
      throw new HttpsError("invalid-argument", "Choose a valid Creator post interaction.");
    const [actorOwner, targetHandle] = await Promise.all([
      db.collection("creatorAccountOwners").doc(uid).get(),
      db.collection("creatorHandles").doc(handle).get(),
    ]);
    const actorCreatorId = actorOwner.data()?.creatorId;
    const targetCreatorId = targetHandle.data()?.creatorId;
    if (typeof targetCreatorId !== "string") throw new HttpsError("not-found", "Creator post not found.");
    const [targetProfileSnapshot, post] = await Promise.all([
      db.collection("creatorProfiles").doc(targetCreatorId).get(),
      db.collection("creatorAccounts").doc(targetCreatorId).collection("posts").doc(postId).get(),
    ]);
    const targetProfile = parseCreatorProfileInput(targetProfileSnapshot.data());
    if (!isReviewedPublicCreatorProfile(targetProfile))
      throw new HttpsError("not-found", "Creator post not found.");
    const postReference = db.collection("creatorAccounts").doc(targetCreatorId).collection("posts").doc(postId);
    if (!post.exists || post.data()?.moderationStatus === "removed")
      throw new HttpsError("not-found", "Creator post not found.");

    if (action === "report") {
      const reason = parseCreatorReportReason(request.data?.reason);
      if (!reason) throw new HttpsError("invalid-argument", "Choose a valid report reason.");
      // Keep legacy Creator-keyed report IDs stable. Accounts without a public
      // Creator identity still receive a private, deterministic reporting key.
      const reporterKey = creatorReportPrincipal(uid, actorCreatorId);
      const reportId = creatorPostReportId(reporterKey, targetCreatorId, postId);
      const computedCaseId = creatorPostModerationCaseId(targetCreatorId, postId);
      const reportReference = db.collection("creatorReports").doc(reportId);
      const caseReference = db.collection("moderationCases").doc(computedCaseId);
      const eventReference = caseReference.collection("events").doc();
      const actionNow = Date.now();
      const rateReference = db.collection("creatorActionRateLimits")
        .doc(creatorActionRateId(uid, "report"));
      const intake = await db.runTransaction(async (transaction) => {
        const targetAccount = await transaction.get(db.collection("creatorAccounts").doc(targetCreatorId));
        await assertAccountMutationAllowedInTransaction(
          transaction,
          uid,
          typeof targetAccount.data()?.ownerId === "string" ? targetAccount.data()!.ownerId : uid,
        );
        const [currentPost, existingReport, existingCase, rateSnapshot] = await Promise.all([
          transaction.get(postReference),
          transaction.get(reportReference),
          transaction.get(caseReference),
          transaction.get(rateReference),
        ]);
        if (!currentPost.exists || currentPost.data()?.moderationStatus === "removed")
          throw new HttpsError("not-found", "Creator post not found.");
        const reportData = existingReport.data();
        const caseData = existingCase.data();
        const caseId = typeof reportData?.caseId === "string" && /^[a-f0-9]{64}$/.test(reportData.caseId)
          ? reportData.caseId
          : computedCaseId;
        if (caseId !== computedCaseId)
          throw new HttpsError("failed-precondition", "This report needs operator reconciliation.");
        const incomingPriority = moderationPriorityForReason(reason);
        const reportPatch = creatorReportIntakePatch(reportData, reason, caseId);
        const rate = creatorActionRateState("report", uid, actionNow, rateSnapshot.data());
        transaction.set(rate.reference, rate.patch, { merge: true });
        transaction.set(reportReference, {
          ...(existingReport.exists ? {} : {
            ...(typeof actorCreatorId === "string" ? { reporterCreatorId: actorCreatorId } : {}),
            targetCreatorId,
            postId,
            targetKind: "creator-post",
            firstReportedAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
          }),
          reporterAccountId: uid,
          ...reportPatch,
          lastReportedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(caseReference, {
          ...(existingCase.exists ? {} : {
            targetKind: "creator-post",
            target: { creatorId: targetCreatorId, postId },
            targetCreatorId,
            postId,
            status: "received",
            openedAt: FieldValue.serverTimestamp(),
          }),
          sourceReportIds: boundedModerationSourceReports(caseData?.sourceReportIds, reportId),
          reportCount: (typeof caseData?.reportCount === "number" && Number.isSafeInteger(caseData.reportCount) && caseData.reportCount >= 0
            ? caseData.reportCount
            : 0) + 1,
          priority: highestModerationPriority(caseData?.priority, incomingPriority),
          lastReportReason: reason,
          newReportPending: true,
          lastReportedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          version: (typeof caseData?.version === "number" && Number.isSafeInteger(caseData.version) && caseData.version >= 1
            ? caseData.version
            : 0) + 1,
          schemaVersion: 1,
        }, { merge: true });
        transaction.create(eventReference, {
          kind: "report-received",
          reasonCode: reason,
          repeatedByReporter: existingReport.exists,
          priority: incomingPriority,
          createdAt: FieldValue.serverTimestamp(),
          schemaVersion: 1,
        });
        return { repeated: existingReport.exists };
      });
      logger.info("creator_report_received", {
        schema: "lieuva_moderation_intake_v1",
        reason,
        repeated: intake.repeated,
      });
      return { reported: true, receiptId: eventReference.id };
    }

    if (typeof actorCreatorId !== "string")
      throw new HttpsError("failed-precondition", "Create your Creator profile before joining the conversation.");
    const actorProfile = parseCreatorProfileInput(
      (await db.collection("creatorProfiles").doc(actorCreatorId).get()).data(),
    );
    if (!isReviewedPublicCreatorProfile(actorProfile))
      throw new HttpsError("failed-precondition", "Your public Creator profile must be reviewed before joining the conversation.");
    const [outgoingBlock, incomingBlock] = await Promise.all([
      db.collection("creatorBlocks").doc(`${actorCreatorId}_${targetCreatorId}`).get(),
      db.collection("creatorBlocks").doc(`${targetCreatorId}_${actorCreatorId}`).get(),
    ]);
    if (outgoingBlock.exists || incomingBlock.exists)
      throw new HttpsError("failed-precondition", "This Creator connection is blocked.");

    if (action === "comment") {
      const body = parseCreatorCommentInput(request.data?.body);
      if (!body) throw new HttpsError("invalid-argument", "Write between 1 and 280 characters.");
      const commentReference = postReference.collection("comments").doc();
      const actionNow = Date.now();
      const rateReference = db.collection("creatorActionRateLimits")
        .doc(creatorActionRateId(actorCreatorId, "comment"));
      const commentNotificationReference = db.collection("creatorNotifications")
        .doc(targetCreatorId)
        .collection("items")
        .doc(creatorNotificationAggregateId({
          kind: "comment",
          actorCreatorId,
          targetCreatorId,
          resourceId: postId,
          now: actionNow,
        }));
      await db.runTransaction(async (transaction) => {
        const targetAccount = await transaction.get(db.collection("creatorAccounts").doc(targetCreatorId));
        await assertAccountMutationAllowedInTransaction(
          transaction,
          uid,
          typeof targetAccount.data()?.ownerId === "string" ? targetAccount.data()!.ownerId : uid,
        );
        const [currentPost, actorAccount, rateSnapshot] = await Promise.all([
          transaction.get(postReference),
          transaction.get(db.collection("creatorAccounts").doc(actorCreatorId)),
          transaction.get(rateReference),
        ]);
        if (!currentPost.exists || currentPost.data()?.moderationStatus === "removed")
          throw new HttpsError("not-found", "Creator post not found.");
        const lastCommentAt = timestampMilliseconds(actorAccount.data()?.lastCommentAt);
        if (lastCommentAt !== undefined && actionNow - lastCommentAt < 15_000)
          throw new HttpsError("resource-exhausted", "Wait a moment before commenting again.");
        const rate = creatorActionRateState("comment", actorCreatorId, actionNow, rateSnapshot.data());
        const commentCount = Math.max(0, Number.isSafeInteger(currentPost.data()?.commentCount) ? currentPost.data()!.commentCount : 0);
        transaction.create(commentReference, {
          authorCreatorId: actorCreatorId,
          authorHandle: actorProfile.handle,
          authorDisplayName: actorProfile.displayName,
          body,
          moderationStatus: "published",
          createdAt: FieldValue.serverTimestamp(),
          schemaVersion: 1,
        });
        transaction.set(postReference, { commentCount: commentCount + 1 }, { merge: true });
        transaction.set(db.collection("creatorAccounts").doc(actorCreatorId), { lastCommentAt: FieldValue.serverTimestamp() }, { merge: true });
        transaction.set(rate.reference, rate.patch, { merge: true });
        transaction.set(commentNotificationReference, notificationAggregatePatch({
          kind: "comment",
          actorCreatorId,
          actorHandle: actorProfile.handle,
          actorDisplayName: actorProfile.displayName,
          postId,
          bodyPreview: body.slice(0, 100),
        }), { merge: true });
      });
      return { comment: { id: commentReference.id, handle: actorProfile.handle, displayName: actorProfile.displayName, body, createdAt: new Date().toISOString() } };
    }

    const reactionReference = postReference.collection("reactions").doc(actorCreatorId);
    const actionNow = Date.now();
    const rateReference = db.collection("creatorActionRateLimits")
      .doc(creatorActionRateId(actorCreatorId, "reaction"));
    const reactionNotificationReference = db.collection("creatorNotifications")
      .doc(targetCreatorId)
      .collection("items")
      .doc(creatorNotificationAggregateId({
        kind: "reaction",
        actorCreatorId,
        targetCreatorId,
        resourceId: postId,
        now: actionNow,
      }));
    const reactionResult = await db.runTransaction(async (transaction) => {
      const targetAccount = await transaction.get(db.collection("creatorAccounts").doc(targetCreatorId));
      await assertAccountMutationAllowedInTransaction(
        transaction,
        uid,
        typeof targetAccount.data()?.ownerId === "string" ? targetAccount.data()!.ownerId : uid,
      );
      const [currentPost, currentReaction, rateSnapshot] = await Promise.all([
        transaction.get(postReference),
        transaction.get(reactionReference),
        transaction.get(rateReference),
      ]);
      if (!currentPost.exists || currentPost.data()?.moderationStatus === "removed")
        throw new HttpsError("not-found", "Creator post not found.");
      const currentCount = Math.max(0, Number.isSafeInteger(currentPost.data()?.reactionCount) ? currentPost.data()!.reactionCount : 0);
      if (action === "react" && !currentReaction.exists) {
        const rate = creatorActionRateState("reaction", actorCreatorId, actionNow, rateSnapshot.data());
        transaction.create(reactionReference, { creatorId: actorCreatorId, createdAt: FieldValue.serverTimestamp(), schemaVersion: 1 });
        transaction.set(postReference, { reactionCount: currentCount + 1 }, { merge: true });
        transaction.set(rate.reference, rate.patch, { merge: true });
        transaction.set(reactionNotificationReference, notificationAggregatePatch({
          kind: "reaction",
          actorCreatorId,
          actorHandle: actorProfile.handle,
          actorDisplayName: actorProfile.displayName,
          postId,
        }), { merge: true });
        return { reacted: true, reactionCount: currentCount + 1, changed: true };
      }
      if (action === "unreact" && currentReaction.exists) {
        transaction.delete(reactionReference);
        transaction.set(postReference, { reactionCount: Math.max(0, currentCount - 1) }, { merge: true });
        return { reacted: false, reactionCount: Math.max(0, currentCount - 1), changed: true };
      }
      return { reacted: currentReaction.exists, reactionCount: currentCount, changed: false };
    });
    return reactionResult;
  },
);

export const manageLieuvaCreatorBlock = onCall(
  { region: REGION, timeoutSeconds: 20, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const handle = normalizeCreatorHandle(request.data?.handle);
    const action = request.data?.action;
    if (!handle || !["block", "unblock"].includes(action))
      throw new HttpsError("invalid-argument", "Choose a valid Creator block action.");
    const [owner, targetHandle] = await Promise.all([
      db.collection("creatorAccountOwners").doc(uid).get(),
      db.collection("creatorHandles").doc(handle).get(),
    ]);
    const blockerCreatorId = owner.data()?.creatorId;
    const blockedCreatorId = targetHandle.data()?.creatorId;
    if (typeof blockerCreatorId !== "string") throw new HttpsError("failed-precondition", "Create your Creator profile first.");
    if (typeof blockedCreatorId !== "string" || blockedCreatorId === blockerCreatorId)
      throw new HttpsError("invalid-argument", "Choose another public Creator.");
    const blockReference = db.collection("creatorBlocks").doc(`${blockerCreatorId}_${blockedCreatorId}`);
    const outgoingFollow = db.collection("creatorFollows").doc(`${blockerCreatorId}_${blockedCreatorId}`);
    const incomingFollow = db.collection("creatorFollows").doc(`${blockedCreatorId}_${blockerCreatorId}`);
    await db.runTransaction(async (transaction) => {
      const [latestOwner, latestTargetHandle, blockedAccount] = await Promise.all([
        transaction.get(db.collection("creatorAccountOwners").doc(uid)),
        transaction.get(db.collection("creatorHandles").doc(handle)),
        transaction.get(db.collection("creatorAccounts").doc(blockedCreatorId)),
      ]);
      if (latestOwner.data()?.creatorId !== blockerCreatorId ||
        latestTargetHandle.data()?.creatorId !== blockedCreatorId ||
        typeof blockedAccount.data()?.ownerId !== "string")
        throw new HttpsError("not-found", "Creator profile not found.");
      await assertAccountMutationAllowedInTransaction(
        transaction,
        uid,
        blockedAccount.data()!.ownerId,
      );
      const [block, outgoing, incoming, blockerProfile, blockedProfile] = await Promise.all([
        transaction.get(blockReference), transaction.get(outgoingFollow), transaction.get(incomingFollow),
        transaction.get(db.collection("creatorProfiles").doc(blockerCreatorId)),
        transaction.get(db.collection("creatorProfiles").doc(blockedCreatorId)),
      ]);
      if (!blockerProfile.exists || !blockedProfile.exists)
        throw new HttpsError("not-found", "Creator profile not found.");
      if (action === "unblock") {
        if (block.exists) transaction.delete(blockReference);
        return;
      }
      if (!block.exists) transaction.create(blockReference, {
        blockerCreatorId, blockedCreatorId, createdAt: FieldValue.serverTimestamp(), schemaVersion: 1,
      });
      if (outgoing.exists) {
        transaction.delete(outgoingFollow);
        transaction.set(blockedProfile.ref, { followerCount: Math.max(0, (blockedProfile.data()?.followerCount ?? 0) - 1) }, { merge: true });
      }
      if (incoming.exists) {
        transaction.delete(incomingFollow);
        transaction.set(blockerProfile.ref, { followerCount: Math.max(0, (blockerProfile.data()?.followerCount ?? 0) - 1) }, { merge: true });
      }
    });
    return { blocked: action === "block" };
  },
);

/** Private home feed made only from already-public Creator profiles, posts and
 * public Space updates. Private Creator and Space data is never projected. */
export const getMyLieuvaCreatorHome = onCall(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    await assertAccountMutationAllowed(uid);
    const owner = await db.collection("creatorAccountOwners").doc(uid).get();
    const creatorId = owner.data()?.creatorId;
    if (typeof creatorId !== "string") return { schemaVersion: 1, following: [], updates: [], posts: [], notifications: [] };
    const [follows, blocks, notificationsSnapshot] = await Promise.all([
      db.collection("creatorFollows").where("followerCreatorId", "==", creatorId).limit(50).get(),
      db.collection("creatorBlocks").where("blockerCreatorId", "==", creatorId).limit(100).get(),
      db.collection("creatorNotifications").doc(creatorId).collection("items").orderBy("createdAt", "desc").limit(20).get(),
    ]);
    const blockedIds = new Set(blocks.docs.map((document) => document.data().blockedCreatorId).filter((value): value is string => typeof value === "string"));
    const followedIds = follows.docs
      .map((document) => document.data().followedCreatorId)
      .filter((value): value is string => typeof value === "string" && !blockedIds.has(value));
    const profiles = await Promise.all(followedIds.map((id) => db.collection("creatorProfiles").doc(id).get()));
    const parsedFollowedProfiles = profiles.map((snapshot) => ({
      creatorId: snapshot.id,
      profile: parseCreatorProfileInput(snapshot.data()),
    }));
    const publicProfiles = parsedFollowedProfiles
      .map(({ profile }) => profile)
      .filter(isReviewedPublicCreatorProfile);
    const ownProfile = parseCreatorProfileInput((await db.collection("creatorProfiles").doc(creatorId).get()).data());
    const feedProfiles = [
      ...(isReviewedPublicCreatorProfile(ownProfile) ? [ownProfile] : []),
      ...publicProfiles,
    ].filter((profile, index, profilesValue) => profilesValue.findIndex((candidate) => candidate.handle === profile.handle) === index);
    const feedDeliveries = await Promise.all(feedProfiles.map((profile) => creatorDeliveryForHandle(profile.handle)));
    const followedHandles = new Set(publicProfiles.map((profile) => profile.handle));
    const deliveries = feedDeliveries.filter((delivery) => delivery.kind === "public" && followedHandles.has(delivery.profile.handle));
    const following = publicProfiles.map((profile) => ({
      handle: profile.handle,
      displayName: profile.displayName,
      bio: profile.bio,
      imagePresent: profile.imagePresent,
      followerCount: profile.followerCount,
    }));
    const updates = deliveries.flatMap((delivery) => delivery.kind === "public"
      ? delivery.spaces.map((space) => ({
          ...space,
          handle: delivery.profile.handle,
          displayName: delivery.profile.displayName,
        }))
      : [])
      .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
      .slice(0, 24);
    const posts = feedDeliveries.flatMap((delivery) => delivery.kind === "public" ? delivery.posts : [])
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 30);
    let postsWithViewerState = posts;
    if (request.data?.includeViewerState === true) {
      const creatorIdsByHandle = new Map<string, string>();
      if (isReviewedPublicCreatorProfile(ownProfile)) creatorIdsByHandle.set(ownProfile.handle, creatorId);
      for (const { creatorId: followedCreatorId, profile } of parsedFollowedProfiles)
        if (isReviewedPublicCreatorProfile(profile)) creatorIdsByHandle.set(profile.handle, followedCreatorId);
      const reactionLookups = posts.flatMap((post, index) => {
        const postCreatorId = creatorIdsByHandle.get(post.handle);
        return postCreatorId ? [{
          index,
          reference: db.collection("creatorAccounts").doc(postCreatorId).collection("posts").doc(post.id).collection("reactions").doc(creatorId),
        }] : [];
      });
      const reactionSnapshots = reactionLookups.length
        ? await db.getAll(...reactionLookups.map(({ reference }) => reference))
        : [];
      const reactedPostIndexes = new Set(reactionSnapshots.flatMap((snapshot, lookupIndex) =>
        snapshot.exists ? [reactionLookups[lookupIndex]!.index] : []));
      postsWithViewerState = posts.map((post, index) => ({
        ...post,
        viewerReacted: reactedPostIndexes.has(index),
      }));
    }
    const notifications = notificationsSnapshot.docs.flatMap((document) => {
      const data = document.data();
      const createdAt = timestampMilliseconds(data.createdAt);
      if (createdAt === undefined) return [];
      const notification = creatorNotificationProjection(data, new Date(createdAt).toISOString());
      return notification ? [{ id: document.id, ...notification }] : [];
    });
    return { schemaVersion: 1, following, updates, posts: postsWithViewerState, notifications };
  },
);

/** Marks only the authenticated Creator's own notification documents as read. */
export const markMyLieuvaCreatorNotificationsRead = onCall(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const owner = await db.collection("creatorAccountOwners").doc(uid).get();
    const creatorId = owner.data()?.creatorId;
    if (typeof creatorId !== "string") return { marked: 0 };

    const markAll = request.data?.all === true;
    const requestedIds = Array.isArray(request.data?.notificationIds)
      ? [...new Set(request.data.notificationIds)]
      : [];
    if (!markAll && (!requestedIds.length || requestedIds.length > 20 || requestedIds.some((id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id))))
      throw new HttpsError("invalid-argument", "Choose up to 20 valid notifications.");

    const notificationCollection = db.collection("creatorNotifications").doc(creatorId).collection("items");
    if (markAll) {
      let marked = 0;
      while (true) {
        const changed = await db.runTransaction(async (transaction) => {
          await assertAccountMutationAllowedInTransaction(transaction, uid);
          const unreadPage = await transaction.get(
            notificationCollection.where("read", "==", false).limit(400),
          );
          for (const snapshot of unreadPage.docs) transaction.set(snapshot.ref, {
            read: true,
            readAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          return unreadPage.size;
        });
        marked += changed;
        if (changed < 400) break;
      }
      return { marked };
    }

    const marked = await db.runTransaction(async (transaction) => {
      await assertAccountMutationAllowedInTransaction(transaction, uid);
      const snapshots = await Promise.all((requestedIds as string[])
        .map((id) => transaction.get(notificationCollection.doc(id))));
      const unread = snapshots.filter((snapshot) => snapshot.exists && snapshot.data()?.read !== true);
      for (const snapshot of unread) transaction.set(snapshot.ref, {
        read: true,
        readAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return unread.length;
    });
    return { marked };
  },
);

const ACCOUNT_EXPORT_PARTITION_COMPLETE = "~";
const ACCOUNT_EXPORT_FETCH_LIMIT = ACCOUNT_EXPORT_MAX_PAGE_RECORDS + 1;
const ACCOUNT_EXPORT_STEPS_PER_CALL = 4;
const ACCOUNT_EXPORT_LIFETIME_SECONDS = 24 * 60 * 60;

function accountExportJobReference(uid: string) {
  return db.collection("accountExportJobs").doc(uid);
}

function accountExportChunkReference(uid: string, state: AccountExportJobState, id: string) {
  return accountExportJobReference(uid).collection("accountExportChunks").doc(`${state.jobId}_${id}`);
}

function accountExportSingletonPage(
  section: AccountExportSection,
  position: string[] | undefined,
  recordId: string,
  value: unknown,
  include: boolean,
): AccountExportPage {
  if (position !== undefined) throw new Error("export-job-state-invalid");
  return {
    section,
    records: include ? [{ after: [recordId], value }] : [],
    exhausted: true,
  };
}

function accountExportDocumentReference(position: string[] | undefined) {
  if (position === undefined) return undefined;
  if (position.length !== 1 || position[0].split("/").length % 2 !== 0)
    throw new Error("export-job-state-invalid");
  try {
    return db.doc(position[0]);
  } catch {
    throw new Error("export-job-state-invalid");
  }
}

async function accountExportFirestorePage(
  section: AccountExportSection,
  query: Query,
  position: string[] | undefined,
  project: (snapshot: QueryDocumentSnapshot) => unknown,
): Promise<AccountExportPage> {
  const resume = accountExportDocumentReference(position);
  const ordered = query.orderBy(FieldPath.documentId());
  const snapshot = await (resume ? ordered.startAfter(resume) : ordered)
    .limit(ACCOUNT_EXPORT_FETCH_LIMIT)
    .get();
  const documents = snapshot.docs.slice(0, ACCOUNT_EXPORT_MAX_PAGE_RECORDS);
  return {
    section,
    records: documents.map((document) => ({
      after: [document.ref.path],
      value: safeAccountExportSourceRecord(
        () => project(document),
        () => logger.warn("managed_account_export_record_unavailable", {
          section,
          recordRef: safeResourceRef(document.ref.path),
        }),
      ),
    })),
    exhausted: snapshot.size <= ACCOUNT_EXPORT_MAX_PAGE_RECORDS,
  };
}

async function accountExportNextOwnedGallery(uid: string, afterGalleryId?: string) {
  let query: Query = db.collection("galleries")
    .where("ownerId", "==", uid)
    .orderBy(FieldPath.documentId());
  if (afterGalleryId) query = query.startAfter(db.collection("galleries").doc(afterGalleryId));
  return (await query.limit(1).get()).docs[0];
}

async function accountExportOwnedGalleryPartition(
  uid: string,
  position: string[] | undefined,
  innerPrefix: (galleryId: string) => string,
) {
  if (!position) return { gallery: await accountExportNextOwnedGallery(uid), innerPosition: undefined };
  if (position.length !== 2) throw new Error("export-job-state-invalid");
  const galleryId = parsePersistedGalleryDocumentId(position[0]);
  if (!galleryId) throw new Error("export-job-state-invalid");
  const innerPosition = position[1];
  if (innerPosition === ACCOUNT_EXPORT_PARTITION_COMPLETE)
    return { gallery: await accountExportNextOwnedGallery(uid, galleryId), innerPosition: undefined };
  if (!innerPosition.startsWith(innerPrefix(galleryId))) throw new Error("export-job-state-invalid");
  const gallery = await db.collection("galleries").doc(galleryId).get();
  if (gallery.exists && gallery.data()?.ownerId === uid) return { gallery, innerPosition };
  return { gallery: await accountExportNextOwnedGallery(uid, galleryId), innerPosition: undefined };
}

async function accountExportHasLaterOwnedGallery(uid: string, galleryId: string) {
  return Boolean(await accountExportNextOwnedGallery(uid, galleryId));
}

async function accountExportOwnedMembersPage(
  uid: string,
  section: AccountExportSection,
  position: string[] | undefined,
): Promise<AccountExportPage> {
  const partition = await accountExportOwnedGalleryPartition(
    uid,
    position,
    (galleryId) => `galleries/${galleryId}/members/`,
  );
  if (!partition.gallery) return { section, records: [], exhausted: true };
  let query: Query = partition.gallery.ref.collection("members").orderBy(FieldPath.documentId());
  if (partition.innerPosition) query = query.startAfter(db.doc(partition.innerPosition));
  const snapshot = await query.limit(ACCOUNT_EXPORT_FETCH_LIMIT).get();
  const members = snapshot.docs.slice(0, ACCOUNT_EXPORT_MAX_PAGE_RECORDS);
  const galleryComplete = snapshot.size <= ACCOUNT_EXPORT_MAX_PAGE_RECORDS;
  const finalGallery = galleryComplete
    ? !(await accountExportHasLaterOwnedGallery(uid, partition.gallery.id))
    : false;
  const nextPosition = galleryComplete
    ? ACCOUNT_EXPORT_PARTITION_COMPLETE
    : members.at(-1)!.ref.path;
  return {
    section,
    records: [{
      after: [partition.gallery.id, nextPosition],
      value: safeAccountExportSourceRecord(
        () => ownedSpaceMemberBatch(partition.gallery!.id, members.map((member) => member.data())),
        () => logger.warn("managed_account_export_member_page_unavailable", {
          galleryRef: safeResourceRef(partition.gallery!.id),
        }),
      ),
    }],
    exhausted: galleryComplete && finalGallery,
  };
}

async function accountExportOwnedMediaPage(
  uid: string,
  section: AccountExportSection,
  position: string[] | undefined,
): Promise<AccountExportPage> {
  const partition = await accountExportOwnedGalleryPartition(
    uid,
    position,
    (galleryId) => `published/${uid}/${galleryId}/`,
  );
  if (!partition.gallery) return { section, records: [], exhausted: true };
  const prefix = `published/${uid}/${partition.gallery.id}/`;
  const [listedFiles] = await getStorage().bucket().getFiles({
    prefix,
    autoPaginate: false,
    // startOffset is inclusive, so reserve one additional slot for the cursor.
    maxResults: partition.innerPosition
      ? ACCOUNT_EXPORT_FETCH_LIMIT + 1
      : ACCOUNT_EXPORT_FETCH_LIMIT,
    ...(partition.innerPosition ? { startOffset: partition.innerPosition } : {}),
  });
  const window = storageObjectWindowAfterCursor(
    listedFiles,
    partition.innerPosition,
    ACCOUNT_EXPORT_MAX_PAGE_RECORDS,
  );
  const files = window.slice(0, ACCOUNT_EXPORT_MAX_PAGE_RECORDS);
  const media = await mapInChunks(files, 10, async (file) => {
    const metadata = await file.getMetadata()
      .then(([value]) => value)
      .catch((error) => {
        logger.warn("managed_account_export_media_metadata_unavailable", {
          objectRef: safeResourceRef(file.name),
          errorClass: classifyServerError(error),
        });
        return undefined;
      });
    return {
      path: file.name,
      contentType: metadata?.contentType,
      size: metadata?.size,
      updated: metadata?.updated,
      ...(!metadata ? { metadataUnavailable: true } : {}),
    };
  });
  const galleryComplete = window.length <= ACCOUNT_EXPORT_MAX_PAGE_RECORDS;
  const finalGallery = galleryComplete
    ? !(await accountExportHasLaterOwnedGallery(uid, partition.gallery.id))
    : false;
  const nextPosition = galleryComplete
    ? ACCOUNT_EXPORT_PARTITION_COMPLETE
    : files.at(-1)!.name;
  return {
    section,
    records: [{
      after: [partition.gallery.id, nextPosition],
      value: safeAccountExportSourceRecord(
        () => ownedSpaceMediaBatch(partition.gallery!.id, media),
        () => logger.warn("managed_account_export_media_page_unavailable", {
          galleryRef: safeResourceRef(partition.gallery!.id),
        }),
      ),
    }],
    exhausted: galleryComplete && finalGallery,
  };
}

async function accountExportCreatorId(uid: string) {
  const value = (await db.collection("creatorAccountOwners").doc(uid).get()).data()?.creatorId;
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : undefined;
}

async function accountExportQueryCount(query: Query) {
  return (await query.count().get()).data().count;
}

function accountExportDocumentValue(snapshot: QueryDocumentSnapshot) {
  return { ...snapshot.data(), id: snapshot.id };
}

async function accountExportOperationalState(uid: string) {
  const creatorId = await accountExportCreatorId(uid);
  const actionRateReferences = [
    db.collection("creatorActionRateLimits").doc(creatorActionRateId(uid, "report")),
    ...(creatorId ? (["comment", "follow", "reaction"] as const).map((kind) =>
      db.collection("creatorActionRateLimits").doc(creatorActionRateId(creatorId, kind))) : []),
  ];
  const [publicationPermits, ownedRevisionPermits, uploadedRevisionPermits, unsubscribeRecords,
    verificationRateLimit, actionRateLimits] = await Promise.all([
    accountExportQueryCount(db.collection("galleryPublishPermits").where("ownerId", "==", uid)),
    accountExportQueryCount(db.collection("galleryRevisionPermits").where("ownerId", "==", uid)),
    accountExportQueryCount(db.collection("galleryRevisionPermits").where("uploaderId", "==", uid)),
    accountExportQueryCount(db.collection("newsletterUnsubscribeTokens").where("uid", "==", uid)),
    db.collection("verificationMailRateLimits").doc(uid).get(),
    db.getAll(...actionRateReferences),
  ]);
  return {
    pendingPublicationPermits: publicationPermits,
    pendingOwnedRevisionPermits: ownedRevisionPermits,
    pendingUploadedRevisionPermits: uploadedRevisionPermits,
    newsletterUnsubscribeRecords: unsubscribeRecords,
    verificationRateLimitRecord: verificationRateLimit.exists,
    creatorActionRateLimitRecords: actionRateLimits.filter((snapshot) => snapshot.exists).length,
  };
}

async function accountExportPage(
  uid: string,
  exportJobId: string,
  section: AccountExportSection,
  position: string[] | undefined,
): Promise<AccountExportPage> {
  if (section === "account") {
    const user = await getAuth().getUser(uid);
    return accountExportSingletonPage(section, position, `auth/${uid}`, {
      uid,
      email: user.email ?? null,
      emailVerified: user.emailVerified,
      displayName: user.displayName ?? null,
      disabled: user.disabled,
      providers: user.providerData.map((provider) => provider.providerId),
      createdAt: user.metadata.creationTime ?? null,
      lastSignInAt: user.metadata.lastSignInTime ?? null,
    }, true);
  }
  if (section === "profile" || section === "newsletter" || section === "publicationUsage") {
    const collection = section === "profile"
      ? "profiles"
      : section === "newsletter" ? "newsletterSubscriptions" : "galleryPublicationQuotas";
    const snapshot = await db.collection(collection).doc(uid).get();
    return accountExportSingletonPage(section, position, snapshot.ref.path, snapshot.data(), snapshot.exists);
  }
  if (section === "ownedSpaceManifests")
    return accountExportFirestorePage(section, db.collection("galleries").where("ownerId", "==", uid), position,
      accountExportDocumentValue);
  if (section === "ownedSpaceMembers") return accountExportOwnedMembersPage(uid, section, position);
  if (section === "ownedSpaceMedia") return accountExportOwnedMediaPage(uid, section, position);
  if (section === "sharedSpaces" || section === "receivedInvitations") {
    const email = (await getAuth().getUser(uid)).email?.trim().toLowerCase();
    if (!email) return accountExportSingletonPage(section, position, `${section}/${uid}`, null, false);
    if (section === "sharedSpaces") {
      return accountExportFirestorePage(section, db.collectionGroup("members").where("email", "==", email), position,
        (member) => {
          const gallery = member.ref.parent.parent;
          if (!gallery) throw new Error("export-page-invalid");
          return sharedSpaceMembership(gallery.id, member.data());
        });
    }
    return accountExportFirestorePage(section, db.collection("galleryInvites").where("email", "==", email), position,
      (invite) => accountInvitation(exportJobId, invite.id, invite.data(), "received"));
  }
  if (section === "sentInvitations")
    return accountExportFirestorePage(section, db.collection("galleryInvites").where("ownerId", "==", uid), position,
      (invite) => accountInvitation(exportJobId, invite.id, invite.data(), "sent"));
  if (section === "submittedModerationReports")
    return accountExportFirestorePage(section,
      db.collection("creatorReports").where("reporterAccountId", "==", uid), position,
      (report) => accountExportCreatorReport(exportJobId, report.id, report.data()));
  if (section === "operationalState")
    return accountExportSingletonPage(section, position, `operational/${uid}`,
      await accountExportOperationalState(uid), true);

  const creatorId = await accountExportCreatorId(uid);
  if (!creatorId) return accountExportSingletonPage(section, position, `${section}/${uid}`, null, false);
  if (section === "creatorPublicProfile") {
    const [profile, account] = await Promise.all([
      db.collection("creatorProfiles").doc(creatorId).get(),
      db.collection("creatorAccounts").doc(creatorId).get(),
    ]);
    return accountExportSingletonPage(section, position, profile.ref.path, {
      publicProfile: profile.data(),
      currentHandle: account.data()?.currentHandle ?? null,
    }, profile.exists);
  }
  if (section === "creatorAliases")
    return accountExportFirestorePage(section, db.collection("creatorHandles").where("creatorId", "==", creatorId), position,
      (handle) => ({
        handle: handle.id,
        canonicalHandle: handle.data().canonicalHandle,
        kind: handle.data().kind,
        updatedAt: handle.data().updatedAt,
      }));
  if (section === "creatorPosts")
    return accountExportFirestorePage(section,
      db.collection("creatorAccounts").doc(creatorId).collection("posts"), position, accountExportDocumentValue);
  if (section === "creatorFollowing")
    return accountExportFirestorePage(section,
      db.collection("creatorFollows").where("followerCreatorId", "==", creatorId), position,
      (follow) => accountExportCreatorRelationship(
        exportJobId,
        follow.data().followedCreatorId,
        follow.data(),
      ));
  if (section === "creatorFollowers") {
    const count = await accountExportQueryCount(
      db.collection("creatorFollows").where("followedCreatorId", "==", creatorId),
    );
    return accountExportSingletonPage(section, position, `creatorFollowers/${creatorId}`, { count }, true);
  }
  if (section === "creatorBlocks")
    return accountExportFirestorePage(section,
      db.collection("creatorBlocks").where("blockerCreatorId", "==", creatorId), position,
      (block) => accountExportCreatorRelationship(
        exportJobId,
        block.data().blockedCreatorId,
        block.data(),
      ));
  if (section === "creatorReports")
    return accountExportFirestorePage(section,
      db.collection("creatorReports").where("reporterCreatorId", "==", creatorId), position,
      (report) => accountExportCreatorReport(exportJobId, report.id, report.data()));
  if (section === "creatorComments")
    return accountExportFirestorePage(section,
      db.collectionGroup("comments").where("authorCreatorId", "==", creatorId), position,
      (comment) => {
        const post = comment.ref.parent.parent;
        return accountExportCreatorComment(
          exportJobId,
          post?.parent.parent?.id,
          post?.id,
          comment.data(),
        );
      });
  if (section === "creatorReactions")
    return accountExportFirestorePage(section,
      db.collectionGroup("reactions").where("creatorId", "==", creatorId), position,
      (reaction) => {
        const post = reaction.ref.parent.parent;
        return accountExportCreatorReaction(
          exportJobId,
          post?.parent.parent?.id,
          post?.id,
          reaction.data(),
        );
      });
  if (section === "creatorNotifications")
    return accountExportFirestorePage(section,
      db.collection("creatorNotifications").doc(creatorId).collection("items"), position,
      (notification) => accountExportCreatorNotification(
        exportJobId,
        notification.id,
        notification.data(),
      ));
  throw new Error("export-page-invalid");
}

function immediateAccountExportRetired(): boolean {
  return true;
}

/** Retired compatibility alias. All product clients use the bounded managed
 * export below; keep the deployed name fail-closed during migration. */
export const exportAuraAccountData = onCall(
  {
    region: REGION,
    timeoutSeconds: 120,
    memory: "512MiB",
    concurrency: 1,
    maxInstances: 1,
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = requireAccount(request.auth);
    if (immediateAccountExportRetired()) {
      throw new HttpsError(
        "failed-precondition",
        "The immediate account export is retired. Use the managed account export.",
      );
    }
    const immediateExportScope = randomBytes(18).toString("base64url");
    const user = await getAuth().getUser(uid);
    const email = user.email?.trim().toLowerCase();
    const owned = await accountQueryDocuments(db.collection("galleries").where("ownerId", "==", uid));
    const [profile, newsletter, publicationUsage, sharedMemberships, receivedInvites, sentInvites,
      permits, ownedRevisionPermits, uploadedRevisionPermits, unsubscribeTokens, verificationLimit,
      creatorOwner, submittedReports] = await Promise.all([
      db.collection("profiles").doc(uid).get(),
      db.collection("newsletterSubscriptions").doc(uid).get(),
      db.collection("galleryPublicationQuotas").doc(uid).get(),
      email
        ? accountQueryDocuments(db.collectionGroup("members").where("email", "==", email))
        : Promise.resolve([]),
      email
        ? accountQueryDocuments(db.collection("galleryInvites").where("email", "==", email))
        : Promise.resolve([]),
      accountQueryDocuments(db.collection("galleryInvites").where("ownerId", "==", uid)),
      accountQueryDocuments(db.collection("galleryPublishPermits").where("ownerId", "==", uid)),
      accountQueryDocuments(db.collection("galleryRevisionPermits").where("ownerId", "==", uid)),
      accountQueryDocuments(db.collection("galleryRevisionPermits").where("uploaderId", "==", uid)),
      accountQueryDocuments(db.collection("newsletterUnsubscribeTokens").where("uid", "==", uid)),
      db.collection("verificationMailRateLimits").doc(uid).get(),
      db.collection("creatorAccountOwners").doc(uid).get(),
      accountQueryDocuments(db.collection("creatorReports").where("reporterAccountId", "==", uid)),
    ]);
    const creatorId = creatorOwner.data()?.creatorId;
    const actionRateReferences = [
      db.collection("creatorActionRateLimits").doc(creatorActionRateId(uid, "report")),
      ...(typeof creatorId === "string"
        ? (["comment", "follow", "reaction"] as const).map((kind) =>
            db.collection("creatorActionRateLimits").doc(creatorActionRateId(creatorId, kind)))
        : []),
    ];
    const actionRateLimits = await db.getAll(...actionRateReferences);
    const [creatorProfile, creatorAccount, creatorHandles, creatorPosts, creatorFollowing, creatorFollowers,
      creatorBlocks, creatorReports, creatorComments, creatorReactions, creatorNotifications] = typeof creatorId === "string"
      ? await Promise.all([
          db.collection("creatorProfiles").doc(creatorId).get(),
          db.collection("creatorAccounts").doc(creatorId).get(),
          accountQueryDocuments(db.collection("creatorHandles").where("creatorId", "==", creatorId)),
          accountQueryDocuments(db.collection("creatorAccounts").doc(creatorId).collection("posts").orderBy("createdAt", "asc")),
          accountQueryDocuments(db.collection("creatorFollows").where("followerCreatorId", "==", creatorId)),
          accountQueryDocuments(db.collection("creatorFollows").where("followedCreatorId", "==", creatorId)),
          accountQueryDocuments(db.collection("creatorBlocks").where("blockerCreatorId", "==", creatorId)),
          accountQueryDocuments(db.collection("creatorReports").where("reporterCreatorId", "==", creatorId)),
          accountQueryDocuments(db.collectionGroup("comments").where("authorCreatorId", "==", creatorId)),
          accountQueryDocuments(db.collectionGroup("reactions").where("creatorId", "==", creatorId)),
          accountQueryDocuments(db.collection("creatorNotifications").doc(creatorId).collection("items").orderBy("createdAt", "asc")),
        ])
      : [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined];
    const ownedSpaces = await mapInChunks(owned, 5, async (gallery) => {
      const [members, media] = await Promise.all([
        accountQueryDocuments(gallery.ref.collection("members")),
        accountMediaFootprint(uid, gallery.id),
      ]);
      return {
        id: gallery.id,
        manifest: gallery.data(),
        members: ownedSpaceMemberBatch(
          gallery.id,
          members.map((member) => member.data()),
        ).members,
        media,
      };
    });
    const creatorActivity = typeof creatorId === "string" ? accountExportCreatorActivity(
      immediateExportScope,
      {
        following: creatorFollowing?.map((follow) => ({
          relatedCreatorId: follow.data().followedCreatorId,
          data: follow.data(),
        })) ?? [],
        blocks: creatorBlocks?.map((block) => ({
          relatedCreatorId: block.data().blockedCreatorId,
          data: block.data(),
        })) ?? [],
        reports: creatorReports?.map((report) => ({ id: report.id, data: report.data() })) ?? [],
        comments: creatorComments?.map((comment) => {
          const post = comment.ref.parent.parent;
          return {
            targetCreatorId: post?.parent.parent?.id,
            postId: post?.id,
            data: comment.data(),
          };
        }) ?? [],
        reactions: creatorReactions?.map((reaction) => {
          const post = reaction.ref.parent.parent;
          return {
            targetCreatorId: post?.parent.parent?.id,
            postId: post?.id,
            data: reaction.data(),
          };
        }) ?? [],
        notifications: creatorNotifications?.map((notification) => ({
          id: notification.id,
          data: notification.data(),
        })) ?? [],
      },
    ) : undefined;
    const accountExport = buildAccountExport({
      generatedAt: new Date().toISOString(),
      account: {
        uid,
        email: user.email ?? null,
        emailVerified: user.emailVerified,
        displayName: user.displayName ?? null,
        disabled: user.disabled,
        providers: user.providerData.map((provider) => provider.providerId),
        createdAt: user.metadata.creationTime ?? null,
        lastSignInAt: user.metadata.lastSignInTime ?? null,
      },
      ...(profile.exists ? { profile: profile.data()! } : {}),
      ...(newsletter.exists ? { newsletter: newsletter.data()! } : {}),
      ...(publicationUsage.exists ? { publicationUsage: publicationUsage.data()! } : {}),
      ownedSpaces,
      sharedSpaces: sharedMemberships
        .filter((member) => Boolean(member.ref.parent.parent))
        .map((member) => sharedSpaceMembership(member.ref.parent.parent!.id, member.data())),
      receivedInvitations: receivedInvites.map((invite) =>
        accountInvitation(immediateExportScope, invite.id, invite.data(), "received")),
      sentInvitations: sentInvites.map((invite) =>
        accountInvitation(immediateExportScope, invite.id, invite.data(), "sent")),
      submittedModerationReports: submittedReports.map((report) =>
        accountExportCreatorReport(immediateExportScope, report.id, report.data())),
      operationalState: {
        pendingPublicationPermits: permits.length,
        pendingRevisionPermits: new Set([
          ...ownedRevisionPermits.map((item) => item.ref.path),
          ...uploadedRevisionPermits.map((item) => item.ref.path),
        ]).size,
        newsletterUnsubscribeRecords: unsubscribeTokens.length,
        verificationRateLimitRecord: verificationLimit.exists,
        creatorActionRateLimitRecords: actionRateLimits.filter((item) => item.exists).length,
      },
      ...(creatorProfile?.exists ? { creatorIdentity: {
        publicProfile: creatorProfile.data(),
        currentHandle: creatorAccount?.data()?.currentHandle ?? null,
        aliases: creatorHandles
          .filter((handle) => handle.data().kind === "alias")
          .map((handle) => handle.id) ?? [],
        posts: creatorPosts?.map((post) => ({ id: post.id, ...post.data() })) ?? [],
        following: creatorActivity?.following ?? [],
        followerCount: creatorFollowers?.length ?? 0,
        blocks: creatorActivity?.blocks ?? [],
        reports: creatorActivity?.reports ?? [],
        comments: creatorActivity?.comments ?? [],
        reactions: creatorActivity?.reactions ?? [],
        notifications: creatorActivity?.notifications ?? [],
      } } : {}),
    });
    try {
      return assertImmediateAccountExportSize(accountExport);
    } catch (error) {
      if (error instanceof Error && error.message === "export-size-limit-exceeded")
        throw new HttpsError("resource-exhausted", "This immediate export is too large. Use the managed export.");
      throw error;
    }
  },
);

function accountExportStateForRequest(
  value: unknown,
  uid: string,
  jobId: string,
  nowEpochSeconds: number,
) {
  const state = assertAccountExportJobState(value);
  if (state.jobId !== jobId) throw new Error("export-access-denied");
  return assertAccountExportJobOwner(state, uid, nowEpochSeconds);
}

async function startManagedAccountExport(uid: string, requestId: string, nowEpochSeconds: number) {
  const reference = accountExportJobReference(uid);
  const proposed = createAccountExportJob({
    uid,
    jobId: randomBytes(18).toString("base64url"),
    nowEpochSeconds,
    lifetimeSeconds: ACCOUNT_EXPORT_LIFETIME_SECONDS,
  });
  const state = await db.runTransaction(async (transaction) => {
    await assertAccountMutationAllowedInTransaction(transaction, uid);
    const snapshot = await transaction.get(reference);
    if (snapshot.exists) {
      const current = reusableAccountExportJob(
        snapshot.data()?.state,
        snapshot.data()?.requestId,
        requestId,
        uid,
        nowEpochSeconds,
      );
      if (current) return current;
    }
    transaction.set(reference, {
      ownerId: uid,
      requestId,
      state: proposed,
      status: proposed.status,
      expiresAt: Timestamp.fromMillis(proposed.expiresAtEpochSeconds * 1_000),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      schemaVersion: 1,
    });
    return proposed;
  }, { maxAttempts: 3 });
  return accountExportPublicStatus(state, uid, nowEpochSeconds);
}

async function loadManagedAccountExport(uid: string, jobId: string, nowEpochSeconds: number) {
  const reference = accountExportJobReference(uid);
  const snapshot = await reference.get();
  if (!snapshot.exists) throw new Error("export-access-denied");
  return accountExportStateForRequest(snapshot.data()?.state, uid, jobId, nowEpochSeconds);
}

function accountExportBackoff(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function acquireManagedAccountExportLease(uid: string, jobId: string) {
  const reference = accountExportJobReference(uid);
  const leaseId = randomBytes(16).toString("hex");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const nowMilliseconds = Date.now();
    const outcome = await db.runTransaction(async (transaction) => {
      await assertAccountMutationAllowedInTransaction(transaction, uid);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new Error("export-access-denied");
      const state = accountExportStateForRequest(
        snapshot.data()?.state,
        uid,
        jobId,
        Math.floor(nowMilliseconds / 1_000),
      );
      if (state.status === "complete") return { state };
      const claim = claimAccountExportLease({
        current: snapshot.data()?.lease,
        id: leaseId,
        jobId,
        revision: state.revision,
        nowEpochMilliseconds: nowMilliseconds,
      });
      if (!claim.acquired) return { state, retryAfterMilliseconds: claim.retryAfterMilliseconds };
      transaction.update(reference, {
        lease: claim.lease,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { state, lease: claim.lease };
    }, { maxAttempts: 3 });
    if (outcome.lease || outcome.state.status === "complete") return outcome;
    if (attempt < 2)
      await accountExportBackoff(Math.min(outcome.retryAfterMilliseconds ?? 100, 100 * (2 ** attempt)));
  }
  throw new Error("export-lease-busy");
}

async function releaseManagedAccountExportLease(uid: string, lease: AccountExportLease) {
  const reference = accountExportJobReference(uid);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (snapshot.exists && ownsAccountExportLease(snapshot.data()?.lease, lease))
      transaction.update(reference, { lease: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
  }, { maxAttempts: 3 }).catch(() => undefined);
}

async function continueManagedAccountExportOnce(uid: string, jobId: string) {
  const jobReference = accountExportJobReference(uid);
  for (let planningAttempt = 0; planningAttempt < 3; planningAttempt += 1) {
    const acquired = await acquireManagedAccountExportLease(uid, jobId);
    const state = acquired.state;
    if (state.status === "complete") return state;
    const lease = acquired.lease;
    if (!lease) throw new Error("export-lease-busy");
    const section = currentAccountExportSection(state);
    if (!section) {
      await releaseManagedAccountExportLease(uid, lease);
      return state;
    }
    try {
      const stepNowEpochSeconds = Math.floor(Date.now() / 1_000);
      const position = accountExportResumePosition(state, stepNowEpochSeconds);
      const page = await accountExportPage(uid, state.jobId, section, position);
      const step = prepareAccountExportStep({ state, page, nowEpochSeconds: stepNowEpochSeconds });
      return await db.runTransaction(async (transaction) => {
        await assertAccountMutationAllowedInTransaction(transaction, uid);
        const currentSnapshot = await transaction.get(jobReference);
        if (!currentSnapshot.exists) throw new Error("export-state-conflict");
        const current = accountExportStateForRequest(
          currentSnapshot.data()?.state,
          uid,
          jobId,
          Math.floor(Date.now() / 1_000),
        );
        if (!ownsAccountExportLease(currentSnapshot.data()?.lease, lease) ||
          lease.expiresAtEpochMilliseconds <= Date.now())
          throw new Error("export-state-conflict");
        const disposition = classifyAccountExportStep(current, step);
        if (disposition === "conflict") throw new Error("export-state-conflict");
        if (disposition === "applied") return current;
        if (step.chunk) {
          transaction.create(accountExportChunkReference(uid, state, step.chunk.id), {
            chunk: step.chunk,
            expiresAt: Timestamp.fromMillis(step.chunk.expiresAtEpochSeconds * 1_000),
            schemaVersion: 1,
          });
        }
        transaction.update(jobReference, {
          state: step.nextState,
          status: step.nextState.status,
          lease: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
          errorCode: FieldValue.delete(),
        });
        return step.nextState;
      }, { maxAttempts: 3 });
    } catch (error) {
      if (error instanceof Error && error.message === "export-state-conflict") continue;
      throw error;
    } finally {
      await releaseManagedAccountExportLease(uid, lease);
    }
  }
  throw new Error("export-state-conflict");
}

function managedAccountExportError(error: unknown): HttpsError {
  const message = error instanceof Error ? error.message : "";
  if (message === "export-job-id-invalid")
    return new HttpsError("invalid-argument", "Choose a valid account export job.");
  if (message === "export-access-denied")
    return new HttpsError("not-found", "Account export job not found.");
  if (message === "export-expired")
    return new HttpsError("failed-precondition", "This account export expired. Start a new export.");
  if (message === "export-state-conflict")
    return new HttpsError("aborted", "The account export advanced in another request. Retry safely.");
  if (message === "export-lease-busy")
    return new HttpsError("aborted", "The account export is already advancing. Retry shortly.");
  if (["export-byte-limit-exceeded", "export-chunk-limit-exceeded", "export-record-limit-exceeded",
    "export-record-too-large"].includes(message))
    return new HttpsError("resource-exhausted", "This account export exceeds the managed export limit. Contact support.");
  if (message === "export-part-invalid")
    return new HttpsError("data-loss", "An account export part failed integrity validation.");
  return new HttpsError("internal", "The account export is incomplete. Retry safely.");
}

/** Resumable account export control plane. Cursor, query position, and chunks
 * remain in a client-denied Firestore tree; callers receive status or one part. */
export const manageAuraAccountExport = onCall(
  {
    region: REGION,
    timeoutSeconds: ACCOUNT_EXPORT_CALLABLE_TIMEOUT_SECONDS,
    memory: "512MiB",
    concurrency: 4,
    maxInstances: 10,
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = requireAccount(request.auth);
    const action = request.data?.action;
    if (!(["start", "continue", "status", "part"] as unknown[]).includes(action))
      throw new HttpsError("invalid-argument", "Choose a valid account export action.");
    if (action === "start" || action === "continue") await assertAccountMutationAllowed(uid);
    const nowEpochSeconds = Math.floor(Date.now() / 1_000);
    try {
      if (action === "start") {
        const requestId = parseAccountExportJobId(request.data?.requestId);
        return await startManagedAccountExport(uid, requestId, nowEpochSeconds);
      }
      const jobId = parseAccountExportJobId(request.data?.jobId);
      if (action === "status") {
        const state = await loadManagedAccountExport(uid, jobId, nowEpochSeconds);
        return accountExportPublicStatus(state, uid, nowEpochSeconds);
      }
      if (action === "part") {
        const state = await loadManagedAccountExport(uid, jobId, nowEpochSeconds);
        const partId = accountExportPartIdForOwner(
          state,
          uid,
          request.data?.sequence,
          nowEpochSeconds,
        );
        const snapshot = await accountExportChunkReference(uid, state, partId).get();
        if (!snapshot.exists) throw new Error("export-part-invalid");
        const chunk = assertAccountExportChunk(snapshot.data()?.chunk, state);
        return {
          format: "aura-account-export-part-response" as const,
          schemaVersion: 1 as const,
          jobId: state.jobId,
          sequence: chunk.sequence,
          body: chunk.body,
          sha256: chunk.sha256,
        };
      }
      let state: AccountExportJobState | undefined;
      for (let step = 0; step < ACCOUNT_EXPORT_STEPS_PER_CALL; step += 1) {
        state = await continueManagedAccountExportOnce(uid, jobId);
        if (state.status === "complete") break;
      }
      if (!state) throw new Error("export-state-conflict");
      return accountExportPublicStatus(state, uid, nowEpochSeconds);
    } catch (error) {
      const jobId = typeof request.data?.jobId === "string" ? request.data.jobId : undefined;
      logger.warn("managed_account_export_failed", {
        jobId: jobId ? safeResourceRef(jobId) : undefined,
        errorCode: accountExportFailureCode(error),
      });
      throw managedAccountExportError(error);
    }
  },
);

function accountDeletionErrorCode(error: unknown) {
  if (typeof error === "object" && error && "code" in error)
    return String(error.code).slice(0, 80);
  return "internal";
}

const ACCOUNT_DELETION_STEPS_PER_CALL = 4;
const ACCOUNT_DELETION_STORAGE_PAGE_SIZE = 100;
async function loadAccountDeletionState(uid: string) {
  const snapshot = await accountDeletionJobReference(uid).get();
  return snapshot.exists ? assertAccountDeletionJobState(snapshot.data(), uid) : undefined;
}

async function advanceAccountDeletionPhase(state: AccountDeletionJobState) {
  await accountDeletionJobReference(state.uid).update({
    phase: nextAccountDeletionPhase(state.phase),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function incrementAccountDeletionCount(uid: string, name: string, amount: number) {
  if (!amount) return;
  await accountDeletionJobReference(uid).update({
    [`counts.${name}`]: FieldValue.increment(amount),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function deleteAccountQueryPage(
  state: AccountDeletionJobState,
  query: Query,
  countName: string,
  pageSize = ACCOUNT_DELETION_PAGE_SIZE,
) {
  const result = await drainAccountDeletionPage({
    fetchPage: async (limit) => (await query.limit(limit).get()).docs,
    remove: async (documents) => {
      const batch = db.batch();
      documents.forEach((document) => batch.delete(document.ref));
      await batch.commit();
    },
    limit: pageSize,
  });
  if (result.complete) await advanceAccountDeletionPhase(state);
  else await incrementAccountDeletionCount(state.uid, countName, result.deleted);
}

async function deleteAccountStoragePage(prefix: string) {
  const [files] = await getStorage().bucket().getFiles({
    prefix,
    autoPaginate: false,
    maxResults: ACCOUNT_DELETION_STORAGE_PAGE_SIZE,
  });
  if (!files.length) return true;
  await mapInChunks(files, 10, async (file) => file.delete({ ignoreNotFound: true }));
  return false;
}

function validAccountDeletionSegment(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

async function claimAccountDeletionPermit(
  state: AccountDeletionJobState,
  query: Query,
  kind: "initial" | "revision",
) {
  const candidate = (await query.limit(1).get()).docs[0];
  if (!candidate) {
    await advanceAccountDeletionPhase(state);
    return;
  }
  await db.runTransaction(async (transaction) => {
    const [latestJob, latestPermit] = await Promise.all([
      transaction.get(accountDeletionJobReference(state.uid)),
      transaction.get(candidate.ref),
    ]);
    const current = assertAccountDeletionJobState(latestJob.data(), state.uid);
    if (current.deletionId !== state.deletionId || current.phase !== state.phase || current.currentPermitPath)
      return;
    const data = latestPermit.data();
    const matches = kind === "initial"
      ? data?.ownerId === state.uid
      : (state.phase === "owned-revision-permits"
          ? data?.ownerId === state.uid
          : data?.uploaderId === state.uid);
    if (!latestPermit.exists || !matches) return;
    const assetUploadId = data?.assetUploadId;
    if (typeof assetUploadId === "string" &&
      ownsGalleryAssetUploadLease(data, assetUploadId, Date.now())) return;
    const ownerId = data?.ownerId;
    const galleryId = data?.galleryId;
    const revisionId = data?.revisionId;
    if (!validAccountDeletionSegment(ownerId) || !validAccountDeletionSegment(galleryId) ||
      (kind === "revision" && !validAccountDeletionSegment(revisionId))) {
      transaction.delete(candidate.ref);
      return;
    }
    if (data?.status === "account-deletion" && data?.accountDeletionId !== state.deletionId)
      throw new Error("deletion-permit-claimed-by-another-job");
    const prefix = kind === "initial"
      ? `published/${ownerId}/${galleryId}/`
      : `published/${ownerId}/${galleryId}/revisions/${revisionId}/`;
    const associatedGallery = ownerId === state.uid
      ? await transaction.get(db.collection("galleries").doc(galleryId))
      : undefined;
    if (associatedGallery?.data()?.ownerId === state.uid) transaction.set(associatedGallery.ref, {
      accountDeletionId: state.deletionId,
      lifecycleStatus: "purging",
      cleanupReason: "account-deletion",
      cleanupClaimedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(candidate.ref, {
      status: "account-deletion",
      accountDeletionId: state.deletionId,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.update(accountDeletionJobReference(state.uid), {
      currentPermitPath: candidate.ref.path,
      currentPermitPrefix: prefix,
      currentPermitOwnerId: ownerId,
      currentPermitExternalOwner: ownerId !== state.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function processClaimedAccountDeletionPermit(state: AccountDeletionJobState) {
  if (!state.currentPermitPath || !state.currentPermitPrefix || !state.currentPermitOwnerId) return;
  const permitReference = db.doc(state.currentPermitPath);
  const permit = await permitReference.get();
  if (!permit.exists || permit.data()?.accountDeletionId !== state.deletionId || permit.data()?.status !== "account-deletion") {
    await accountDeletionJobReference(state.uid).update({
      currentPermitPath: FieldValue.delete(),
      currentPermitPrefix: FieldValue.delete(),
      currentPermitOwnerId: FieldValue.delete(),
      currentPermitExternalOwner: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return;
  }
  const authority = accountDeletionPermitAuthority(state, permitReference.path, permit.data()!);
  if (authority.externalOwner) {
    const gallery = await db.collection("galleries").doc(authority.galleryId).get();
    if (gallery.exists && gallery.data()?.ownerId === authority.ownerId &&
      galleryManifestReferencesPrefix(gallery.data(), authority.prefix)) {
      await db.runTransaction(async (transaction) => {
        const [latestJob, latestPermit, latestGallery] = await Promise.all([
          transaction.get(accountDeletionJobReference(state.uid)),
          transaction.get(permitReference),
          transaction.get(gallery.ref),
        ]);
        const latestState = assertAccountDeletionJobState(latestJob.data(), state.uid);
        if (latestState.deletionId !== state.deletionId ||
          latestPermit.data()?.accountDeletionId !== state.deletionId ||
          latestPermit.data()?.status !== "account-deletion") return;
        const latestAuthority = accountDeletionPermitAuthority(
          latestState,
          permitReference.path,
          latestPermit.data()!,
        );
        if (latestGallery.data()?.ownerId === latestAuthority.ownerId &&
          galleryManifestReferencesPrefix(latestGallery.data(), latestAuthority.prefix)) {
          transaction.delete(permitReference);
          transaction.update(accountDeletionJobReference(state.uid), {
            currentPermitPath: FieldValue.delete(),
            currentPermitPrefix: FieldValue.delete(),
            currentPermitOwnerId: FieldValue.delete(),
            currentPermitExternalOwner: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      });
      return;
    }
  }
  if (!(await deleteAccountStoragePage(authority.prefix))) return;
  await db.runTransaction(async (transaction) => {
    const [latestJob, latestPermit] = await Promise.all([
      transaction.get(accountDeletionJobReference(state.uid)),
      transaction.get(permitReference),
    ]);
    const latestState = assertAccountDeletionJobState(latestJob.data(), state.uid);
    if (latestState.deletionId !== state.deletionId ||
      latestPermit.data()?.accountDeletionId !== state.deletionId ||
      latestPermit.data()?.status !== "account-deletion") return;
    accountDeletionPermitAuthority(latestState, permitReference.path, latestPermit.data()!);
    transaction.delete(permitReference);
    transaction.update(accountDeletionJobReference(state.uid), {
      currentPermitPath: FieldValue.delete(),
      currentPermitPrefix: FieldValue.delete(),
      currentPermitOwnerId: FieldValue.delete(),
      currentPermitExternalOwner: FieldValue.delete(),
      [`counts.${state.phase}`]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function processAccountDeletionPermits(state: AccountDeletionJobState) {
  if (state.currentPermitPath) return processClaimedAccountDeletionPermit(state);
  if (state.phase === "publication-permits")
    return claimAccountDeletionPermit(state,
      db.collection("galleryPublishPermits").where("ownerId", "==", state.uid), "initial");
  if (state.phase === "owned-revision-permits")
    return claimAccountDeletionPermit(state,
      db.collection("galleryRevisionPermits").where("ownerId", "==", state.uid), "revision");
  return claimAccountDeletionPermit(state,
    db.collection("galleryRevisionPermits").where("uploaderId", "==", state.uid), "revision");
}

async function processAccountAssetRetirement(state: AccountDeletionJobState) {
  const candidate = (await db.collection("galleryAssetRetirements")
    .where("ownerId", "==", state.uid).limit(1).get()).docs[0];
  if (!candidate) return advanceAccountDeletionPhase(state);
  const claimed = await db.runTransaction(async (transaction) => {
    const [job, retirement] = await Promise.all([
      transaction.get(accountDeletionJobReference(state.uid)),
      transaction.get(candidate.ref),
    ]);
    if (job.data()?.deletionId !== state.deletionId || retirement.data()?.ownerId !== state.uid)
      return undefined;
    if (retirement.data()?.status === "account-deletion" &&
      retirement.data()?.accountDeletionId !== state.deletionId)
      throw new Error("deletion-retirement-claimed-by-another-job");
    transaction.set(candidate.ref, {
      status: "account-deletion",
      accountDeletionId: state.deletionId,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return retirement.data();
  });
  if (!claimed) return;
  const ownerId = claimed.ownerId;
  const galleryId = claimed.galleryId;
  const rawPaths = claimed.paths;
  const validEnvelope = validAccountDeletionSegment(ownerId) && ownerId === state.uid &&
    validAccountDeletionSegment(galleryId) && Array.isArray(rawPaths) && rawPaths.length <= 30;
  const paths = validEnvelope ? galleryManifestStoragePaths({
    artworks: rawPaths.map((storagePath) => ({ storagePath })),
  }, ownerId, galleryId) : [];
  if (!validEnvelope || paths.length !== rawPaths.length) {
    logger.error("account_deletion_retirement_invalid", {
      accountRef: safeResourceRef(state.uid),
      retirementRef: safeResourceRef(candidate.id),
    });
    await db.runTransaction(async (transaction) => {
      const [job, retirement] = await Promise.all([
        transaction.get(accountDeletionJobReference(state.uid)),
        transaction.get(candidate.ref),
      ]);
      if (job.data()?.deletionId !== state.deletionId ||
        retirement.data()?.accountDeletionId !== state.deletionId) return;
      transaction.delete(candidate.ref);
      transaction.update(accountDeletionJobReference(state.uid), {
        "counts.invalidAssetRetirementsDiscarded": FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return;
  }
  await mapInChunks(paths, 5, async (path) =>
    getStorage().bucket().file(path).delete({ ignoreNotFound: true }));
  await db.runTransaction(async (transaction) => {
    const [job, retirement] = await Promise.all([
      transaction.get(accountDeletionJobReference(state.uid)),
      transaction.get(candidate.ref),
    ]);
    if (job.data()?.deletionId !== state.deletionId) return;
    if (retirement.data()?.accountDeletionId === state.deletionId) transaction.delete(candidate.ref);
    transaction.update(accountDeletionJobReference(state.uid), {
      "counts.assetRetirementsRemoved": FieldValue.increment(retirement.exists ? 1 : 0),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function claimedGallerySnapshot(state: AccountDeletionJobState) {
  if (!state.currentGalleryId) return undefined;
  const snapshot = await db.collection("galleries").doc(state.currentGalleryId).get();
  if (snapshot.data()?.ownerId !== state.uid || snapshot.data()?.accountDeletionId !== state.deletionId) {
    await accountDeletionJobReference(state.uid).update({
      currentGalleryId: FieldValue.delete(),
      currentGalleryStage: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return undefined;
  }
  return snapshot;
}

async function drainClaimedGalleryQuery(
  state: AccountDeletionJobState,
  galleryReference: DocumentReference,
  query: Query,
  pageSize = ACCOUNT_DELETION_PAGE_SIZE,
) {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > ACCOUNT_DELETION_PAGE_SIZE)
    throw new Error("deletion-gallery-page-size-invalid");
  return db.runTransaction(async (transaction) => {
    const [job, gallery, page] = await Promise.all([
      transaction.get(accountDeletionJobReference(state.uid)),
      transaction.get(galleryReference),
      transaction.get(query.limit(pageSize)),
    ]);
    if (job.data()?.deletionId !== state.deletionId ||
      gallery.data()?.ownerId !== state.uid || gallery.data()?.accountDeletionId !== state.deletionId)
      return { valid: false, deleted: 0 };
    page.docs.forEach((document) => transaction.delete(document.ref));
    return { valid: true, deleted: page.size };
  });
}

async function processOwnedGallery(state: AccountDeletionJobState) {
  if (!state.currentGalleryId) {
    const candidate = (await db.collection("galleries").where("ownerId", "==", state.uid).limit(1).get()).docs[0];
    if (!candidate) return advanceAccountDeletionPhase(state);
    await db.runTransaction(async (transaction) => {
      const [job, gallery] = await Promise.all([
        transaction.get(accountDeletionJobReference(state.uid)),
        transaction.get(candidate.ref),
      ]);
      if (job.data()?.deletionId !== state.deletionId || job.data()?.currentGalleryId ||
        gallery.data()?.ownerId !== state.uid) return;
      transaction.set(candidate.ref, {
        accountDeletionId: state.deletionId,
        lifecycleStatus: "purging",
        cleanupReason: "account-deletion",
        cleanupClaimedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.update(accountDeletionJobReference(state.uid), {
        currentGalleryId: candidate.id,
        currentGalleryStage: "members",
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return;
  }
  const gallery = await claimedGallerySnapshot(state);
  if (!gallery) return;
  const stage = state.currentGalleryStage ?? "members";
  if (stage === "members") {
    const result = await drainClaimedGalleryQuery(state, gallery.ref, gallery.ref.collection("members"));
    if (!result.valid) await accountDeletionJobReference(state.uid).update({
      currentGalleryId: FieldValue.delete(), currentGalleryStage: FieldValue.delete(),
    });
    else if (!result.deleted) await accountDeletionJobReference(state.uid).update({ currentGalleryStage: "storage" });
    return;
  }
  if (stage === "storage") {
    if (await deleteAccountStoragePage(`published/${state.uid}/${gallery.id}/`))
      await accountDeletionJobReference(state.uid).update({ currentGalleryStage: "invitations" });
    return;
  }
  if (stage === "invitations") {
    const result = await drainClaimedGalleryQuery(
      state,
      gallery.ref,
      db.collection("galleryInvites").where("galleryId", "==", gallery.id),
    );
    if (!result.valid) await accountDeletionJobReference(state.uid).update({
      currentGalleryId: FieldValue.delete(), currentGalleryStage: FieldValue.delete(),
    });
    else if (!result.deleted)
      await accountDeletionJobReference(state.uid).update({ currentGalleryStage: "revision-permits" });
    return;
  }
  if (stage === "revision-permits") {
    const result = await drainClaimedGalleryQuery(
      state,
      gallery.ref,
      db.collection("galleryRevisionPermits").where("galleryId", "==", gallery.id),
    );
    if (!result.valid) await accountDeletionJobReference(state.uid).update({
      currentGalleryId: FieldValue.delete(), currentGalleryStage: FieldValue.delete(),
    });
    else if (!result.deleted)
      await accountDeletionJobReference(state.uid).update({ currentGalleryStage: "legacy-artworks" });
    return;
  }
  if (stage === "legacy-artworks") {
    const result = await drainClaimedGalleryQuery(
      state,
      gallery.ref,
      db.collection("galleryArtworks")
        .where("galleryId", "==", gallery.id)
        .where("ownerId", "==", state.uid),
      // Legacy artwork documents may be close to Firestore's 1 MiB document
      // ceiling. Keep the read/delete transaction well below its 10 MiB cap.
      5,
    );
    if (!result.valid) await accountDeletionJobReference(state.uid).update({
      currentGalleryId: FieldValue.delete(), currentGalleryStage: FieldValue.delete(),
    });
    else if (!result.deleted)
      await accountDeletionJobReference(state.uid).update({ currentGalleryStage: "delete" });
    return;
  }
  await db.runTransaction(async (transaction) => {
    const [job, latestGallery] = await Promise.all([
      transaction.get(accountDeletionJobReference(state.uid)),
      transaction.get(gallery.ref),
    ]);
    if (job.data()?.deletionId !== state.deletionId) return;
    if (latestGallery.data()?.ownerId === state.uid && latestGallery.data()?.accountDeletionId === state.deletionId) {
      transaction.delete(gallery.ref);
      transaction.update(accountDeletionJobReference(state.uid), {
        currentGalleryId: FieldValue.delete(),
        currentGalleryStage: FieldValue.delete(),
        "counts.ownedSpacesDeleted": FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      transaction.update(accountDeletionJobReference(state.uid), {
        currentGalleryId: FieldValue.delete(),
        currentGalleryStage: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
}

async function assertDeletionCreatorOwnership(state: AccountDeletionJobState) {
  if (!state.creatorId) return;
  const account = await db.collection("creatorAccounts").doc(state.creatorId).get();
  if (account.exists && account.data()?.ownerId !== state.uid)
    throw new Error("deletion-creator-identity-reused");
}

async function processOutgoingFollows(state: AccountDeletionJobState) {
  if (!state.creatorId) return advanceAccountDeletionPhase(state);
  await assertDeletionCreatorOwnership(state);
  const candidates = (await db.collection("creatorFollows")
    .where("followerCreatorId", "==", state.creatorId)
    .limit(100).get()).docs;
  if (!candidates.length) return advanceAccountDeletionPhase(state);
  await db.runTransaction(async (transaction) => {
    const [job, ...relations] = await Promise.all([
      transaction.get(accountDeletionJobReference(state.uid)),
      ...candidates.map((candidate) => transaction.get(candidate.ref)),
    ]);
    if (job.data()?.deletionId !== state.deletionId) return;
    const decisions = relations.map((relation) =>
      relation.exists ? accountDeletionFollowRelation(relation.data(), state.creatorId!) : { remove: false as const });
    const targets = [...new Set(decisions.flatMap((decision) =>
      decision.remove && decision.followedCreatorId ? [decision.followedCreatorId] : []))];
    const targetProfiles = await Promise.all(targets.map((target) =>
      transaction.get(db.collection("creatorProfiles").doc(target))));
    const profileById = new Map(targetProfiles.map((profile) => [profile.id, profile]));
    for (const [index, relation] of relations.entries()) {
      const decision = decisions[index]!;
      if (!decision.remove) continue;
      transaction.delete(relation.ref);
      if (!decision.followedCreatorId) continue;
      const profile = profileById.get(decision.followedCreatorId);
      if (profile?.exists) transaction.set(profile.ref, {
        followerCount: aggregateAfterRelationRemoval(profile.data()?.followerCount),
      }, { merge: true });
    }
    transaction.update(accountDeletionJobReference(state.uid), {
      "counts.creatorFollowsRemoved": FieldValue.increment(relations.filter((item) => item.exists).length),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function processCreatorPostRelations(
  state: AccountDeletionJobState,
  kind: "comments" | "reactions",
) {
  if (!state.creatorId) return advanceAccountDeletionPhase(state);
  await assertDeletionCreatorOwnership(state);
  const field = kind === "comments" ? "authorCreatorId" : "creatorId";
  const countField = kind === "comments" ? "commentCount" : "reactionCount";
  const candidates = (await db.collectionGroup(kind).where(field, "==", state.creatorId).limit(100).get()).docs;
  if (!candidates.length) return advanceAccountDeletionPhase(state);
  await db.runTransaction(async (transaction) => {
    const [job, ...relations] = await Promise.all([
      transaction.get(accountDeletionJobReference(state.uid)),
      ...candidates.map((candidate) => transaction.get(candidate.ref)),
    ]);
    if (job.data()?.deletionId !== state.deletionId) return;
    const existing = relations.filter((relation) => relation.exists && relation.data()?.[field] === state.creatorId);
    const removalsByPost = new Map<string, { reference: DocumentReference; count: number }>();
    for (const relation of existing) {
      const post = relation.ref.parent.parent;
      if (!post) continue;
      const current = removalsByPost.get(post.path);
      removalsByPost.set(post.path, { reference: post, count: (current?.count ?? 0) + 1 });
    }
    const postEntries = [...removalsByPost.values()];
    const posts = await Promise.all(postEntries.map(({ reference }) => transaction.get(reference)));
    existing.forEach((relation) => transaction.delete(relation.ref));
    posts.forEach((post, index) => {
      if (!post.exists) return;
      const removalCount = postEntries[index]!.count;
      const current = Number.isSafeInteger(post.data()?.[countField]) ? Number(post.data()?.[countField]) : 0;
      transaction.set(post.ref, { [countField]: Math.max(0, current - removalCount) }, { merge: true });
    });
    transaction.update(accountDeletionJobReference(state.uid), {
      [`counts.creator${kind === "comments" ? "Comments" : "Reactions"}Removed`]: FieldValue.increment(existing.length),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function processSubmittedReports(state: AccountDeletionJobState, field: "reporterAccountId" | "reporterCreatorId") {
  // WP1 RETENTION BLOCKER: moderationCases/*/events are append-only audit
  // evidence and operator-created events can retain target/report identifiers.
  // Their legal basis and retention period require an explicit external owner
  // decision; this provisional erasure path must not silently rewrite them.
  if (field === "reporterCreatorId" && !state.creatorId) return advanceAccountDeletionPhase(state);
  if (state.creatorId) await assertDeletionCreatorOwnership(state);
  const expected = field === "reporterAccountId" ? state.uid : state.creatorId!;
  const candidates = (await db.collection("creatorReports").where(field, "==", expected).limit(100).get()).docs;
  if (!candidates.length) return advanceAccountDeletionPhase(state);
  const accountPseudonym = `deleted-account-${createHash("sha256")
    .update(`reporter-account:${state.deletionId}`).digest("hex").slice(0, 24)}`;
  const creatorPseudonym = `deleted-creator-${createHash("sha256")
    .update(`reporter-creator:${state.deletionId}`).digest("hex").slice(0, 24)}`;
  await db.runTransaction(async (transaction) => {
    const [job, ...reports] = await Promise.all([
      transaction.get(accountDeletionJobReference(state.uid)),
      ...candidates.map((candidate) => transaction.get(candidate.ref)),
    ]);
    if (job.data()?.deletionId !== state.deletionId) return;
    const existing = reports.filter((report) => report.exists && report.data()?.[field] === expected);
    const migrations = existing.map((report) => ({
      report,
      destination: db.collection("creatorReports").doc(
        accountDeletionPseudonymousReportId(state.deletionId, report.id),
      ),
      caseId: typeof report.data()?.caseId === "string" && /^[a-f0-9]{64}$/.test(report.data()!.caseId)
        ? report.data()!.caseId as string
        : undefined,
    }));
    const caseIds = [...new Set(migrations.flatMap(({ caseId }) => caseId ? [caseId] : []))];
    const cases = await Promise.all(caseIds.map((caseId) =>
      transaction.get(db.collection("moderationCases").doc(caseId))));
    const reportIdReplacements = new Map(migrations.map(({ report, destination }) =>
      [report.id, destination.id]));
    migrations.forEach(({ report, destination }) => {
      const data = { ...report.data() };
      delete data.reporterAccountId;
      delete data.reporterCreatorId;
      delete data.reporterHandle;
      delete data.reporterDisplayName;
      transaction.create(destination, {
        ...data,
        reporterAccountId: accountPseudonym,
        ...(state.creatorId ? { reporterCreatorId: creatorPseudonym } : {}),
        reporterDeleted: true,
        reporterPseudonymVersion: 1,
        reporterDeletedAt: FieldValue.serverTimestamp(),
      });
      transaction.delete(report.ref);
    });
    for (const moderationCase of cases) {
      if (!moderationCase.exists || !Array.isArray(moderationCase.data()?.sourceReportIds)) continue;
      const sourceReportIds = moderationCase.data()!.sourceReportIds
        .filter((value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value))
        .map((reportId: string) => reportIdReplacements.get(reportId) ?? reportId);
      transaction.set(moderationCase.ref, {
        sourceReportIds: [...new Set(sourceReportIds)].slice(0, 50),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    transaction.update(accountDeletionJobReference(state.uid), {
      "counts.submittedReportsPseudonymized": FieldValue.increment(existing.length),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function processReportsAgainstDeletedCreator(state: AccountDeletionJobState) {
  if (!state.creatorId) return advanceAccountDeletionPhase(state);
  await assertDeletionCreatorOwnership(state);
  const candidates = (await db.collection("creatorReports")
    .where("targetCreatorId", "==", state.creatorId).limit(100).get()).docs;
  if (!candidates.length) return advanceAccountDeletionPhase(state);
  const targetPseudonym = `deleted-${createHash("sha256")
    .update(`creator:${state.deletionId}`).digest("hex").slice(0, 32)}`;
  await db.runTransaction(async (transaction) => {
    const [job, ...reports] = await Promise.all([
      transaction.get(accountDeletionJobReference(state.uid)),
      ...candidates.map((candidate) => transaction.get(candidate.ref)),
    ]);
    if (job.data()?.deletionId !== state.deletionId) return;
    const existing = reports.filter((report) =>
      report.exists && report.data()?.targetCreatorId === state.creatorId);
    const migrations = existing.map((report) => ({
      report,
      destination: db.collection("creatorReports").doc(
        accountDeletionPseudonymousReportId(state.deletionId, report.id),
      ),
      caseId: typeof report.data()?.caseId === "string" && /^[a-f0-9]{64}$/.test(report.data()!.caseId)
        ? report.data()!.caseId as string
        : undefined,
    }));
    const caseIds = [...new Set(migrations.flatMap(({ caseId }) => caseId ? [caseId] : []))];
    const cases = await Promise.all(caseIds.map((caseId) =>
      transaction.get(db.collection("moderationCases").doc(caseId))));
    const reportIdReplacements = new Map(migrations.map(({ report, destination }) =>
      [report.id, destination.id]));
    for (const { report, destination } of migrations) {
      transaction.create(destination, {
        ...report.data(),
        targetCreatorId: targetPseudonym,
        targetDeleted: true,
        targetPseudonymVersion: 1,
        targetDeletedAt: FieldValue.serverTimestamp(),
      });
      transaction.delete(report.ref);
    }
    for (const moderationCase of cases) {
      if (!moderationCase.exists) continue;
      const target = moderationCase.data()?.target;
      const sourceReportIds = Array.isArray(moderationCase.data()?.sourceReportIds)
        ? moderationCase.data()!.sourceReportIds
          .filter((value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value))
          .map((reportId: string) => reportIdReplacements.get(reportId) ?? reportId)
        : undefined;
      transaction.set(moderationCase.ref, {
        targetCreatorId: targetPseudonym,
        target: {
          ...(target && typeof target === "object" && !Array.isArray(target) ? target : {}),
          creatorId: targetPseudonym,
        },
        targetDeleted: true,
        targetPseudonymVersion: 1,
        targetDeletedAt: FieldValue.serverTimestamp(),
        ...(sourceReportIds ? { sourceReportIds: [...new Set(sourceReportIds)].slice(0, 50) } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    transaction.update(accountDeletionJobReference(state.uid), {
      "counts.targetReportsPseudonymized": FieldValue.increment(existing.length),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function processOwnedCreatorPosts(state: AccountDeletionJobState) {
  if (!state.creatorId) return advanceAccountDeletionPhase(state);
  await assertDeletionCreatorOwnership(state);
  const accountReference = db.collection("creatorAccounts").doc(state.creatorId);
  if (!state.currentPostId) {
    const candidate = (await accountReference.collection("posts").limit(1).get()).docs[0];
    if (!candidate) return advanceAccountDeletionPhase(state);
    await db.runTransaction(async (transaction) => {
      const [job, account, post, comments, reactions] = await Promise.all([
        transaction.get(accountDeletionJobReference(state.uid)),
        transaction.get(accountReference),
        transaction.get(candidate.ref),
        transaction.get(candidate.ref.collection("comments").limit(1)),
        transaction.get(candidate.ref.collection("reactions").limit(1)),
      ]);
      if (job.data()?.deletionId !== state.deletionId) return;
      if (account.exists && account.data()?.ownerId !== state.uid)
        throw new Error("deletion-creator-identity-reused");
      if (!post.exists) return;
      if (comments.empty && reactions.empty) {
        transaction.delete(candidate.ref);
        transaction.update(accountDeletionJobReference(state.uid), {
          "counts.creatorPostsRemoved": FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }
      transaction.update(accountDeletionJobReference(state.uid), {
        currentPostId: candidate.id,
        currentPostStage: comments.empty ? "reactions" : "comments",
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return;
  }
  const postReference = accountReference.collection("posts").doc(state.currentPostId);
  const post = await postReference.get();
  if (!post.exists) {
    await accountDeletionJobReference(state.uid).update({
      currentPostId: FieldValue.delete(), currentPostStage: FieldValue.delete(),
    });
    return;
  }
  const stage = state.currentPostStage ?? "comments";
  if (stage === "comments" || stage === "reactions") {
    const page = await postReference.collection(stage).limit(ACCOUNT_DELETION_PAGE_SIZE).get();
    if (page.empty) {
      await accountDeletionJobReference(state.uid).update({
        currentPostStage: stage === "comments" ? "reactions" : "delete",
      });
    } else {
      const batch = db.batch();
      page.docs.forEach((document) => batch.delete(document.ref));
      await batch.commit();
    }
    return;
  }
  await db.runTransaction(async (transaction) => {
    const [job, account, latestPost] = await Promise.all([
      transaction.get(accountDeletionJobReference(state.uid)),
      transaction.get(accountReference),
      transaction.get(postReference),
    ]);
    if (job.data()?.deletionId !== state.deletionId) return;
    if (account.exists && account.data()?.ownerId !== state.uid)
      throw new Error("deletion-creator-identity-reused");
    if (latestPost.exists) transaction.delete(postReference);
    transaction.update(accountDeletionJobReference(state.uid), {
      currentPostId: FieldValue.delete(),
      currentPostStage: FieldValue.delete(),
      "counts.creatorPostsRemoved": FieldValue.increment(latestPost.exists ? 1 : 0),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function processAccountMedia(state: AccountDeletionJobState) {
  const mayDrain = await db.runTransaction(async (transaction) => {
    const leaseReference = accountMediaUploadLeaseReference(state.uid);
    const [job, lease] = await Promise.all([
      transaction.get(accountDeletionJobReference(state.uid)),
      transaction.get(leaseReference),
    ]);
    const current = assertAccountDeletionJobState(job.data(), state.uid);
    if (current.deletionId !== state.deletionId || current.phase !== "account-media") return false;
    const leaseExpiresAt = timestampMilliseconds(lease.data()?.leaseExpiresAt);
    const disposition = accountMediaUploadLeaseDisposition(
      lease.exists ? lease.data() : undefined,
      leaseExpiresAt,
      state.uid,
      Date.now(),
    );
    if (disposition === "absent") return true;
    if (disposition === "active") return false;
    transaction.delete(leaseReference);
    return true;
  });
  if (!mayDrain) return;
  const accountMediaComplete = await deleteAccountStoragePage(`profiles/${state.uid}/`);
  if (!accountMediaComplete) return;
  if (state.creatorId) {
    await assertDeletionCreatorOwnership(state);
    if (!(await deleteAccountStoragePage(`creator-public/${state.creatorId}/`))) return;
  }
  await advanceAccountDeletionPhase(state);
}

async function processCreatorRoots(state: AccountDeletionJobState) {
  if (!state.creatorId) return advanceAccountDeletionPhase(state);
  await db.runTransaction(async (transaction) => {
    const ownerReference = db.collection("creatorAccountOwners").doc(state.uid);
    const accountReference = db.collection("creatorAccounts").doc(state.creatorId!);
    const [job, owner, account] = await Promise.all([
      transaction.get(accountDeletionJobReference(state.uid)),
      transaction.get(ownerReference),
      transaction.get(accountReference),
    ]);
    if (job.data()?.deletionId !== state.deletionId) return;
    if (account.exists && account.data()?.ownerId !== state.uid)
      throw new Error("deletion-creator-identity-reused");
    if (owner.exists && owner.data()?.creatorId !== state.creatorId)
      throw new Error("deletion-creator-mapping-changed");
    transaction.delete(db.collection("creatorProfiles").doc(state.creatorId!));
    transaction.delete(db.collection("creatorNotifications").doc(state.creatorId!));
    transaction.delete(accountReference);
    if (owner.data()?.creatorId === state.creatorId) transaction.delete(ownerReference);
    for (const kind of ["comment", "follow", "reaction"] as const)
      transaction.delete(db.collection("creatorActionRateLimits").doc(creatorActionRateId(state.creatorId!, kind)));
    transaction.update(accountDeletionJobReference(state.uid), {
      phase: nextAccountDeletionPhase(state.phase),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

async function processAccountDocuments(state: AccountDeletionJobState) {
  const batch = db.batch();
  [
    db.collection("profiles").doc(state.uid),
    db.collection("newsletterSubscriptions").doc(state.uid),
    db.collection("galleryPublicationQuotas").doc(state.uid),
    db.collection("verificationMailRateLimits").doc(state.uid),
    db.collection("creatorActionRateLimits").doc(creatorActionRateId(state.uid, "report")),
    accountExportJobReference(state.uid),
  ].forEach((reference) => batch.delete(reference));
  await batch.commit();
  await advanceAccountDeletionPhase(state);
}

async function processAccountAuthentication(state: AccountDeletionJobState) {
  try {
    await getAuth().deleteUser(state.uid);
  } catch (error) {
    if (!accountDeletionAuthenticationAlreadyMissing(error)) throw error;
  }
  const snapshot = await accountDeletionJobReference(state.uid).get();
  await accountDeletionJobReference(state.uid).update({
    status: "complete",
    phase: "complete",
    summary: portableValue({
      ...(snapshot.data()?.counts ?? {}),
      authenticationDeleted: true,
    }),
    email: FieldValue.delete(),
    creatorId: FieldValue.delete(),
    currentGalleryId: FieldValue.delete(),
    currentGalleryStage: FieldValue.delete(),
    currentPermitPath: FieldValue.delete(),
    currentPermitPrefix: FieldValue.delete(),
    currentPermitOwnerId: FieldValue.delete(),
    currentPermitExternalOwner: FieldValue.delete(),
    currentPostId: FieldValue.delete(),
    currentPostStage: FieldValue.delete(),
    leaseId: FieldValue.delete(),
    leaseExpiresAt: FieldValue.delete(),
    completedAt: FieldValue.serverTimestamp(),
    expiresAt: new Date(Date.now() + ACCOUNT_DELETION_TOMBSTONE_TTL_MS),
    updatedAt: FieldValue.serverTimestamp(),
    lastErrorCode: FieldValue.delete(),
  });
}

async function runAccountDeletionStep(state: AccountDeletionJobState) {
  if (["publication-permits", "owned-revision-permits", "uploaded-revision-permits"].includes(state.phase))
    return processAccountDeletionPermits(state);
  if (state.phase === "asset-retirements") return processAccountAssetRetirement(state);
  if (state.phase === "owned-galleries") return processOwnedGallery(state);
  if (state.phase === "shared-memberships") {
    if (!state.email) return advanceAccountDeletionPhase(state);
    return deleteAccountQueryPage(state,
      db.collectionGroup("members").where("email", "==", state.email), "sharedMembershipsRemoved");
  }
  if (state.phase === "shared-memberships-by-account")
    return deleteAccountQueryPage(state,
      db.collectionGroup("members").where("acceptedBy", "==", state.uid), "sharedMembershipsRemoved");
  if (state.phase === "sent-invitations")
    return deleteAccountQueryPage(state,
      db.collection("galleryInvites").where("ownerId", "==", state.uid), "invitationsRemoved");
  if (state.phase === "received-invitations") {
    if (!state.email) return advanceAccountDeletionPhase(state);
    return deleteAccountQueryPage(state,
      db.collection("galleryInvites").where("email", "==", state.email), "invitationsRemoved");
  }
  if (state.phase === "received-invitations-by-account")
    return deleteAccountQueryPage(state,
      db.collection("galleryInvites").where("acceptedBy", "==", state.uid), "invitationsRemoved");
  if (state.phase === "export-chunks")
    return deleteAccountQueryPage(state,
      accountExportJobReference(state.uid).collection("accountExportChunks"),
      "exportChunksRemoved",
      // A managed-export part may approach 600 KiB. Eight documents keep one
      // read/delete page comfortably below Firestore and heap limits.
      8,
    );
  if (state.phase === "creator-outgoing-follows") return processOutgoingFollows(state);
  if (state.phase === "creator-incoming-follows") {
    if (!state.creatorId) return advanceAccountDeletionPhase(state);
    await assertDeletionCreatorOwnership(state);
    return deleteAccountQueryPage(state,
      db.collection("creatorFollows").where("followedCreatorId", "==", state.creatorId), "creatorFollowsRemoved");
  }
  if (state.phase === "creator-comments") return processCreatorPostRelations(state, "comments");
  if (state.phase === "creator-reactions") return processCreatorPostRelations(state, "reactions");
  if (state.phase === "creator-posts") return processOwnedCreatorPosts(state);
  if (state.phase === "creator-blocks-out" || state.phase === "creator-blocks-in") {
    if (!state.creatorId) return advanceAccountDeletionPhase(state);
    await assertDeletionCreatorOwnership(state);
    const field = state.phase === "creator-blocks-out" ? "blockerCreatorId" : "blockedCreatorId";
    return deleteAccountQueryPage(state,
      db.collection("creatorBlocks").where(field, "==", state.creatorId), "creatorBlocksRemoved");
  }
  if (state.phase === "creator-reports-by-account")
    return processSubmittedReports(state, "reporterAccountId");
  if (state.phase === "creator-reports-by-creator")
    return processSubmittedReports(state, "reporterCreatorId");
  if (state.phase === "creator-reports-against") return processReportsAgainstDeletedCreator(state);
  if (state.phase === "creator-notification-actors") {
    if (!state.creatorId) return advanceAccountDeletionPhase(state);
    await assertDeletionCreatorOwnership(state);
    return deleteAccountQueryPage(state,
      db.collectionGroup("items").where("actorCreatorId", "==", state.creatorId), "creatorNotificationsRemoved");
  }
  if (state.phase === "creator-notifications") {
    if (!state.creatorId) return advanceAccountDeletionPhase(state);
    await assertDeletionCreatorOwnership(state);
    return deleteAccountQueryPage(state,
      db.collection("creatorNotifications").doc(state.creatorId).collection("items"), "creatorNotificationsRemoved");
  }
  if (state.phase === "creator-handles") {
    if (!state.creatorId) return advanceAccountDeletionPhase(state);
    await assertDeletionCreatorOwnership(state);
    return deleteAccountQueryPage(state,
      db.collection("creatorHandles").where("creatorId", "==", state.creatorId), "creatorHandlesRemoved");
  }
  if (state.phase === "unsubscribe-tokens")
    return deleteAccountQueryPage(state,
      db.collection("newsletterUnsubscribeTokens").where("uid", "==", state.uid), "unsubscribeTokensRemoved");
  if (state.phase === "queued-mail")
    return deleteAccountQueryPage(state,
      db.collection("mail").where("accountUid", "==", state.uid), "queuedMailRemoved");
  if (state.phase === "account-documents") return processAccountDocuments(state);
  if (state.phase === "account-media") return processAccountMedia(state);
  if (state.phase === "creator-roots") return processCreatorRoots(state);
  if (state.phase === "authentication") return processAccountAuthentication(state);
}

async function initializeAccountDeletion(uid: string, authTime: unknown) {
  // Load the durable checkpoint before touching Auth. This is essential when a
  // prior deleteUser succeeded but the completion write/response was lost.
  const existing = await loadAccountDeletionState(uid);
  if (existing) return existing;
  try {
    assertRecentAuthentication(authTime);
  } catch {
    throw new HttpsError("failed-precondition", "Recent authentication required. Sign in again, then retry.");
  }
  const user = await getAuth().getUser(uid);
  const deletionId = randomBytes(16).toString("hex");
  return db.runTransaction(async (transaction) => {
    const reference = accountDeletionJobReference(uid);
    const [current, creatorOwner] = await Promise.all([
      transaction.get(reference),
      transaction.get(db.collection("creatorAccountOwners").doc(uid)),
    ]);
    if (current.exists) return assertAccountDeletionJobState(current.data(), uid);
    const creatorId = creatorOwner.data()?.creatorId;
    const proposed: AccountDeletionJobState = {
      schemaVersion: ACCOUNT_DELETION_SCHEMA_VERSION,
      uid,
      deletionId,
      status: "running",
      phase: "publication-permits",
      ...(user.email ? { email: user.email.trim().toLowerCase() } : {}),
      ...(validAccountDeletionSegment(creatorId) ? { creatorId } : {}),
    };
    transaction.create(reference, {
      ...proposed,
      counts: {},
      attemptCount: 0,
      schemaVersion: ACCOUNT_DELETION_SCHEMA_VERSION,
      startedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return proposed;
  });
}

async function acquireAccountDeletionLease(state: AccountDeletionJobState, leaseId: string) {
  return db.runTransaction(async (transaction) => {
    const reference = accountDeletionJobReference(state.uid);
    const snapshot = await transaction.get(reference);
    const current = assertAccountDeletionJobState(snapshot.data(), state.uid);
    if (current.status === "complete") return false;
    const leaseExpiresAt = timestampMilliseconds(snapshot.data()?.leaseExpiresAt) ?? 0;
    if (!accountDeletionLeaseAvailable(leaseExpiresAt, Date.now()) && snapshot.data()?.leaseId !== leaseId)
      return false;
    transaction.update(reference, {
      leaseId,
      leaseExpiresAt: new Date(Date.now() + ACCOUNT_DELETION_LEASE_MS),
      attemptCount: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

async function releaseAccountDeletionLease(uid: string, leaseId: string) {
  await db.runTransaction(async (transaction) => {
    const reference = accountDeletionJobReference(uid);
    const snapshot = await transaction.get(reference);
    if (snapshot.data()?.leaseId !== leaseId) return;
    transaction.update(reference, {
      leaseId: FieldValue.delete(),
      leaseExpiresAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }).catch(() => undefined);
}

/** Bounded, resumable erasure. Every destructive phase re-fetches page one;
 * Auth is last and the completion tombstone is intentionally retained. */
export const deleteAuraAccount = onCall(
  { region: REGION, timeoutSeconds: 300, memory: "512MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    if (request.data?.confirmation !== "DELETE")
      throw new HttpsError("invalid-argument", "Type DELETE to confirm account deletion.");
    let state = await initializeAccountDeletion(uid, request.auth?.token.auth_time);
    if (state.status === "complete") return {
      ...accountDeletionPublicStatus(state),
      summary: portableValue((await accountDeletionJobReference(uid).get()).data()?.summary ?? {}),
    };
    const leaseId = randomBytes(16).toString("hex");
    if (!(await acquireAccountDeletionLease(state, leaseId)))
      return { ...accountDeletionPublicStatus(await loadAccountDeletionState(uid) ?? state), retryAfterMs: 1_000 };
    try {
      for (let step = 0; step < ACCOUNT_DELETION_STEPS_PER_CALL; step += 1) {
        state = await loadAccountDeletionState(uid) ?? state;
        if (state.status === "complete") break;
        await runAccountDeletionStep(state);
      }
      state = await loadAccountDeletionState(uid) ?? state;
      const snapshot = await accountDeletionJobReference(uid).get();
      return {
        ...accountDeletionPublicStatus(state),
        ...(state.status === "complete" ? { summary: portableValue(snapshot.data()?.summary ?? {}) } : {}),
      };
    } catch (error) {
      await accountDeletionJobReference(uid).update({
        lastErrorCode: accountDeletionErrorCode(error),
        lastErrorAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }).catch(() => undefined);
      throw new HttpsError("internal", "Account deletion is incomplete. Retry safely.");
    } finally {
      await releaseAccountDeletionLease(uid, leaseId);
    }
  },
);

/** Durable recovery path when the browser closes or a callable response is
 * lost. Work remains page-bounded and uses the same cross-invocation lease. */
export const resumeAuraAccountDeletions = onSchedule(
  {
    schedule: "every 15 minutes",
    region: REGION,
    timeoutSeconds: 300,
    memory: "512MiB",
    maxInstances: 1,
  },
  async () => {
    const candidates = await db.collection("accountDeletionJobs")
      .where("status", "==", "running")
      .orderBy("updatedAt", "asc")
      .limit(10)
      .get();
    let resumed = 0;
    for (const candidate of candidates.docs) {
      if (resumed >= 2) break;
      let state: AccountDeletionJobState;
      try {
        state = assertAccountDeletionJobState(candidate.data(), candidate.id);
      } catch (error) {
        logger.error("account_deletion_checkpoint_invalid", {
          accountRef: safeResourceRef(candidate.id),
          errorCode: accountDeletionErrorCode(error),
        });
        await candidate.ref.set({
          status: "invalid",
          lastErrorCode: "deletion-job-state-invalid",
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true }).catch(() => undefined);
        continue;
      }
      const leaseId = randomBytes(16).toString("hex");
      if (!(await acquireAccountDeletionLease(state, leaseId))) continue;
      resumed += 1;
      try {
        for (let step = 0; step < ACCOUNT_DELETION_STEPS_PER_CALL; step += 1) {
          state = await loadAccountDeletionState(state.uid) ?? state;
          if (state.status === "complete") break;
          await runAccountDeletionStep(state);
        }
      } catch (error) {
        logger.warn("account_deletion_resume_failed", {
          accountRef: safeResourceRef(state.uid),
          phase: state.phase,
          errorCode: accountDeletionErrorCode(error),
        });
        await accountDeletionJobReference(state.uid).update({
          lastErrorCode: accountDeletionErrorCode(error),
          lastErrorAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }).catch(() => undefined);
      } finally {
        await releaseAccountDeletionLease(state.uid, leaseId);
      }
    }
    logger.info("account_deletion_resume_complete", { candidates: candidates.size, resumed });
  },
);

/**
 * Server-issued publication permits authorize only the bounded upload and
 * finalization callables. Client Storage writes stay denied, while the quota
 * document keeps concurrent account publications bounded.
 */
export const beginAuraGalleryPublication = onCall(
  { region: REGION, timeoutSeconds: 30, enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    if (!verifiedAccount(request.auth))
      throw new HttpsError("failed-precondition", "Verify your email before publishing.");
    const galleryId = galleryIdFrom(request.data?.galleryId);
    const visibility = request.data?.visibility;
    if (typeof visibility !== "string" || !galleryVisibilities.has(visibility))
      throw new HttpsError("invalid-argument", "Invalid Space visibility.");
    const now = Date.now();
    const terms = publicationTerms(true, visibility as GalleryVisibility, now);
    if (!terms)
      throw new HttpsError("failed-precondition", "A verified account is required to publish.");
    const { retention, expiresAt } = terms;
    const permitExpiresAt = new Date(now + 20 * 60_000);
    const quotaReference = db.collection("galleryPublicationQuotas").doc(uid);
    const permitReference = db.collection("galleryPublishPermits").doc(galleryId);
    const issuedPermit = await db.runTransaction(async (transaction) => {
      await assertAccountMutationAllowedInTransaction(transaction, uid);
      const [quota, existingGallery, existingPermit, activeRooms] = await Promise.all([
        transaction.get(quotaReference),
        transaction.get(db.collection("galleries").doc(galleryId)),
        transaction.get(permitReference),
        transaction.get(
          db.collection("galleries")
            .where("ownerId", "==", uid)
            .where("lifecycleStatus", "==", "active")
            .where("expiresAt", ">", new Date(now))
            .limit(30),
        ),
      ]);
      if (existingGallery.exists)
        throw new HttpsError("already-exists", "This publication id is already in use.");
      const existingData = existingPermit.data();
      const existingPermitExpiry = timestampMilliseconds(existingData?.permitExpiresAt);
      const existingPublicationExpiry = timestampMilliseconds(existingData?.expiresAt);
      if (existingPermit.exists) {
        if (
          existingData?.ownerId !== uid
          || existingData?.galleryId !== galleryId
          || existingData?.visibility !== visibility
          || existingData?.retention !== retention
          || existingPermitExpiry === undefined
          || existingPermitExpiry <= now
          || existingPublicationExpiry === undefined
          || existingPublicationExpiry <= now
          || (existingData?.kind !== undefined && existingData.kind !== "initial")
          || (existingData?.status !== undefined && existingData.status !== "pending")
        ) throw new HttpsError("already-exists", "This publication id is already in use.");
        transaction.set(permitReference, {
          kind: "initial",
          status: "pending",
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return {
          expiresAt: new Date(existingPublicationExpiry).toISOString(),
          retention: "account-preview" as const,
        };
      }
      const data = quota.data() ?? {};
      if (activeRooms.size >= 30)
        throw new HttpsError("resource-exhausted", "Archive or remove a live Space before publishing another.");
      const day = new Date(now).toISOString().slice(0, 10);
      const dailyCount = data.day === day ? Number(data.dailyCount ?? 0) : 0;
      if (dailyCount >= 20)
        throw new HttpsError("resource-exhausted", "Daily publication limit reached. Try again tomorrow.");
      transaction.set(quotaReference, {
        day,
        dailyCount: dailyCount + 1,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.create(permitReference, {
        kind: "initial",
        status: "pending",
        galleryId,
        ownerId: uid,
        visibility,
        retention,
        expiresAt,
        permitExpiresAt,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { expiresAt: expiresAt.toISOString(), retention };
    });
    return issuedPermit;
  },
);

/** Browser code never receives Storage write authority. Every immutable media
 * slot is decoded, authorized, named, and created by this callable. */
export const uploadAuraGalleryAsset = onCall(
  {
    region: REGION,
    timeoutSeconds: 90,
    memory: "1GiB",
    concurrency: 2,
    maxInstances: 10,
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = requireAccount(request.auth);
    await assertAccountMutationAllowed(uid);
    if (!verifiedAccount(request.auth))
      throw new HttpsError("failed-precondition", "Verify your email before uploading Space media.");
    let upload: ReturnType<typeof parseGalleryServerAssetUpload>;
    try {
      upload = parseGalleryServerAssetUpload(request.data);
    } catch (error) {
      logger.warn("trusted_gallery_asset_payload_rejected", {
        accountRef: safeResourceRef(uid),
        errorClass: classifyServerError(error),
      });
      throw new HttpsError("invalid-argument", "The Space image upload request is invalid.");
    }

    const now = Date.now();
    const assetUploadId = upload.requestId;
    const assetUploadKey = galleryServerAssetUploadKey(upload);
    const permitReference = upload.revisionId === undefined
      ? db.collection("galleryPublishPermits").doc(upload.galleryId)
      : db.collection("galleryRevisionPermits")
        .doc(galleryRevisionPermitId(upload.galleryId, upload.revisionId));
    const authorization = upload.revisionId === undefined
      ? await db.runTransaction(async (transaction) => {
        await assertAccountMutationAllowedInTransaction(transaction, uid);
        const [gallery, permit] = await Promise.all([
          transaction.get(db.collection("galleries").doc(upload.galleryId)),
          transaction.get(permitReference),
        ]);
        if (gallery.exists)
          throw new HttpsError("already-exists", "This publication id is already in use.");
        const permitData = permit.data();
        const checked = initialPermitFrom(permitData, {
          ownerId: uid,
          galleryId: upload.galleryId,
          now,
        });
        if ((timestampMilliseconds(permitData?.inspectionLeaseUntil) ?? 0) > now)
          throw new HttpsError("aborted", "Space image inspection is already running. Retry shortly.");
        transaction.set(permitReference, galleryAssetUploadLeasePatch(
          permitData,
          assetUploadId,
          assetUploadKey,
          now,
        ), { merge: true });
        return {
          ownerId: uid,
          expiresAtMs: checked.expiresAtMs,
          visibility: checked.visibility,
          retention: checked.retention,
        };
      }, { maxAttempts: 3 })
      : await db.runTransaction(async (transaction) => {
        const galleryReference = db.collection("galleries").doc(upload.galleryId);
        const gallery = await transaction.get(galleryReference);
        if (!gallery.exists) throw new HttpsError("not-found", "This Space no longer exists.");
        const ownerId = revisionIdFrom(gallery.data()?.ownerId);
        await assertAccountMutationAllowedInTransaction(transaction, uid, ownerId);
        const email = memberEmailFrom(request.auth?.token.email);
        const [member, permit] = await Promise.all([
          transaction.get(galleryReference.collection("members").doc(email)),
          transaction.get(permitReference),
        ]);
        const checkedAuthorization = revisionAuthorizationFrom({
          gallery: gallery.data(),
          member: member.data(),
          uid,
          email,
          expectedRevision: upload.expectedRevision!,
          now,
        });
        const permitData = permit.data();
        revisionPermitFrom(permitData, {
          ownerId: checkedAuthorization.ownerId,
          uploaderId: uid,
          galleryId: upload.galleryId,
          revisionId: upload.revisionId!,
          baseRevision: upload.expectedRevision!,
          now,
        });
        if ((timestampMilliseconds(permitData?.inspectionLeaseUntil) ?? 0) > now)
          throw new HttpsError("aborted", "Space image inspection is already running. Retry shortly.");
        transaction.set(permitReference, galleryAssetUploadLeasePatch(
          permitData,
          assetUploadId,
          assetUploadKey,
          now,
        ), { merge: true });
        return {
          ownerId: checkedAuthorization.ownerId,
          expiresAtMs: checkedAuthorization.expiresAtMs,
          visibility: checkedAuthorization.visibility,
          retention: checkedAuthorization.retention,
          uploaderId: uid,
        };
      }, { maxAttempts: 3 });

    let decoded: Awaited<ReturnType<typeof decodeGalleryServerAssetUpload>>;
    try {
      decoded = await decodeGalleryServerAssetUpload(upload);
    } catch (error) {
      await releaseGalleryAssetUploadLease(permitReference, assetUploadId, assetUploadKey);
      logger.warn("trusted_gallery_asset_decode_rejected", {
        galleryId: safeResourceRef(upload.galleryId),
        errorClass: classifyServerError(error),
      });
      throw new HttpsError("invalid-argument", "The Space image is malformed, unsupported, or too large.");
    }
    const descriptor = galleryServerAssetDescriptor(upload, authorization);
    try {
      const stored = await persistGalleryServerAsset(
        getStorage().bucket().file(descriptor.path),
        descriptor,
        decoded.bytes,
        upload.contentType,
      );
      const stillAuthorized = await completeGalleryAssetUploadLease({
        permitReference,
        uploadId: assetUploadId,
        uploadKey: assetUploadKey,
        upload,
        uid,
        ownerId: authorization.ownerId,
      });
      if (!stillAuthorized)
        throw new HttpsError("aborted", "The Space image permit changed while uploading. Retry safely.");
      return {
        path: stored.path,
        bytes: stored.bytes,
        idempotent: stored.idempotent,
      };
    } catch (error) {
      // Exact request replays may be running concurrently after a lost client
      // response. Do not let one failed worker clear their shared request
      // lease; the stable replay can finish it, or expiry/abort cleanup drains
      // it after the callable window.
      if (error instanceof HttpsError) throw error;
      logger.warn("trusted_gallery_asset_write_rejected", {
        galleryId: safeResourceRef(upload.galleryId),
        errorClass: classifyServerError(error),
      });
      const message = error instanceof Error ? error.message : "";
      if (message.includes("different bytes") || message.includes("metadata"))
        throw new HttpsError("already-exists", "This immutable Space image slot is already occupied. Restart publishing.");
      throw new HttpsError("unavailable", "The Space image could not be stored. Retry safely.");
    }
  },
);

/** Decodes every immutable upload and creates the public manifest with Admin
 * authority only after a second permit check in the committing transaction. */
export const finalizeAuraGalleryPublication = onCall(
  {
    region: REGION,
    timeoutSeconds: 180,
    memory: "1GiB",
    concurrency: 1,
    maxInstances: 5,
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = requireAccount(request.auth);
    await assertAccountMutationAllowed(uid);
    if (!verifiedAccount(request.auth))
      throw new HttpsError("failed-precondition", "Verify your email before publishing.");
    const galleryId = galleryIdFrom(request.data?.galleryId);
    const galleryReference = db.collection("galleries").doc(galleryId);
    const permitReference = db.collection("galleryPublishPermits").doc(galleryId);
    const [existingGallery, permitSnapshot] = await Promise.all([
      galleryReference.get(),
      permitReference.get(),
    ]);
    if (existingGallery.exists) {
      const data = existingGallery.data()!;
      if (data.ownerId !== uid)
        throw new HttpsError("permission-denied", "This Space belongs to another account.");
      if (
        data.revision !== 1
        || data.coverPath !== `${galleryUploadRoot({ ownerId: uid, galleryId })}/cover.webp`
      ) throw new HttpsError("already-exists", "This publication id is already in use.");
      return galleryCallableResult(galleryId, data);
    }
    if (!permitSnapshot.exists || permitSnapshot.data()?.ownerId !== uid)
      throw new HttpsError("permission-denied", "No publication permit is available for this account.");
    const context = { ownerId: uid, galleryId };
    const draft = trustedManifestFrom(request.data?.draft, context);
    const distribution = trustedDistributionFrom(request.data?.distribution);
    const expectedCoverPath = `${galleryUploadRoot(context)}/cover.webp`;
    const inspectionId = randomBytes(24).toString("base64url");
    const claim = await db.runTransaction(async (transaction) => {
      await assertAccountMutationAllowedInTransaction(transaction, uid);
      const [latestGallery, latestPermit] = await Promise.all([
        transaction.get(galleryReference),
        transaction.get(permitReference),
      ]);
      if (latestGallery.exists) {
        const data = latestGallery.data()!;
        if (data.ownerId === uid && data.revision === 1 && data.coverPath === expectedCoverPath)
          return { published: true as const };
        throw new HttpsError("already-exists", "This publication id is already in use.");
      }
      const permit = initialPermitFrom(latestPermit.data(), {
        ownerId: uid,
        galleryId,
        now: Date.now(),
      });
      transaction.set(permitReference, galleryInspectionLeasePatch(
        latestPermit.data(),
        inspectionId,
        Date.now(),
      ), { merge: true });
      return {
        published: false as const,
        expiresAtMs: permit.expiresAtMs,
        visibility: permit.visibility,
        retention: permit.retention,
      };
    }, { maxAttempts: 3 });
    if (claim.published) {
      const published = await galleryReference.get();
      return galleryCallableResult(galleryId, published.data()!);
    }

    try {
      const paths = await inspectTrustedGalleryUploads({
        draft,
        context,
        expiresAtMs: claim.expiresAtMs,
        visibility: claim.visibility,
        retention: claim.retention,
      });
      await db.runTransaction(async (transaction) => {
        await assertAccountMutationAllowedInTransaction(transaction, uid);
        const [latestGallery, latestPermit] = await Promise.all([
          transaction.get(galleryReference),
          transaction.get(permitReference),
        ]);
        if (latestGallery.exists) {
          const data = latestGallery.data()!;
          if (data.ownerId === uid && data.revision === 1 && data.coverPath === expectedCoverPath) return;
          throw new HttpsError("already-exists", "This publication id is already in use.");
        }
        const permit = initialPermitFrom(latestPermit.data(), {
          ownerId: uid,
          galleryId,
          now: Date.now(),
        });
        if (!ownsGalleryInspectionLease(latestPermit.data(), inspectionId, Date.now()))
          throw new HttpsError("aborted", "Trusted image inspection lease expired. Retry safely.");
        transaction.create(galleryReference, {
          ...draft,
          coverPath: paths[0],
          ownerId: uid,
          publishedAt: FieldValue.serverTimestamp(),
          expiresAt: new Date(permit.expiresAtMs),
          schemaVersion: TRUSTED_GALLERY_SCHEMA_VERSION,
          visibility: permit.visibility,
          retention: permit.retention,
          accessVersion: 1,
          ...distribution,
          discoverEligible: false,
          revision: 1,
          updatedAt: FieldValue.serverTimestamp(),
          lifecycleStatus: "active",
        });
        transaction.delete(permitReference);
      }, { maxAttempts: 3 });
    } catch (error) {
      await releaseGalleryInspectionLease(permitReference, inspectionId);
      throw error;
    }
    const published = await galleryReference.get();
    if (!published.exists || published.data()?.ownerId !== uid)
      throw new HttpsError("internal", "The Space publication could not be confirmed.");
    return galleryCallableResult(galleryId, published.data()!);
  },
);

export const abortAuraGalleryPublication = onCall(
  { region: REGION, timeoutSeconds: 120, memory: "512MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireSignedIn(request.auth);
    await assertAccountMutationAllowed(uid);
    const galleryId = galleryIdFrom(request.data?.galleryId);
    const permitReference = db.collection("galleryPublishPermits").doc(galleryId);
    const galleryReference = db.collection("galleries").doc(galleryId);
    const state = await db.runTransaction(async (transaction) => {
      await assertAccountMutationAllowedInTransaction(transaction, uid);
      const [permit, gallery] = await Promise.all([
        transaction.get(permitReference),
        transaction.get(galleryReference),
      ]);
      if (gallery.exists) {
        if (gallery.data()?.ownerId !== uid)
          throw new HttpsError("permission-denied", "This Space belongs to another account.");
        return "published" as const;
      }
      if (!permit.exists) return "clean" as const;
      if (permit.data()?.ownerId !== uid)
        throw new HttpsError("permission-denied", "This publication permit belongs to another account.");
      if (permit.data()?.status === "cleanup") return "cleanup" as const;
      transaction.set(permitReference, {
        status: "cleanup",
        permitExpiresAt: galleryAssetCleanupNotBefore(permit.data(), Date.now()),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return "cleanup" as const;
    });
    if (state !== "cleanup") return { status: state };
    await assertAccountMutationAllowed(uid);
    await getStorage().bucket().deleteFiles({ prefix: `published/${uid}/${galleryId}/`, force: true });
    return { status: "cleanup" };
  },
);

/** Issues a short-lived immutable upload namespace only to the current Owner or
 * active Editor and binds it to the exact live revision. */
export const beginAuraGalleryRevision = onCall(
  { region: REGION, timeoutSeconds: 30, enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    if (!verifiedAccount(request.auth))
      throw new HttpsError("failed-precondition", "Verify your email before updating a Space.");
    const galleryId = galleryIdFrom(request.data?.galleryId);
    const revisionId = revisionIdFrom(request.data?.revisionId);
    const baseRevision = revisionNumberFrom(request.data?.expectedRevision);
    const email = memberEmailFrom(request.auth?.token.email);
    const galleryReference = db.collection("galleries").doc(galleryId);
    const memberReference = galleryReference.collection("members").doc(email);
    const permitReference = db.collection("galleryRevisionPermits")
      .doc(galleryRevisionPermitId(galleryId, revisionId));
    const quotaReference = db.collection("galleryPublicationQuotas").doc(uid);
    const now = Date.now();
    const permitExpiresAt = new Date(now + 20 * 60_000);
    return db.runTransaction(async (transaction) => {
      const gallery = await transaction.get(galleryReference);
      const galleryOwnerId = gallery.data()?.ownerId;
      await assertAccountMutationAllowedInTransaction(
        transaction,
        uid,
        typeof galleryOwnerId === "string" ? galleryOwnerId : uid,
      );
      const [member, existingPermit, quota] = await Promise.all([
        transaction.get(memberReference),
        transaction.get(permitReference),
        transaction.get(quotaReference),
      ]);
      if (!gallery.exists) throw new HttpsError("not-found", "This Space no longer exists.");
      const authorization = revisionAuthorizationFrom({
        gallery: gallery.data(),
        member: member.data(),
        uid,
        email,
        expectedRevision: baseRevision,
        now,
      });
      const existingData = existingPermit.data();
      if (existingPermit.exists) {
        revisionPermitFrom(existingData, {
          ownerId: authorization.ownerId,
          uploaderId: uid,
          galleryId,
          revisionId,
          baseRevision,
          now,
        });
        return {
          ownerId: authorization.ownerId,
          expiresAt: new Date(authorization.expiresAtMs).toISOString(),
          retention: authorization.retention,
        };
      }
      const day = new Date(now).toISOString().slice(0, 10);
      const quotaData = quota.data() ?? {};
      const revisionDailyCount = quotaData.revisionDay === day
        ? Number(quotaData.revisionDailyCount ?? 0)
        : 0;
      if (!Number.isSafeInteger(revisionDailyCount) || revisionDailyCount >= 50)
        throw new HttpsError("resource-exhausted", "Daily Space update limit reached. Try again tomorrow.");
      transaction.set(quotaReference, {
        revisionDay: day,
        revisionDailyCount: revisionDailyCount + 1,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.create(permitReference, {
        kind: "revision",
        status: "pending",
        galleryId,
        ownerId: authorization.ownerId,
        uploaderId: uid,
        revisionId,
        baseRevision,
        visibility: authorization.visibility,
        retention: authorization.retention,
        expiresAt: new Date(authorization.expiresAtMs),
        permitExpiresAt,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {
        ownerId: authorization.ownerId,
        expiresAt: new Date(authorization.expiresAtMs).toISOString(),
        retention: authorization.retention,
      };
    });
  },
);

export const finalizeAuraGalleryRevision = onCall(
  {
    region: REGION,
    timeoutSeconds: 180,
    memory: "1GiB",
    concurrency: 1,
    maxInstances: 5,
    enforceAppCheck: true,
  },
  async (request) => {
    const uid = requireAccount(request.auth);
    await assertAccountMutationAllowed(uid);
    if (!verifiedAccount(request.auth))
      throw new HttpsError("failed-precondition", "Verify your email before updating a Space.");
    const galleryId = galleryIdFrom(request.data?.galleryId);
    const revisionId = revisionIdFrom(request.data?.revisionId);
    const baseRevision = revisionNumberFrom(request.data?.expectedRevision);
    const email = memberEmailFrom(request.auth?.token.email);
    const galleryReference = db.collection("galleries").doc(galleryId);
    const memberReference = galleryReference.collection("members").doc(email);
    const permitReference = db.collection("galleryRevisionPermits")
      .doc(galleryRevisionPermitId(galleryId, revisionId));
    const retirementReference = galleryRetirementReference(galleryId, revisionId);
    const [gallerySnapshot, memberSnapshot, permitSnapshot] = await Promise.all([
      galleryReference.get(),
      memberReference.get(),
      permitReference.get(),
    ]);
    if (!gallerySnapshot.exists) throw new HttpsError("not-found", "This Space no longer exists.");
    const existingData = gallerySnapshot.data()!;
    const expectedCoverPath = `${galleryUploadRoot({
      ownerId: String(existingData.ownerId ?? ""),
      galleryId,
      revisionId,
    })}/cover.webp`;
    if (!permitSnapshot.exists) {
      const owner = existingData.ownerId === uid;
      const activeEditor = memberSnapshot.data()?.email === email
        && memberSnapshot.data()?.role === "editor"
        && (memberSnapshot.data()?.status === undefined || memberSnapshot.data()?.status === "active");
      if (!owner && !activeEditor)
        throw new HttpsError("permission-denied", "Only an active Owner or Editor can update this Space.");
      if (existingData.revision === baseRevision + 1 && existingData.coverPath === expectedCoverPath) {
        await drainGalleryAssetRetirement(
          retirementReference,
          galleryReference,
          String(existingData.ownerId),
          galleryId,
          revisionId,
        );
        return galleryCallableResult(galleryId, existingData);
      }
      throw new HttpsError("failed-precondition", "The update permit is unavailable. Reload the Space and retry.");
    }
    const authorization = revisionAuthorizationFrom({
      gallery: existingData,
      member: memberSnapshot.data(),
      uid,
      email,
      expectedRevision: baseRevision,
      now: Date.now(),
    });
    revisionPermitFrom(permitSnapshot.data(), {
      ownerId: authorization.ownerId,
      uploaderId: uid,
      galleryId,
      revisionId,
      baseRevision,
      now: Date.now(),
    });
    const context = { ownerId: authorization.ownerId, galleryId, revisionId };
    const draft = trustedManifestFrom(request.data?.draft, context);
    if (draft.templateId !== authorization.templateId)
      throw new HttpsError("failed-precondition", "A published Space cannot change templates.");
    const inspectionId = randomBytes(24).toString("base64url");
    const claim = await db.runTransaction(async (transaction) => {
      const [latestGallery, latestMember, latestPermit] = await Promise.all([
        transaction.get(galleryReference),
        transaction.get(memberReference),
        transaction.get(permitReference),
      ]);
      if (!latestGallery.exists) throw new HttpsError("not-found", "This Space no longer exists.");
      const latestData = latestGallery.data()!;
      await assertAccountMutationAllowedInTransaction(
        transaction,
        uid,
        typeof latestData.ownerId === "string" ? latestData.ownerId : uid,
      );
      if (latestData.revision === baseRevision + 1 && latestData.coverPath === expectedCoverPath)
        return { published: true as const, ownerId: String(latestData.ownerId) };
      const latestAuthorization = revisionAuthorizationFrom({
        gallery: latestData,
        member: latestMember.data(),
        uid,
        email,
        expectedRevision: baseRevision,
        now: Date.now(),
      });
      if (draft.templateId !== latestAuthorization.templateId)
        throw new HttpsError("failed-precondition", "A published Space cannot change templates.");
      revisionPermitFrom(latestPermit.data(), {
        ownerId: latestAuthorization.ownerId,
        uploaderId: uid,
        galleryId,
        revisionId,
        baseRevision,
        now: Date.now(),
      });
      transaction.set(permitReference, galleryInspectionLeasePatch(
        latestPermit.data(),
        inspectionId,
        Date.now(),
      ), { merge: true });
      return { published: false as const, ...latestAuthorization };
    }, { maxAttempts: 3 });
    if (claim.published) {
      await drainGalleryAssetRetirement(
        retirementReference,
        galleryReference,
        claim.ownerId,
        galleryId,
        revisionId,
      );
      const published = await galleryReference.get();
      return galleryCallableResult(galleryId, published.data()!);
    }

    try {
      const paths = await inspectTrustedGalleryUploads({
        draft,
        context,
        expiresAtMs: claim.expiresAtMs,
        visibility: claim.visibility,
        retention: claim.retention,
        uploaderId: uid,
      });
      await db.runTransaction(async (transaction) => {
        const [latestGallery, latestMember, latestPermit] = await Promise.all([
          transaction.get(galleryReference),
          transaction.get(memberReference),
          transaction.get(permitReference),
        ]);
        if (!latestGallery.exists) throw new HttpsError("not-found", "This Space no longer exists.");
        const latestData = latestGallery.data()!;
        await assertAccountMutationAllowedInTransaction(
          transaction,
          uid,
          typeof latestData.ownerId === "string" ? latestData.ownerId : uid,
        );
        if (latestData.revision === baseRevision + 1 && latestData.coverPath === paths[0]) return;
        const latestAuthorization = revisionAuthorizationFrom({
          gallery: latestData,
          member: latestMember.data(),
          uid,
          email,
          expectedRevision: baseRevision,
          now: Date.now(),
        });
        if (draft.templateId !== latestAuthorization.templateId)
          throw new HttpsError("failed-precondition", "A published Space cannot change templates.");
        revisionPermitFrom(latestPermit.data(), {
          ownerId: latestAuthorization.ownerId,
          uploaderId: uid,
          galleryId,
          revisionId,
          baseRevision,
          now: Date.now(),
        });
        if (!ownsGalleryInspectionLease(latestPermit.data(), inspectionId, Date.now()))
          throw new HttpsError("aborted", "Trusted image inspection lease expired. Retry safely.");
        const retiredPaths = retiredGalleryStoragePaths({
          previous: latestData,
          currentPaths: paths,
          ownerId: latestAuthorization.ownerId,
          galleryId,
        });
        if (retiredPaths.length) transaction.create(retirementReference, {
          ownerId: latestAuthorization.ownerId,
          galleryId,
          revisionId,
          paths: retiredPaths,
          status: "pending",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          schemaVersion: 1,
        });
        transaction.set(galleryReference, {
          ...draft,
          coverPath: paths[0],
          ownerId: latestAuthorization.ownerId,
          publishedAt: latestAuthorization.publishedAt,
          expiresAt: new Date(latestAuthorization.expiresAtMs),
          schemaVersion: TRUSTED_GALLERY_SCHEMA_VERSION,
          visibility: latestAuthorization.visibility,
          retention: latestAuthorization.retention,
          accessVersion: latestAuthorization.accessVersion,
          exploreListed: latestAuthorization.exploreListed,
          creatorProfileListed: latestAuthorization.creatorProfileListed,
          discoverEligible: false,
          revision: baseRevision + 1,
          updatedAt: FieldValue.serverTimestamp(),
          lifecycleStatus: "active",
        });
        transaction.delete(permitReference);
      }, { maxAttempts: 3 });
      await drainGalleryAssetRetirement(
        retirementReference,
        galleryReference,
        claim.ownerId,
        galleryId,
        revisionId,
      );
    } catch (error) {
      await releaseGalleryInspectionLease(permitReference, inspectionId);
      throw error;
    }
    const published = await galleryReference.get();
    if (!published.exists) throw new HttpsError("internal", "The Space update could not be confirmed.");
    return galleryCallableResult(galleryId, published.data()!);
  },
);

export const abortAuraGalleryRevision = onCall(
  { region: REGION, timeoutSeconds: 120, memory: "512MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireSignedIn(request.auth);
    await assertAccountMutationAllowed(uid);
    const galleryId = galleryIdFrom(request.data?.galleryId);
    const revisionId = revisionIdFrom(request.data?.revisionId);
    const permitReference = db.collection("galleryRevisionPermits")
      .doc(galleryRevisionPermitId(galleryId, revisionId));
    const galleryReference = db.collection("galleries").doc(galleryId);
    const state = await db.runTransaction(async (transaction) => {
      const [permit, gallery] = await Promise.all([
        transaction.get(permitReference),
        transaction.get(galleryReference),
      ]);
      const data = permit.data();
      await assertAccountMutationAllowedInTransaction(
        transaction,
        uid,
        typeof data?.ownerId === "string" ? data.ownerId : uid,
      );
      if (!permit.exists) return { status: "clean" as const };
      if (data?.uploaderId !== uid)
        throw new HttpsError("permission-denied", "This update permit belongs to another account.");
      if (
        gallery.exists
        && gallery.data()?.revision === Number(data.baseRevision) + 1
        && gallery.data()?.coverPath === `${galleryUploadRoot({
          ownerId: String(data.ownerId ?? ""), galleryId, revisionId,
        })}/cover.webp`
      ) return { status: "published" as const };
      const ownerId = revisionIdFrom(data?.ownerId);
      if (data?.status === "cleanup") return { status: "cleanup" as const, ownerId };
      transaction.set(permitReference, {
        status: "cleanup",
        permitExpiresAt: galleryAssetCleanupNotBefore(data, Date.now()),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { status: "cleanup" as const, ownerId };
    });
    if (state.status !== "cleanup") return { status: state.status };
    await assertAccountMutationAllowed(uid);
    const prefix = `${galleryUploadRoot({ ownerId: state.ownerId, galleryId, revisionId })}/`;
    await getStorage().bucket().deleteFiles({ prefix, force: true });
    return { status: "cleanup" };
  },
);

export const manageAuraGalleryLifecycle = onCall(
  { region: REGION, timeoutSeconds: 30, enforceAppCheck: true },
  async (request) => {
    const uid = requireSignedIn(request.auth);
    const galleryId = galleryIdFrom(request.data?.galleryId);
    const action = request.data?.action;
    if (typeof action !== "string" || !galleryLifecycleActions.has(action))
      throw new HttpsError("invalid-argument", "Invalid Space action.");
    const visibility = request.data?.visibility;
    const galleryReference = db.collection("galleries").doc(galleryId);
    await db.runTransaction(async (transaction) => {
      await assertAccountMutationAllowedInTransaction(transaction, uid);
      const snapshot = await transaction.get(galleryReference);
      if (!snapshot.exists) throw new HttpsError("not-found", "This Space no longer exists.");
      const data = snapshot.data()!;
      if (data.ownerId !== uid)
        throw new HttpsError("permission-denied", "Only the Space Owner can change its lifecycle.");
      const status = typeof data.lifecycleStatus === "string" ? data.lifecycleStatus : "active";
      const now = new Date();
      if (status === "purging")
        throw new HttpsError("failed-precondition", "This Space is already being permanently removed.");
      if (action === "trash") {
        if (status === "trashed")
          throw new HttpsError("failed-precondition", "This Space is already in Trash.");
        const recoveryEndsAt = new Date(now.getTime() + 7 * 86_400_000);
        const currentExpiry = timestampMilliseconds(data.expiresAt) ?? 0;
        const preTrashExpiry = timestampMilliseconds(data.preTrashExpiresAt) ?? currentExpiry;
        transaction.update(galleryReference, {
          lifecycleStatus: "trashed",
          trashedAt: now,
          purgeAt: recoveryEndsAt,
          // Expiry cleanup must never shorten the explicit Trash recovery
          // window, even when a Space was due to expire sooner.
          expiresAt: new Date(Math.max(currentExpiry, recoveryEndsAt.getTime())),
          preTrashExpiresAt: new Date(preTrashExpiry),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }
      if (action === "restore") {
        if (status !== "trashed") throw new HttpsError("failed-precondition", "This Space is not in Trash.");
        const purgeAt = data.purgeAt?.toMillis?.() ?? 0;
        if (purgeAt <= Date.now()) throw new HttpsError("failed-precondition", "The restore window has ended.");
        const restoredExpiry = timestampMilliseconds(data.preTrashExpiresAt)
          ?? timestampMilliseconds(data.expiresAt)
          ?? 0;
        if (restoredExpiry <= Date.now())
          throw new HttpsError("failed-precondition", "This Space expired while it was in Trash and cannot be restored.");
        transaction.update(galleryReference, {
          lifecycleStatus: "active",
          expiresAt: new Date(restoredExpiry),
          trashedAt: FieldValue.delete(),
          purgeAt: FieldValue.delete(),
          preTrashExpiresAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return;
      }
      if (!verifiedAccount(request.auth))
        throw new HttpsError("failed-precondition", "Use a verified account for this Space action.");
      if (status === "trashed")
        throw new HttpsError("failed-precondition", "Restore this Space before changing it.");
      if (action === "distribution") {
        const exploreListed = request.data?.exploreListed;
        const creatorProfileListed = request.data?.creatorProfileListed;
        if (typeof exploreListed !== "boolean" || typeof creatorProfileListed !== "boolean")
          throw new HttpsError("invalid-argument", "Invalid Space placement settings.");
        transaction.update(galleryReference, {
          exploreListed,
          creatorProfileListed,
        });
        return;
      }
      if (action === "archive") {
        transaction.update(galleryReference, {
          lifecycleStatus: status === "archived" ? "active" : "archived",
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else if (action === "renew") {
        if (data.retention !== "account-preview")
          throw new HttpsError("failed-precondition", "Guest Spaces cannot be renewed.");
        transaction.update(galleryReference, {
          expiresAt: new Date(Date.now() + 365 * 86_400_000),
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        if (typeof visibility !== "string" || !galleryVisibilities.has(visibility))
          throw new HttpsError("invalid-argument", "Invalid Space visibility.");
        transaction.update(galleryReference, {
          visibility,
          // Returning protected content to Public requires a fresh operator
          // review. Repeating Public on an already-public Space is a no-op.
          ...(visibility === "public" && data.visibility !== "public"
            ? { discoverEligible: false }
            : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    });
    return { status: "ok" };
  },
);

export const purgeAuraGallery = onCall(
  { region: REGION, timeoutSeconds: 120, memory: "512MiB", enforceAppCheck: true },
  async (request) => {
    const uid = requireSignedIn(request.auth);
    const galleryId = galleryIdFrom(request.data?.galleryId);
    const galleryReference = db.collection("galleries").doc(galleryId);
    const state = await db.runTransaction(async (transaction) => {
      await assertAccountMutationAllowedInTransaction(transaction, uid);
      const snapshot = await transaction.get(galleryReference);
      if (!snapshot.exists) return "deleted" as const;
      const data = snapshot.data()!;
      if (data.ownerId !== uid)
        throw new HttpsError("permission-denied", "Only the Space Owner can purge it.");
      if (data.lifecycleStatus === "purging") return "purging" as const;
      if (data.lifecycleStatus !== "trashed")
        throw new HttpsError("failed-precondition", "Move the Space to Trash first.");
      const purgeAt = data.purgeAt?.toMillis?.() ?? Number.POSITIVE_INFINITY;
      if (purgeAt > Date.now())
        throw new HttpsError("failed-precondition", "The seven-day recovery period is still active.");
      transaction.update(galleryReference, {
        lifecycleStatus: "purging",
        cleanupReason: "purgeAt",
        cleanupClaimedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "purging" as const;
    });
    if (state === "deleted") return { status: "deleted" };
    await assertAccountMutationAllowed(uid);
    await getStorage().bucket().deleteFiles({ prefix: `published/${uid}/${galleryId}/`, force: true });
    await deleteQueryInBatches(db.collection("galleryInvites").where("galleryId", "==", galleryId));
    await deleteQueryInBatches(db.collection("galleryRevisionPermits").where("galleryId", "==", galleryId));
    await db.collection("galleryPublishPermits").doc(galleryId).delete();
    await db.recursiveDelete(galleryReference);
    return { status: "deleted" };
  },
);

export const createAuraGalleryInvite = onCall(
  { region: REGION, timeoutSeconds: 30, enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const galleryId = galleryIdFrom(request.data?.galleryId);
    const email = memberEmailFrom(request.data?.email);
    const role = request.data?.role;
    if (typeof role !== "string" || !galleryRoles.has(role))
      throw new HttpsError("invalid-argument", "Invalid Space role.");
    if (request.auth?.token.email === email)
      throw new HttpsError("failed-precondition", "The owner already has full access.");
    const recipientUid = await existingAuthUidForDeletionFence(
      email,
      async (recipientEmail) => getAuth().getUserByEmail(recipientEmail),
    );
    const galleryReference = db.collection("galleries").doc(galleryId);
    const inviteReference = db.collection("galleryInvites").doc(inviteIdFor(galleryId, email));
    await db.runTransaction(async (transaction) => {
      await assertAccountMutationAllowedInTransaction(
        transaction,
        uid,
        ...(recipientUid ? [recipientUid] : []),
      );
      const [gallery, invite, ownerInvites] = await Promise.all([
        transaction.get(galleryReference),
        transaction.get(inviteReference),
        transaction.get(db.collection("galleryInvites").where("ownerId", "==", uid).limit(100)),
      ]);
      if (!gallery.exists) throw new HttpsError("not-found", "This Space no longer exists.");
      if (gallery.data()?.ownerId !== uid)
        throw new HttpsError("permission-denied", "Only the Space Owner can invite collaborators.");
      if (["trashed", "purging"].includes(String(gallery.data()?.lifecycleStatus ?? "active")))
        throw new HttpsError("failed-precondition", "Restore the Space before inviting collaborators.");
      if (!invite.exists && ownerInvites.docs.filter((item) => item.data().status === "pending").length >= 50)
        throw new HttpsError("resource-exhausted", "Resolve an existing invitation before adding another.");
      transaction.set(inviteReference, {
        galleryId,
        galleryTitle: String(gallery.data()?.title ?? "Untitled Space").slice(0, 100),
        ownerId: uid,
        email,
        role,
        status: "pending",
        createdAt: invite.exists ? invite.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
        acceptedAt: FieldValue.delete(),
      }, { merge: true });
    });
    return { status: "pending" };
  },
);

export const acceptAuraGalleryInvite = onCall(
  { region: REGION, timeoutSeconds: 30, enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const inviteId = request.data?.inviteId;
    if (typeof inviteId !== "string" || !/^[a-f0-9]{64}$/.test(inviteId))
      throw new HttpsError("invalid-argument", "Invalid invitation.");
    const email = memberEmailFrom(request.auth?.token.email);
    const inviteReference = db.collection("galleryInvites").doc(inviteId);
    await db.runTransaction(async (transaction) => {
      const invite = await transaction.get(inviteReference);
      const data = invite.data();
      if (!data || data.status !== "pending" || data.email !== email)
        throw new HttpsError("not-found", "This invitation is no longer available.");
      if ((data.expiresAt?.toMillis?.() ?? 0) <= Date.now())
        throw new HttpsError("deadline-exceeded", "This invitation has expired.");
      const gallery = await transaction.get(db.collection("galleries").doc(data.galleryId));
      await assertAccountMutationAllowedInTransaction(
        transaction,
        uid,
        typeof gallery.data()?.ownerId === "string" ? gallery.data()!.ownerId : uid,
      );
      if (!gallery.exists || (gallery.data()?.lifecycleStatus ?? "active") !== "active")
        throw new HttpsError("failed-precondition", "This Space is not currently available.");
      transaction.set(
        db.collection("galleries").doc(data.galleryId).collection("members").doc(email),
        {
          email,
          role: data.role,
          status: "active",
          addedAt: FieldValue.serverTimestamp(),
          addedBy: data.ownerId,
          acceptedBy: uid,
        },
      );
      transaction.update(inviteReference, {
        status: "accepted",
        acceptedAt: FieldValue.serverTimestamp(),
        acceptedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return { status: "accepted" };
  },
);

export const revokeAuraGalleryAccess = onCall(
  { region: REGION, timeoutSeconds: 30, enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const galleryId = galleryIdFrom(request.data?.galleryId);
    const email = memberEmailFrom(request.data?.email);
    const galleryReference = db.collection("galleries").doc(galleryId);
    await db.runTransaction(async (transaction) => {
      await assertAccountMutationAllowedInTransaction(transaction, uid);
      const gallery = await transaction.get(galleryReference);
      if (!gallery.exists) return;
      if (gallery.data()?.ownerId !== uid)
        throw new HttpsError("permission-denied", "Only the Space Owner can revoke access.");
      transaction.delete(galleryReference.collection("members").doc(email));
      transaction.delete(db.collection("galleryInvites").doc(inviteIdFor(galleryId, email)));
    });
    return { status: "removed" };
  },
);

export const sendAuraVerificationEmail = onCall(
  { region: REGION, timeoutSeconds: 30, enforceAppCheck: true },
  async (request) => {
    requireMailConfiguration();
    const uid = requireAccount(request.auth);
    const user = await getAuth().getUser(uid);
    if (!user.email) throw new HttpsError("failed-precondition", "This account has no email address.");
    if (user.emailVerified) return { status: "already-verified" };
    const currentBrand = brand();
    const verificationUrl = await getAuth().generateEmailVerificationLink(
      user.email,
      { url: `${currentBrand.appUrl}/#/create`, handleCodeInApp: false },
    );
    const rateReference = db.collection("verificationMailRateLimits").doc(uid);
    const mailReference = db.collection("mail").doc();
    await db.runTransaction(async (transaction) => {
      await assertAccountMutationAllowedInTransaction(transaction, uid);
      const snapshot = await transaction.get(rateReference);
      const lastQueuedAt = snapshot.data()?.lastQueuedAt?.toMillis?.() ?? 0;
      if (Date.now() - lastQueuedAt < 60_000)
        throw new HttpsError("resource-exhausted", "Wait one minute before requesting another email.");
      transaction.set(rateReference, {
        uid,
        lastQueuedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(mailReference, {
        to: [user.email],
        accountUid: uid,
        message: verificationMail(currentBrand, {
          displayName: user.displayName,
          verificationUrl,
        }),
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return { status: "queued" };
  },
);

export const setAuraNewsletterPreference = onCall(
  { region: REGION, timeoutSeconds: 30, enforceAppCheck: true },
  async (request) => {
    const uid = requireAccount(request.auth);
    const subscribed = request.data?.subscribed;
    const source = request.data?.source;
    if (typeof subscribed !== "boolean" || typeof source !== "string" || !sources.has(source))
      throw new HttpsError("invalid-argument", "Invalid newsletter preference.");
    const user = await getAuth().getUser(uid);
    if (!user.email) throw new HttpsError("failed-precondition", "This account has no email address.");
    const subscriptionReference = db.collection("newsletterSubscriptions").doc(uid);
    if (!subscribed) {
      await db.runTransaction(async (transaction) => {
        await assertAccountMutationAllowedInTransaction(transaction, uid);
        transaction.set(subscriptionReference, {
          uid,
          email: user.email!.toLowerCase(),
          status: "unsubscribed",
          source,
          consentVersion: "2026-08-14",
          unsubscribedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      return { status: "unsubscribed", welcomeQueued: false };
    }
    requireMailConfiguration();
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const tokenReference = db.collection("newsletterUnsubscribeTokens").doc(tokenHash);
    const mailReference = db.collection("mail").doc();
    const currentBrand = brand();
    const unsubscribeUrl = `https://${REGION}-virtualartplattform.cloudfunctions.net/unsubscribeAuraNewsletter?token=${token}`;
    let welcomeQueued = false;
    await db.runTransaction(async (transaction) => {
      await assertAccountMutationAllowedInTransaction(transaction, uid);
      const existing = await transaction.get(subscriptionReference);
      const existingData = existing.data();
      const rotateToken = shouldRotateNewsletterToken(existingData);
      const welcomeVersion = Number.isSafeInteger(existingData?.welcomeVersion)
        ? Number(existingData?.welcomeVersion)
        : 0;
      const tokenVersion = nextNewsletterTokenVersion(existingData?.unsubscribeTokenVersion);
      welcomeQueued = false;
      transaction.set(subscriptionReference, {
        uid,
        email: user.email!.toLowerCase(),
        status: "subscribed",
        source,
        consentVersion: "2026-08-14",
        consentedAt: FieldValue.serverTimestamp(),
        unsubscribedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
        welcomeVersion: rotateToken ? welcomeVersion + 1 : Math.max(1, welcomeVersion),
        ...(rotateToken ? { unsubscribeTokenVersion: tokenVersion } : {}),
      }, { merge: true });
      if (!rotateToken) return;
      welcomeQueued = true;
      transaction.create(tokenReference, {
        uid,
        version: tokenVersion,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + NEWSLETTER_UNSUBSCRIBE_TOKEN_TTL_MS),
        usedAt: null,
      });
      transaction.create(mailReference, {
        to: [user.email],
        accountUid: uid,
        message: welcomeMail(currentBrand, {
          displayName: user.displayName,
          unsubscribeUrl,
        }),
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return { status: "subscribed", welcomeQueued };
  },
);

function responsePage(message: string, confirmationToken?: string) {
  const appUrl = brand().appUrl;
  const confirmation = confirmationToken
    ? `<form action="https://${REGION}-virtualartplattform.cloudfunctions.net/unsubscribeAuraNewsletter" method="post"><input type="hidden" name="token" value="${confirmationToken}"><button type="submit" style="border:0;margin-top:18px;padding:15px 20px;background:#1b1c19;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:1px;cursor:pointer">Confirm unsubscribe</button></form>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Newsletter preference | LIEUVA</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#151613;color:#efeee8;font-family:Arial,sans-serif"><main style="width:min(560px,calc(100% - 48px));padding:42px;background:#efeee8;color:#1b1c19"><p style="font-size:10px;letter-spacing:2px;text-transform:uppercase">LIEUVA account</p><h1 style="font:48px/1 Georgia,serif">You are in control.</h1><p style="color:#63655d;line-height:1.7">${message}</p>${confirmation}<a href="${appUrl}" style="display:inline-block;margin-top:18px;padding:15px 20px;background:#1b1c19;color:#fff;text-decoration:none;font-size:11px;text-transform:uppercase;letter-spacing:1px">Return to LIEUVA →</a></main></body></html>`;
}

export const unsubscribeAuraNewsletter = onRequest(
  {
    region: REGION,
    timeoutSeconds: 30,
    memory: "128MiB",
    concurrency: 10,
    maxInstances: 2,
  },
  async (request, response) => {
    response.set("Cache-Control", "no-store");
    response.set("Content-Security-Policy", "default-src 'none'; form-action 'self' https://europe-west1-virtualartplattform.cloudfunctions.net; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
    response.set("Referrer-Policy", "no-referrer");
    response.set("X-Frame-Options", "DENY");
    response.set("X-Content-Type-Options", "nosniff");
    const intent = newsletterUnsubscribeRequest(request.method);
    if (intent === "reject") {
      response.set("Allow", "GET, POST");
      response.status(405).send(responsePage("This link accepts a browser visit and confirmation."));
      return;
    }
    if (intent === "execute" && !newsletterUnsubscribeRequestLimiter.allow(Date.now())) {
      response.set("Retry-After", "60");
      response.status(429).send(responsePage("Too many preference requests. Wait one minute and try again."));
      return;
    }
    const token = intent === "confirm"
      ? (typeof request.query.token === "string" ? request.query.token : "")
      : (typeof request.body?.token === "string" ? request.body.token : "");
    if (!/^[a-f0-9]{64}$/.test(token)) {
      response.status(200).send(responsePage("The preference link is invalid or has already been used."));
      return;
    }
    // Link scanners may issue GET requests. GET only renders an explicit
    // confirmation; the state-changing bearer action is POST-only.
    if (intent === "confirm") {
      response.status(200).send(responsePage(
        "Confirm that you no longer want to receive LIEUVA product letters.",
        token,
      ));
      return;
    }
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const tokenReference = db.collection("newsletterUnsubscribeTokens").doc(tokenHash);
    let changed = false;
    await db.runTransaction(async (transaction) => {
      const tokenSnapshot = await transaction.get(tokenReference);
      const data = tokenSnapshot.data();
      if (!data || typeof data.uid !== "string") return;
      const subscriptionReference = db.collection("newsletterSubscriptions").doc(data.uid);
      const subscriptionSnapshot = await transaction.get(subscriptionReference);
      await assertAccountMutationAllowedInTransaction(transaction, data.uid);
      if (
        subscriptionSnapshot.data()?.status !== "subscribed"
        || unsubscribeTokenState(data, subscriptionSnapshot.data()) !== "active"
      ) return;
      transaction.set(subscriptionReference, {
        status: "unsubscribed",
        unsubscribedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.update(tokenReference, { usedAt: FieldValue.serverTimestamp() });
      changed = true;
    });
    response.status(200).send(responsePage(changed
      ? "You will no longer receive LIEUVA product letters. Your account and Spaces stay untouched."
      : "This preference was already handled. Your account and Spaces stay untouched."));
  },
);

/** Browser-native CSP intake. Application payload logs deliberately retain no
 * raw body, headers, query parameters, or full URL. Provider request/access
 * logs remain governed by their separately documented retention controls. */
export const lieuvaCspReport = onRequest(
  {
    region: REGION,
    timeoutSeconds: 10,
    memory: "128MiB",
    maxInstances: 2,
    invoker: "public",
  },
  (request, response) => {
    response.set("Cache-Control", "no-store");
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "POST") {
      response.set("Allow", "POST");
      response.status(405).send("Method not allowed");
      return;
    }
    if (!isCspReportMediaType(request.get("content-type"))) {
      response.status(415).send("Unsupported report type");
      return;
    }
    const bodyBytes = Buffer.isBuffer(request.rawBody)
      ? request.rawBody.byteLength
      : Number(request.get("content-length") ?? 0);
    try {
      const reports = parseCspViolationReports(decodeCspReportBody(request.body), bodyBytes);
      const now = Date.now();
      for (const report of reports) {
        if (!cspReportLogLimiter.allow(report, now)) continue;
        logger.warn("lieuva_csp_violation", {
          schema: "lieuva_csp_violation_v1",
          ...report,
        });
      }
      response.status(204).send();
    } catch (error) {
      const oversized = error instanceof Error && error.message === "csp-report-size-invalid";
      response.status(oversized ? 413 : 400).send(oversized ? "Report too large" : "Invalid report");
    }
  },
);

/** Privacy-aware HTML delivery for canonical customer-facing Space URLs. */
export const spaceDocument = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    const startedAt = Date.now();
    response.set("Content-Type", "text/html; charset=utf-8");
    response.set("Vary", "Accept-Encoding");
    response.set("X-Content-Type-Options", "nosniff");
    response.set("Content-Security-Policy-Report-Only", APP_CONTENT_SECURITY_POLICY);
    response.set("Reporting-Endpoints", APP_REPORTING_ENDPOINTS);
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).send("Method not allowed");
      return;
    }
    const spaceId = requestSpaceId(request.path, "spaces");
    let delivery: SpaceDelivery = { kind: "not-found", ...(spaceId ? { id: spaceId } : {}) };
    try {
      if (spaceId) {
        delivery = classifySpaceForDelivery(spaceId, await publicDeliveryManifest(spaceId));
      }
      const metadata = metadataForSpace(delivery);
      response.set("Cache-Control", cacheControlForSpace(delivery));
      response.set("X-Robots-Tag", metadata.robots);
      response.status(metadata.status).send(renderSpaceDocument(generatedAppShell(), delivery));
      logOperation("space_document", "success", startedAt, { resourceRef: safeResourceRef(spaceId), delivery: delivery.kind });
    } catch (error) {
      delivery = { kind: "temporary-error", ...(spaceId ? { id: spaceId } : {}) };
      const metadata = metadataForSpace(delivery);
      response.set("Cache-Control", cacheControlForSpace(delivery));
      response.set("X-Robots-Tag", metadata.robots);
      response.status(503).send(genericErrorShell(delivery));
      logOperation("space_document", "failure", startedAt, { resourceRef: safeResourceRef(spaceId), errorClass: classifyServerError(error) });
    }
  },
);

/** Server-rendered Creator route. Aliases redirect to one canonical handle and
 * non-public profiles return generic, noindex HTML. */
export const creatorDocument = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    const startedAt = Date.now();
    response.set("Content-Type", "text/html; charset=utf-8");
    response.set("X-Content-Type-Options", "nosniff");
    response.set("Content-Security-Policy-Report-Only", APP_CONTENT_SECURITY_POLICY);
    response.set("Reporting-Endpoints", APP_REPORTING_ENDPOINTS);
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).send("Method not allowed");
      return;
    }
    const route = classifyCreatorDocumentRoute(request.path);
    try {
      if (route.kind === "hub") {
        response.set("Cache-Control", "private, no-store, max-age=0");
        response.set("X-Robots-Tag", "noindex,nofollow,noarchive");
        response.status(200).send(renderCreatorHubDocument(generatedAppShell()));
        logOperation("creator_document", "success", startedAt, { delivery: "hub" });
        return;
      }
      if (route.kind === "directory") {
        response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
        response.set("X-Robots-Tag", "index,follow,max-image-preview:large");
        response.status(200).send(renderCreatorDirectoryDocument(generatedAppShell()));
        logOperation("creator_document", "success", startedAt, { delivery: "directory" });
        return;
      }
      if (route.kind === "malformed") {
        response.set("Cache-Control", "private, no-store, max-age=0");
        response.set("X-Robots-Tag", "noindex,nofollow,noarchive");
        response.status(404).send(request.path.startsWith("/creator-hub/")
          ? renderCreatorHubDocument(generatedAppShell())
          : renderCreatorDocument(generatedAppShell(), { kind: "not-found" }));
        logOperation("creator_document", "success", startedAt, { delivery: "not-found" });
        return;
      }
      const requestedHandle = route.handle;
      const delivery = await creatorDeliveryForHandle(requestedHandle);
      if (delivery.kind === "public" && requestedHandle !== delivery.profile.handle) {
        response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
        response.redirect(301, creatorCanonicalUrl(delivery.profile.handle));
        return;
      }
      response.set("Cache-Control", delivery.kind === "public"
        ? "public, max-age=0, s-maxage=60, must-revalidate"
        : "private, no-store, max-age=0");
      response.set("X-Robots-Tag", delivery.kind === "public"
        ? "index,follow,max-image-preview:large"
        : "noindex,nofollow,noarchive");
      response.status(delivery.kind === "public" ? 200 : 404)
        .send(renderCreatorDocument(generatedAppShell(), delivery));
      logOperation("creator_document", "success", startedAt, { delivery: delivery.kind });
    } catch (error) {
      const delivery: CreatorDelivery = { kind: "temporary-error" };
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.set("X-Robots-Tag", "noindex,nofollow,noarchive");
      response.status(503).send(renderCreatorDocument(generatedAppShell(), delivery));
      logOperation("creator_document", "failure", startedAt, { errorClass: classifyServerError(error) });
    }
  },
);

/** Narrow public JSON projection consumed by the lightweight Creator page. */
export const creatorProfileData = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    response.set("Content-Type", "application/json; charset=utf-8");
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).json({ error: "method-not-allowed" });
      return;
    }
    const handle = requestRouteValue(request.path, "creator-profiles", ".json");
    try {
      const delivery = await creatorDeliveryForHandle(handle);
      const payload = publicCreatorPayload(delivery);
      if (!payload) {
        response.set("Cache-Control", "private, no-store, max-age=0");
        response.status(404).json({ error: "not-found" });
        return;
      }
      response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      response.status(200).json(payload);
    } catch {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.status(503).json({ error: "temporary-error" });
    }
  },
);

/** Public, minimal Creator directory used by the shared Space/Creator search.
 * Private profiles and internal Creator/account identifiers never leave this boundary. */
export const creatorDirectoryData = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    response.set("Content-Type", "application/json; charset=utf-8");
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).json({ error: "method-not-allowed" });
      return;
    }
    try {
      const snapshot = await db.collection("creatorProfiles")
        .where("profilePublic", "==", true)
        .where("discoverEligible", "==", true)
        .select("handle", "displayName", "bio", "links", "profilePublic", "discoverEligible", "imagePresent", "coverPresent", "bioFont", "profileTone", "followerCount")
        .limit(500)
        .get();
      const creators = snapshot.docs
        .flatMap((document) => {
          const entry = publicCreatorDirectoryEntry(document.data());
          return entry ? [entry] : [];
        })
        .sort((left, right) => left.displayName.localeCompare(right.displayName));
      response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      response.status(200).json({ schemaVersion: 1, creators });
    } catch {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.status(503).json({ error: "temporary-error" });
    }
  },
);

/** Public image proxy. It checks current profile visibility before serving and
 * never discloses the backing object path. */
export const creatorImage = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).send("Method not allowed");
      return;
    }
    const handle = requestRouteValue(request.path, "creator-images", ".webp");
    try {
      const normalized = normalizeCreatorHandle(handle);
      if (!normalized) throw new Error("not-found");
      const handleSnapshot = await db.collection("creatorHandles").doc(normalized).get();
      const creatorId = handleSnapshot.data()?.creatorId;
      if (typeof creatorId !== "string") throw new Error("not-found");
      const profile = parseCreatorProfileInput((await db.collection("creatorProfiles").doc(creatorId).get()).data());
      if (!isReviewedPublicCreatorProfile(profile) || !profile.imagePresent) throw new Error("not-found");
      const [bytes] = await getStorage().bucket().file(`creator-public/${creatorId}/avatar.webp`).download();
      response.set("Content-Type", "image/webp");
      response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      response.status(200).send(request.method === "HEAD" ? undefined : bytes);
    } catch {
      response.set("Cache-Control", "private, no-store");
      response.status(404).send("Not found");
    }
  },
);

/** Public cover proxy. It checks profile visibility before serving title art. */
export const creatorCover = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).send("Method not allowed");
      return;
    }
    const handle = requestRouteValue(request.path, "creator-covers", ".webp");
    try {
      const normalized = normalizeCreatorHandle(handle);
      if (!normalized) throw new Error("not-found");
      const handleSnapshot = await db.collection("creatorHandles").doc(normalized).get();
      const creatorId = handleSnapshot.data()?.creatorId;
      if (typeof creatorId !== "string") throw new Error("not-found");
      const profile = parseCreatorProfileInput((await db.collection("creatorProfiles").doc(creatorId).get()).data());
      if (!isReviewedPublicCreatorProfile(profile) || !profile.coverPresent) throw new Error("not-found");
      const [bytes] = await getStorage().bucket().file(`creator-public/${creatorId}/cover.webp`).download();
      response.set("Content-Type", "image/webp");
      response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      response.status(200).send(request.method === "HEAD" ? undefined : bytes);
    } catch {
      response.set("Cache-Control", "private, no-store");
      response.status(404).send("Not found");
    }
  },
);

/** Gallery attribution is resolved server-side so public UI never derives a
 * Creator URL from an owner UID. */
export const creatorAttribution = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    response.set("Content-Type", "application/json; charset=utf-8");
    response.set("X-Content-Type-Options", "nosniff");
    const spaceId = requestRouteValue(request.path, "creator-attributions", ".json");
    if ((request.method !== "GET" && request.method !== "HEAD") || !spaceId) {
      response.status(request.method === "GET" || request.method === "HEAD" ? 404 : 405).json({ error: "not-found" });
      return;
    }
    try {
      const gallery = await publicDeliveryManifest(spaceId);
      const delivery = classifySpaceForDelivery(spaceId, gallery);
      const ownerId = gallery?.ownerId;
      if (delivery.kind !== "public" || !delivery.indexEligible || typeof ownerId !== "string")
        throw new Error("not-public");
      const owner = await db.collection("creatorAccountOwners").doc(ownerId).get();
      const creatorId = owner.data()?.creatorId;
      if (typeof creatorId !== "string") throw new Error("no-creator");
      const profileSnapshot = await db.collection("creatorProfiles").doc(creatorId).get();
      const profile = parseCreatorProfileInput(profileSnapshot.data());
      if (!isReviewedPublicCreatorProfile(profile)) throw new Error("private-creator");
      response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      response.status(200).json({
        schemaVersion: 1,
        displayName: profile.displayName,
        handle: profile.handle,
        profileUrl: creatorCanonicalUrl(profile.handle),
      });
    } catch {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.status(404).json({ error: "not-found" });
    }
  },
);

/** Public cover proxy. Storage paths and protected Space media never enter metadata. */
export const spaceCard = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    const startedAt = Date.now();
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).send("Method not allowed");
      return;
    }
    const spaceId = requestSpaceId(request.path, "space-cards");
    if (!spaceId) {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.status(404).send("Not found");
      return;
    }
    try {
      const delivery = classifySpaceForDelivery(spaceId, await publicDeliveryManifest(spaceId));
      if (delivery.kind !== "public") {
        response.set("Cache-Control", "private, no-store, max-age=0");
        response.status(404).send("Not found");
        logOperation("space_card", "rejected", startedAt, { resourceRef: safeResourceRef(spaceId), delivery: delivery.kind });
        return;
      }
      if (!delivery.coverPath) {
        response.set("Cache-Control", "public, max-age=60, s-maxage=60, must-revalidate");
        response.redirect(302, SPACE_CARD_FALLBACK);
        return;
      }
      const file = getStorage().bucket().file(delivery.coverPath);
      const [metadata] = await file.getMetadata();
      const contentType = metadata.contentType ?? "";
      const size = Number(metadata.size ?? 0);
      if (!new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]).has(contentType) || size > 2 * 1024 * 1024)
        throw new Error("Invalid public cover metadata.");
      const [image] = await file.download();
      response.set("Content-Type", contentType);
      response.set("Content-Length", String(image.length));
      response.set("Cache-Control", "public, max-age=60, s-maxage=60, must-revalidate");
      if (metadata.etag) response.set("ETag", metadata.etag);
      response.status(200).send(image);
      logOperation("space_card", "success", startedAt, { resourceRef: safeResourceRef(spaceId), delivery: "public" });
    } catch (error) {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.status(404).send("Not found");
      logOperation("space_card", "failure", startedAt, { resourceRef: safeResourceRef(spaceId), errorClass: classifyServerError(error) });
    }
  },
);

/** Canonical, public-only sitemap generated from the current publication state. */
export const spaceSitemap = onRequest(
  { region: REGION, timeoutSeconds: 30, memory: "256MiB", invoker: "public" },
  async (request, response) => {
    const startedAt = Date.now();
    response.set("Content-Type", "application/xml; charset=utf-8");
    response.set("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.set("Allow", "GET, HEAD");
      response.status(405).send("Method not allowed");
      return;
    }
    try {
      const expiryFloor = new Date();
      const [modern, legacy] = await Promise.all([
        db.collection("galleries")
          .where("visibility", "==", "public")
          .where("discoverEligible", "==", true)
          .where("expiresAt", ">", expiryFloor)
          .orderBy("expiresAt", "desc")
          .limit(500)
          .select(...publicDeliveryFields)
          .get(),
        db.collection("galleries")
          .where("schemaVersion", "in", [1, 2])
          .where("discoverEligible", "==", true)
          .where("expiresAt", ">", expiryFloor)
          .orderBy("expiresAt", "desc")
          .limit(500)
          .select(...publicDeliveryFields)
          .get(),
      ]);
      const documents = new Map([...modern.docs, ...legacy.docs].map((document) => [document.id, document]));
      const spaces = [...documents.values()]
        .map((document) => classifySpaceForDelivery(document.id, document.data()))
        .filter((delivery): delivery is PublicSpaceDelivery => delivery.kind === "public");
      const creatorProfiles = await db.collection("creatorProfiles")
        .where("profilePublic", "==", true)
        .where("discoverEligible", "==", true)
        .limit(500)
        .get();
      const creators = creatorProfiles.docs.flatMap((document) => {
        const profile = parseCreatorProfileInput(document.data());
        if (!isReviewedPublicCreatorProfile(profile)) return [];
        const updated = timestampMilliseconds(document.data().updatedAt);
        return [{
          handle: profile.handle,
          ...(updated !== undefined ? { updatedAt: new Date(updated).toISOString() } : {}),
        }];
      });
      response.set("Cache-Control", "public, max-age=0, s-maxage=60, must-revalidate");
      response.status(200).send(renderPublicSitemap(spaces, creators));
      logOperation("space_sitemap", "success", startedAt, { count: spaces.length + creators.length });
    } catch (error) {
      response.set("Cache-Control", "private, no-store, max-age=0");
      response.set("X-Robots-Tag", "noindex");
      response.status(503).send(renderPublicSitemap([]));
      logOperation("space_sitemap", "failure", startedAt, { errorClass: classifyServerError(error) });
    }
  },
);
