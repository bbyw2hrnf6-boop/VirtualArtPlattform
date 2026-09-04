import { createHash } from "node:crypto";

function role(value: unknown) {
  return value === "owner" || value === "editor" || value === "viewer" ? value : "viewer";
}

/** Owner exports describe collaborator access without exporting another person's email or UID. */
export function ownedSpaceMemberBatch(
  galleryId: string,
  members: Array<Record<string, unknown>>,
) {
  return {
    galleryId,
    members: members.map((member) => ({
      role: role(member.role),
      status: member.status,
      addedAt: member.addedAt,
    })),
  };
}

/** Shared access is account data, but manifest and owner-private fields are not. */
export function sharedSpaceMembership(
  galleryId: string,
  member: Record<string, unknown>,
) {
  return {
    galleryId,
    role: role(member.role),
    status: member.status,
    addedAt: member.addedAt,
  };
}

/** Invitation addresses are deliberately omitted in both directions. */
export function accountInvitation(
  exportJobId: string,
  id: string,
  invitation: Record<string, unknown>,
  direction: "received" | "sent",
) {
  return {
    recordRef: exportScopedReference(exportJobId, "invitation", id),
    direction,
    galleryId: invitation.galleryId,
    galleryTitle: invitation.galleryTitle,
    role: role(invitation.role),
    status: invitation.status,
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
    expiresAt: invitation.expiresAt,
    acceptedAt: invitation.acceptedAt,
  };
}

export function ownedSpaceMediaBatch(
  galleryId: string,
  media: Array<{
    path: string;
    contentType?: unknown;
    size?: unknown;
    updated?: unknown;
    metadataUnavailable?: boolean;
  }>,
) {
  return {
    galleryId,
    media: media.map((item) => {
      const revisionMatch = /\/revisions\/([^/]+)\//.exec(item.path);
      return {
        path: item.path,
        contentType: item.contentType ?? null,
        sizeBytes: Number(item.size ?? 0),
        updatedAt: item.updated ?? null,
        revisionId: revisionMatch?.[1] ?? null,
        ...(item.metadataUnavailable ? { metadataUnavailable: true } : {}),
      };
    }),
  };
}

/** Cloud Storage startOffset is inclusive. Keep one look-ahead item after
 * dropping the cursor so callers can determine whether another page exists. */
export function storageObjectWindowAfterCursor<T extends { name: string }>(
  objects: readonly T[],
  cursor: string | undefined,
  maximumRecords: number,
) {
  if (!Number.isSafeInteger(maximumRecords) || maximumRecords < 1 || maximumRecords > 1_000)
    throw new Error("export-storage-window-invalid");
  return objects
    .filter((object) => cursor === undefined ||
      Buffer.compare(Buffer.from(object.name, "utf8"), Buffer.from(cursor, "utf8")) > 0)
    .slice(0, maximumRecords + 1);
}

/** A malformed legacy document must not pin a private cursor forever. */
export function safeAccountExportSourceRecord(
  project: () => unknown,
  onUnavailable?: () => void,
) {
  try {
    return project();
  } catch {
    try {
      onUnavailable?.();
    } catch {
      // Diagnostics must never make the resumable projection fail again.
    }
    return {
      recordUnavailable: true,
      reason: "malformed-source-record",
    };
  }
}

function exportScopedReference(exportJobId: string, kind: string, value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) return null;
  return `${kind}-${createHash("sha256")
    .update(`${exportJobId}\u0000${kind}\u0000${value}`)
    .digest("hex")
    .slice(0, 24)}`;
}

export function exportScopedCreatorReference(exportJobId: string, creatorId: unknown) {
  return exportScopedReference(exportJobId, "related", creatorId);
}

export function creatorRelationship(
  exportJobId: string,
  relatedCreatorId: unknown,
  data: Record<string, unknown>,
) {
  return {
    relatedCreatorRef: exportScopedCreatorReference(exportJobId, relatedCreatorId),
    createdAt: data.createdAt,
  };
}

export function creatorReport(
  exportJobId: string,
  id: string,
  data: Record<string, unknown>,
) {
  return {
    recordRef: exportScopedReference(exportJobId, "report", id),
    targetKind: data.targetKind,
    relatedCreatorRef: exportScopedCreatorReference(exportJobId, data.targetCreatorId),
    relatedPostRef: exportScopedReference(exportJobId, "post", data.postId),
    reason: data.reason,
    submissionCount: data.reportCount,
    submittedAt: data.createdAt ?? data.firstReportedAt,
    lastSubmittedAt: data.lastReportedAt,
  };
}

export function creatorComment(
  exportJobId: string,
  targetCreatorId: unknown,
  postId: string | undefined,
  data: Record<string, unknown>,
) {
  return {
    relatedCreatorRef: exportScopedCreatorReference(exportJobId, targetCreatorId),
    relatedPostRef: exportScopedReference(exportJobId, "post", postId),
    authorHandle: data.authorHandle,
    authorDisplayName: data.authorDisplayName,
    body: data.body,
    moderationStatus: data.moderationStatus,
    createdAt: data.createdAt,
  };
}

export function creatorReaction(
  exportJobId: string,
  targetCreatorId: unknown,
  postId: string | undefined,
  data: Record<string, unknown>,
) {
  return {
    relatedCreatorRef: exportScopedCreatorReference(exportJobId, targetCreatorId),
    relatedPostRef: exportScopedReference(exportJobId, "post", postId),
    createdAt: data.createdAt,
  };
}

export function creatorNotification(
  exportJobId: string,
  id: string,
  data: Record<string, unknown>,
) {
  return {
    recordRef: exportScopedReference(exportJobId, "notification", id),
    kind: data.kind,
    relatedCreatorRef: exportScopedCreatorReference(exportJobId, data.actorCreatorId),
    relatedPostRef: exportScopedReference(exportJobId, "post", data.postId),
    occurrenceCount: data.occurrenceCount,
    read: data.read,
    createdAt: data.createdAt,
    lastOccurredAt: data.lastOccurredAt,
    readAt: data.readAt,
  };
}

export type CreatorActivityExportInput = {
  following: Array<{ relatedCreatorId: unknown; data: Record<string, unknown> }>;
  blocks: Array<{ relatedCreatorId: unknown; data: Record<string, unknown> }>;
  reports: Array<{ id: string; data: Record<string, unknown> }>;
  comments: Array<{
    targetCreatorId: unknown;
    postId?: string;
    data: Record<string, unknown>;
  }>;
  reactions: Array<{
    targetCreatorId: unknown;
    postId?: string;
    data: Record<string, unknown>;
  }>;
  notifications: Array<{ id: string; data: Record<string, unknown> }>;
};

/** One shared privacy boundary for the immediate export's Creator activity. */
export function creatorActivityExport(
  exportJobId: string,
  input: CreatorActivityExportInput,
) {
  return {
    following: input.following.map(({ relatedCreatorId, data }) =>
      creatorRelationship(exportJobId, relatedCreatorId, data)),
    blocks: input.blocks.map(({ relatedCreatorId, data }) =>
      creatorRelationship(exportJobId, relatedCreatorId, data)),
    reports: input.reports.map(({ id, data }) => creatorReport(exportJobId, id, data)),
    comments: input.comments.map(({ targetCreatorId, postId, data }) =>
      creatorComment(exportJobId, targetCreatorId, postId, data)),
    reactions: input.reactions.map(({ targetCreatorId, postId, data }) =>
      creatorReaction(exportJobId, targetCreatorId, postId, data)),
    notifications: input.notifications.map(({ id, data }) =>
      creatorNotification(exportJobId, id, data)),
  };
}
