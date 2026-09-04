import { createHash } from "node:crypto";

export const ACCOUNT_DELETION_SCHEMA_VERSION = 2 as const;
export const ACCOUNT_DELETION_PAGE_SIZE = 200;
// Both callable and scheduled workers have a five-minute execution ceiling.
// The lease includes a full extra five-minute safety margin so an invocation
// cannot be overtaken while it is still allowed to run.
export const ACCOUNT_DELETION_LEASE_MS = 10 * 60_000;
// Provisional operational receipt only. Legal retention questions remain open,
// so the Auth UID-keyed completion tombstone is intentionally short-lived.
export const ACCOUNT_DELETION_TOMBSTONE_TTL_MS = 24 * 60 * 60_000;

export const ACCOUNT_DELETION_PHASES = [
  "publication-permits",
  "owned-revision-permits",
  "uploaded-revision-permits",
  "asset-retirements",
  "owned-galleries",
  "shared-memberships",
  "shared-memberships-by-account",
  "sent-invitations",
  "received-invitations",
  "received-invitations-by-account",
  "export-chunks",
  "creator-outgoing-follows",
  "creator-incoming-follows",
  "creator-comments",
  "creator-reactions",
  "creator-posts",
  "creator-blocks-out",
  "creator-blocks-in",
  "creator-reports-by-account",
  "creator-reports-by-creator",
  "creator-reports-against",
  "creator-notification-actors",
  "creator-notifications",
  "creator-handles",
  "unsubscribe-tokens",
  "queued-mail",
  "account-documents",
  "account-media",
  "creator-roots",
  "authentication",
  "complete",
] as const;

export type AccountDeletionPhase = typeof ACCOUNT_DELETION_PHASES[number];

export type AccountDeletionJobState = {
  schemaVersion: typeof ACCOUNT_DELETION_SCHEMA_VERSION;
  uid: string;
  deletionId: string;
  status: "running" | "complete";
  phase: AccountDeletionPhase;
  email?: string;
  creatorId?: string;
  currentGalleryId?: string;
  currentGalleryStage?: "members" | "storage" | "invitations" | "revision-permits" | "legacy-artworks" | "delete";
  currentPermitPath?: string;
  currentPermitPrefix?: string;
  currentPermitOwnerId?: string;
  currentPermitExternalOwner?: boolean;
  currentPostId?: string;
  currentPostStage?: "comments" | "reactions" | "delete";
};

const safeUid = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const safeId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const safeDeletionId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
/** Existing gallery documents may predate the strict publication-ID format.
 * Accept every bounded direct Firestore document segment here so one legacy ID
 * cannot permanently wedge export or account deletion. */
export function parsePersistedGalleryDocumentId(value: unknown) {
  return typeof value === "string" && value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= 1_500 && !value.includes("/")
    ? value
    : undefined;
}
const safeEmail = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 320 && /^[^\s@]+@[^\s@]+$/.test(value);
const safeDocumentPath = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 1_024 && value.split("/").length % 2 === 0;
const safeStoragePrefix = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 1_024 && value.startsWith("published/") && value.endsWith("/");

/** Resolve an existing invitation recipient for the transactional deletion
 * fence. A genuinely absent Auth user has no account to fence; all other Auth
 * failures remain fail-closed. */
export async function existingAuthUidForDeletionFence(
  email: string,
  lookup: (email: string) => Promise<{ uid: unknown }>,
) {
  try {
    const { uid } = await lookup(email);
    if (!safeUid(uid)) throw new Error("auth-user-invalid");
    return uid;
  } catch (error) {
    if (accountDeletionAuthenticationAlreadyMissing(error)) return undefined;
    throw error;
  }
}

export function accountDeletionPseudonymousReportId(
  deletionId: string,
  existingReportId: string,
) {
  if (!safeDeletionId(deletionId) || !existingReportId || existingReportId.length > 1_500 || existingReportId.includes("/"))
    throw new Error("deletion-report-id-invalid");
  return createHash("sha256")
    .update(`deleted-report:${deletionId}:${existingReportId}`)
    .digest("hex");
}

