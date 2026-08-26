export type PortableValue =
  | null
  | boolean
  | number
  | string
  | PortableValue[]
  | { [key: string]: PortableValue };

export type AccountExportInput = {
  generatedAt: string;
  account: Record<string, unknown>;
  profile?: Record<string, unknown>;
  newsletter?: Record<string, unknown>;
  publicationUsage?: Record<string, unknown>;
  ownedSpaces: Array<{
    id: string;
    manifest: Record<string, unknown>;
    members: Array<Record<string, unknown>>;
    media: Array<Record<string, unknown>>;
  }>;
  sharedSpaces: Array<Record<string, unknown>>;
  receivedInvitations: Array<Record<string, unknown>>;
  sentInvitations: Array<Record<string, unknown>>;
  operationalState: Record<string, unknown>;
  creatorIdentity?: Record<string, unknown>;
};

export type AccountDeletionPlan = {
  uid: string;
  ownedGalleryIds: string[];
  membershipPaths: string[];
  invitePaths: string[];
  documentPaths: string[];
};

export type AccountDeletionSummary = {
  ownedSpacesDeleted: number;
  sharedMembershipsRemoved: number;
  invitationsRemoved: number;
  linkedDocumentsRemoved: number;
  authenticationDeleted: boolean;
};

export type AccountDeletionExecutor = {
  phase: (name: string) => Promise<void>;
  markOwnedSpaces: (galleryIds: string[]) => Promise<void>;
  deleteOwnedSpaceAssets: (uid: string, galleryId: string) => Promise<void>;
  deleteOwnedSpace: (galleryId: string) => Promise<void>;
  removeMembership: (path: string) => Promise<void>;
  removeInvitation: (path: string) => Promise<void>;
  deleteAvatar: (uid: string) => Promise<void>;
  removeLinkedDocument: (path: string) => Promise<void>;
  deleteAuthentication: (uid: string) => Promise<void>;
  finish: (summary: AccountDeletionSummary) => Promise<void>;
};

const sensitiveKeys = new Set([
  "token",
  "tokenHash",
  "password",
  "secret",
  "accessToken",
  "refreshToken",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/** Convert Firestore/Auth-shaped values to deterministic JSON without secrets. */
export function portableValue(value: unknown, depth = 0): PortableValue {
  if (depth > 20 || value === undefined || typeof value === "function" || typeof value === "symbol")
    return null;
  if (value === null || typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => portableValue(item, depth + 1));
  if (isRecord(value)) {
    const timestamp = value as { toDate?: () => Date };
    if (typeof timestamp.toDate === "function") {
      const date = timestamp.toDate();
      return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
    }
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !sensitiveKeys.has(key))
        .map(([key, item]) => [key, portableValue(item, depth + 1)]),
    );
  }
  return String(value);
}

function role(value: unknown) {
  return value === "owner" || value === "editor" || value === "viewer" ? value : "viewer";
}

function invitationExport(value: Record<string, unknown>, direction: "received" | "sent") {
  return portableValue({
    direction,
    galleryId: value.galleryId,
    galleryTitle: value.galleryTitle,
    role: role(value.role),
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    expiresAt: value.expiresAt,
    acceptedAt: value.acceptedAt,
  });
}

/**
 * Build the server portion of the account export. Collaborator email addresses
 * and invitation targets are intentionally excluded from another user's export.
 */
export function buildAccountExport(input: AccountExportInput): PortableValue {
  return portableValue({
    format: "aura-account-export",
    schemaVersion: 1,
    exportedAt: input.generatedAt,
    account: input.account,
    profile: input.profile ?? null,
    newsletter: input.newsletter ?? null,
    publicationUsage: input.publicationUsage ?? null,
    ownedSpaces: input.ownedSpaces.map((space) => ({
      id: space.id,
      manifest: space.manifest,
      access: {
        members: space.members.map((member) => ({
          role: role(member.role),
          status: member.status,
          addedAt: member.addedAt,
        })),
      },
      media: space.media,
    })),
    sharedSpaces: input.sharedSpaces.map((space) => ({
      galleryId: space.galleryId,
      role: role(space.role),
      status: space.status,
      addedAt: space.addedAt,
    })),
    invitations: {
      received: input.receivedInvitations.map((invite) => invitationExport(invite, "received")),
      sent: input.sentInvitations.map((invite) => invitationExport(invite, "sent")),
    },
    operationalState: input.operationalState,
    creatorIdentity: input.creatorIdentity ?? null,
    localBrowserData: {
      includedByClient: true,
      note: "Account-linked drafts from this browser are appended when the file is downloaded.",
    },
  });
}

export function assertRecentAuthentication(
  authTimeSeconds: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
  maximumAgeSeconds = 10 * 60,
) {
  if (
    typeof authTimeSeconds !== "number" ||
    !Number.isFinite(authTimeSeconds) ||
    authTimeSeconds > nowSeconds + 60 ||
    nowSeconds - authTimeSeconds > maximumAgeSeconds
  ) {
    throw new Error("recent-authentication-required");
  }
}

export function assertAccountAccess(uid: unknown, signInProvider: unknown) {
  if (typeof uid !== "string" || !uid || signInProvider === "anonymous")
    throw new Error("account-required");
  return uid;
}

/**
 * Cross-service deletion cannot be atomic. This ordered, idempotent plan keeps
 * Auth until every user-data phase has completed and marks owned Spaces before
 * media removal so partially deleted publications cannot remain publicly live.
 */
export async function executeAccountDeletion(
  plan: AccountDeletionPlan,
  executor: AccountDeletionExecutor,
): Promise<AccountDeletionSummary> {
  const summary: AccountDeletionSummary = {
    ownedSpacesDeleted: 0,
    sharedMembershipsRemoved: 0,
    invitationsRemoved: 0,
    linkedDocumentsRemoved: 0,
    authenticationDeleted: false,
  };
  await executor.phase("mark-owned-spaces");
  await executor.markOwnedSpaces(plan.ownedGalleryIds);
  await executor.phase("delete-owned-spaces");
  for (const galleryId of plan.ownedGalleryIds) {
    await executor.deleteOwnedSpaceAssets(plan.uid, galleryId);
    await executor.deleteOwnedSpace(galleryId);
    summary.ownedSpacesDeleted += 1;
  }
  await executor.phase("remove-shared-access");
  for (const path of plan.membershipPaths) {
    await executor.removeMembership(path);
    summary.sharedMembershipsRemoved += 1;
  }
  await executor.phase("remove-invitations");
  for (const path of plan.invitePaths) {
    await executor.removeInvitation(path);
    summary.invitationsRemoved += 1;
  }
  await executor.phase("remove-account-data");
  await executor.deleteAvatar(plan.uid);
  for (const path of plan.documentPaths) {
    await executor.removeLinkedDocument(path);
    summary.linkedDocumentsRemoved += 1;
  }
  await executor.phase("delete-authentication");
  await executor.deleteAuthentication(plan.uid);
  summary.authenticationDeleted = true;
  await executor.finish(summary);
  return summary;
}