export function assertAccountDeletionJobState(value: unknown, uid: string): AccountDeletionJobState {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("deletion-job-state-invalid");
  const data = value as Record<string, unknown>;
  if (
    data.schemaVersion !== ACCOUNT_DELETION_SCHEMA_VERSION ||
    !safeUid(data.uid) || data.uid !== uid || !safeDeletionId(data.deletionId) ||
    !ACCOUNT_DELETION_PHASES.includes(data.phase as AccountDeletionPhase) ||
    (data.status !== "running" && data.status !== "complete")
  ) throw new Error("deletion-job-state-invalid");
  if (data.status === "complete" && data.phase !== "complete")
    throw new Error("deletion-job-state-invalid");
  if (data.status === "running" && data.phase === "complete")
    throw new Error("deletion-job-state-invalid");
  const has = (key: string) => Object.prototype.hasOwnProperty.call(data, key);
  if ((has("email") && !safeEmail(data.email)) ||
    (has("creatorId") && !safeId(data.creatorId)) ||
    (has("currentGalleryId") && !parsePersistedGalleryDocumentId(data.currentGalleryId)) ||
    (has("currentGalleryStage") && ![
      "members", "storage", "invitations", "revision-permits", "legacy-artworks", "delete",
    ].includes(String(data.currentGalleryStage))) ||
    (has("currentPermitPath") && !safeDocumentPath(data.currentPermitPath)) ||
    (has("currentPermitPrefix") && !safeStoragePrefix(data.currentPermitPrefix)) ||
    (has("currentPermitOwnerId") && !safeUid(data.currentPermitOwnerId)) ||
    (has("currentPermitExternalOwner") && typeof data.currentPermitExternalOwner !== "boolean") ||
    (has("currentPostId") && !safeId(data.currentPostId)) ||
    (has("currentPostStage") && !["comments", "reactions", "delete"].includes(String(data.currentPostStage))))
    throw new Error("deletion-job-state-invalid");
  const galleryPointers = ["currentGalleryId", "currentGalleryStage"].map(has);
  const permitPointers = [
    "currentPermitPath", "currentPermitPrefix", "currentPermitOwnerId", "currentPermitExternalOwner",
  ].map(has);
  const postPointers = ["currentPostId", "currentPostStage"].map(has);
  const isAllOrNone = (pointers: boolean[]) => pointers.every(Boolean) || pointers.every((present) => !present);
  if (!isAllOrNone(galleryPointers) || !isAllOrNone(permitPointers) || !isAllOrNone(postPointers) ||
    (galleryPointers[0] && data.phase !== "owned-galleries") ||
    (permitPointers[0] && ![
      "publication-permits", "owned-revision-permits", "uploaded-revision-permits",
    ].includes(String(data.phase))) ||
    (postPointers[0] && data.phase !== "creator-posts") ||
    (data.status === "complete" && (has("email") || has("creatorId") ||
      galleryPointers[0] || permitPointers[0] || postPointers[0])))
    throw new Error("deletion-job-state-invalid");
  const result: AccountDeletionJobState = {
    schemaVersion: ACCOUNT_DELETION_SCHEMA_VERSION,
    uid,
    deletionId: data.deletionId,
    status: data.status as AccountDeletionJobState["status"],
    phase: data.phase as AccountDeletionPhase,
  };
  if (safeEmail(data.email)) result.email = data.email;
  if (safeId(data.creatorId)) result.creatorId = data.creatorId;
  const currentGalleryId = parsePersistedGalleryDocumentId(data.currentGalleryId);
  if (currentGalleryId) result.currentGalleryId = currentGalleryId;
  if (["members", "storage", "invitations", "revision-permits", "legacy-artworks", "delete"].includes(String(data.currentGalleryStage)))
    result.currentGalleryStage = data.currentGalleryStage as NonNullable<AccountDeletionJobState["currentGalleryStage"]>;
  if (safeDocumentPath(data.currentPermitPath)) result.currentPermitPath = data.currentPermitPath;
  if (safeStoragePrefix(data.currentPermitPrefix)) result.currentPermitPrefix = data.currentPermitPrefix;
  if (safeUid(data.currentPermitOwnerId)) result.currentPermitOwnerId = data.currentPermitOwnerId;
  if (typeof data.currentPermitExternalOwner === "boolean") result.currentPermitExternalOwner = data.currentPermitExternalOwner;
  if (safeId(data.currentPostId)) result.currentPostId = data.currentPostId;
  if (["comments", "reactions", "delete"].includes(String(data.currentPostStage)))
    result.currentPostStage = data.currentPostStage as NonNullable<AccountDeletionJobState["currentPostStage"]>;
  return result;
}

/** Rebuilds destructive authority from the claimed permit instead of trusting
 * a mutable deletion checkpoint to name an arbitrary Storage prefix. */
export function accountDeletionPermitAuthority(
  state: AccountDeletionJobState,
  permitPath: string,
  permit: Record<string, unknown>,
) {
  const path = permitPath.split("/");
  const initial = state.phase === "publication-permits";
  const revision = state.phase === "owned-revision-permits" || state.phase === "uploaded-revision-permits";
  const expectedCollection = initial ? "galleryPublishPermits" : revision ? "galleryRevisionPermits" : undefined;
  if (!expectedCollection || path.length !== 2 || path[0] !== expectedCollection || !safeId(path[1]))
    throw new Error("deletion-permit-authority-invalid");
  const ownerId = permit.ownerId;
  const galleryId = permit.galleryId;
  const revisionId = permit.revisionId;
  const matchesAccount = initial || state.phase === "owned-revision-permits"
    ? ownerId === state.uid
    : permit.uploaderId === state.uid;
  if (!matchesAccount || !safeUid(ownerId) || !safeId(galleryId) ||
    (revision && !safeId(revisionId)))
    throw new Error("deletion-permit-authority-invalid");
  const prefix = initial
    ? `published/${ownerId}/${galleryId}/`
    : `published/${ownerId}/${galleryId}/revisions/${revisionId}/`;
  const externalOwner = ownerId !== state.uid;
  if (state.currentPermitPath !== permitPath || state.currentPermitPrefix !== prefix ||
    state.currentPermitOwnerId !== ownerId || state.currentPermitExternalOwner !== externalOwner)
    throw new Error("deletion-permit-authority-invalid");
  return { ownerId, galleryId, prefix, externalOwner };
}

export function nextAccountDeletionPhase(phase: AccountDeletionPhase): AccountDeletionPhase {
  const index = ACCOUNT_DELETION_PHASES.indexOf(phase);
  if (index < 0 || index === ACCOUNT_DELETION_PHASES.length - 1) return "complete";
  return ACCOUNT_DELETION_PHASES[index + 1];
}

export function accountDeletionPublicStatus(state: AccountDeletionJobState) {
  return state.status === "complete"
    ? { status: "complete" as const, phase: "complete" as const }
    : { status: "running" as const, phase: state.phase };
}

export function aggregateAfterRelationRemoval(value: unknown) {
  return Math.max(0, Number.isSafeInteger(value) ? Number(value) - 1 : 0);
}

export function accountDeletionFollowRelation(
  value: Record<string, unknown> | undefined,
  deletingCreatorId: string,
) {
  if (value?.followerCreatorId !== deletingCreatorId)
    return { remove: false as const };
  return {
    remove: true as const,
    ...(safeId(value.followedCreatorId) ? { followedCreatorId: value.followedCreatorId } : {}),
  };
}

export function accountDeletionAuthenticationAlreadyMissing(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error &&
    String((error as { code?: unknown }).code) === "auth/user-not-found");
}

export function accountDeletionLeaseAvailable(
  currentExpiresAtMilliseconds: unknown,
  nowMilliseconds: number,
) {
  const current = typeof currentExpiresAtMilliseconds === "number" &&
    Number.isFinite(currentExpiresAtMilliseconds)
    ? currentExpiresAtMilliseconds
    : 0;
  return current <= nowMilliseconds;
}

export function accountMediaUploadLeaseDisposition(
  lease: Record<string, unknown> | undefined,
  leaseExpiresAtMilliseconds: number | undefined,
  uid: string,
  nowMilliseconds: number,
) {
  if (!lease) return "absent" as const;
  if (!safeUid(uid) || lease.uid !== uid || lease.schemaVersion !== 1 ||
    typeof lease.leaseId !== "string" || !/^[a-f0-9]{32}$/.test(lease.leaseId) ||
    typeof leaseExpiresAtMilliseconds !== "number" || !Number.isFinite(leaseExpiresAtMilliseconds) ||
    !Number.isFinite(nowMilliseconds))
    throw new Error("deletion-media-lease-invalid");
  return leaseExpiresAtMilliseconds > nowMilliseconds ? "active" as const : "expired" as const;
}

export function galleryManifestReferencesPrefix(
  gallery: Record<string, unknown> | undefined,
  prefix: string,
) {
  if (!gallery) return false;
  if (typeof gallery.coverPath === "string" && gallery.coverPath.startsWith(prefix)) return true;
  return Array.isArray(gallery.artworks) && gallery.artworks.some((artwork) =>
    Boolean(artwork && typeof artwork === "object" &&
      typeof (artwork as Record<string, unknown>).storagePath === "string" &&
      ((artwork as Record<string, unknown>).storagePath as string).startsWith(prefix)));
}

/** One destructive call always re-fetches page one. This prevents cursor skips
 * after deletes and makes retries naturally idempotent. */
export async function drainAccountDeletionPage<Item>({
  fetchPage,
  remove,
  limit = ACCOUNT_DELETION_PAGE_SIZE,
}: {
  fetchPage: (limit: number) => Promise<Item[]>;
  remove: (items: Item[]) => Promise<void>;
  limit?: number;
}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 400)
    throw new Error("deletion-page-limit-invalid");
  const items = await fetchPage(limit);
  if (!Array.isArray(items) || items.length > limit)
    throw new Error("deletion-page-invalid");
  if (!items.length) return { deleted: 0, complete: true };
  await remove(items);
  return { deleted: items.length, complete: false };
}
