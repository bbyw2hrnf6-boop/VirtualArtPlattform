import { describe, expect, it, vi } from "vitest";
import {
  ACCOUNT_DELETION_PHASES,
  ACCOUNT_DELETION_LEASE_MS,
  ACCOUNT_DELETION_SCHEMA_VERSION,
  ACCOUNT_DELETION_TOMBSTONE_TTL_MS,
  accountDeletionAuthenticationAlreadyMissing,
  accountDeletionFollowRelation,
  accountDeletionLeaseAvailable,
  accountMediaUploadLeaseDisposition,
  accountDeletionPseudonymousReportId,
  accountDeletionPermitAuthority,
  accountDeletionPublicStatus,
  aggregateAfterRelationRemoval,
  assertAccountDeletionJobState,
  drainAccountDeletionPage,
  existingAuthUidForDeletionFence,
  galleryManifestReferencesPrefix,
  nextAccountDeletionPhase,
  parsePersistedGalleryDocumentId,
} from "./accountDeletionJobs.js";

describe("account deletion jobs", () => {
  it("drains more than five thousand records through bounded page-one retries", async () => {
    const remaining = Array.from({ length: 5_201 }, (_, index) => index);
    let largestPage = 0;
    let calls = 0;
    while (true) {
      const result = await drainAccountDeletionPage({
        fetchPage: async (limit) => remaining.slice(0, limit),
        remove: async (items) => {
          largestPage = Math.max(largestPage, items.length);
          remaining.splice(0, items.length);
        },
      });
      calls += 1;
      if (result.complete) break;
    }
    expect(remaining).toEqual([]);
    expect(largestPage).toBe(200);
    expect(calls).toBe(28);
  });

  it("does not advance state until removal succeeds", async () => {
    const values = [1, 2, 3];
    await expect(drainAccountDeletionPage({
      fetchPage: async () => values.slice(),
      remove: async () => { throw new Error("interrupted"); },
    })).rejects.toThrow("interrupted");
    expect(values).toEqual([1, 2, 3]);
  });

  it("moves deterministically through every persisted phase", () => {
    for (let index = 0; index < ACCOUNT_DELETION_PHASES.length - 1; index += 1)
      expect(nextAccountDeletionPhase(ACCOUNT_DELETION_PHASES[index]!))
        .toBe(ACCOUNT_DELETION_PHASES[index + 1]);
    expect(nextAccountDeletionPhase("complete")).toBe("complete");
  });

  it("validates resume state and strips untrusted fields", () => {
    const state = assertAccountDeletionJobState({
      schemaVersion: ACCOUNT_DELETION_SCHEMA_VERSION,
      uid: "account-a",
      deletionId: "a".repeat(32),
      status: "running",
      phase: "owned-galleries",
      creatorId: "creator-a",
      currentGalleryId: "gallery-a",
      currentGalleryStage: "storage",
      arbitrary: "ignored",
    }, "account-a");
    expect(state).toEqual({
      schemaVersion: ACCOUNT_DELETION_SCHEMA_VERSION,
      uid: "account-a",
      deletionId: "a".repeat(32),
      status: "running",
      phase: "owned-galleries",
      creatorId: "creator-a",
      currentGalleryId: "gallery-a",
      currentGalleryStage: "storage",
    });
    expect(() => assertAccountDeletionJobState({ ...state, uid: "other" }, "account-a"))
      .toThrow("deletion-job-state-invalid");
    expect(() => assertAccountDeletionJobState({
      ...state,
      status: "running",
      phase: "complete",
    }, "account-a")).toThrow("deletion-job-state-invalid");
    expect(() => assertAccountDeletionJobState({
      ...state,
      creatorId: "../../invalid",
    }, "account-a")).toThrow("deletion-job-state-invalid");
    expect(() => assertAccountDeletionJobState({
      ...state,
      email: "line-break\n@example.test",
    }, "account-a")).toThrow("deletion-job-state-invalid");
    expect(() => assertAccountDeletionJobState({
      ...state,
      currentGalleryStage: undefined,
    }, "account-a")).toThrow("deletion-job-state-invalid");
    expect(() => assertAccountDeletionJobState({
      ...state,
      schemaVersion: 1,
    }, "account-a")).toThrow("deletion-job-state-invalid");
    expect(() => assertAccountDeletionJobState({
      schemaVersion: ACCOUNT_DELETION_SCHEMA_VERSION,
      uid: "account-a",
      deletionId: "a".repeat(32),
      status: "running",
      phase: "publication-permits",
      currentPermitPath: "galleryPublishPermits/space-a",
    }, "account-a")).toThrow("deletion-job-state-invalid");
    expect(() => assertAccountDeletionJobState({
      schemaVersion: ACCOUNT_DELETION_SCHEMA_VERSION,
      uid: "account-a",
      deletionId: "a".repeat(32),
      status: "complete",
      phase: "complete",
      email: "still-linkable@example.test",
    }, "account-a")).toThrow("deletion-job-state-invalid");
  });

  it("accepts hostile legacy gallery IDs without weakening direct-path bounds", () => {
    for (const galleryId of ["a", "bad_id", "bad.id", "line\nbreak", "é".repeat(750)]) {
      expect(parsePersistedGalleryDocumentId(galleryId)).toBe(galleryId);
      expect(assertAccountDeletionJobState({
        schemaVersion: ACCOUNT_DELETION_SCHEMA_VERSION,
        uid: "account-a",
        deletionId: "f".repeat(32),
        status: "running",
        phase: "owned-galleries",
        currentGalleryId: galleryId,
        currentGalleryStage: "storage",
      }, "account-a").currentGalleryId).toBe(galleryId);
    }
    expect(parsePersistedGalleryDocumentId("")).toBeUndefined();
    expect(parsePersistedGalleryDocumentId("nested/gallery")).toBeUndefined();
    expect(parsePersistedGalleryDocumentId("é".repeat(751))).toBeUndefined();
  });

  it("returns only coarse public progress and retains completion", () => {
    expect(accountDeletionPublicStatus(assertAccountDeletionJobState({
      schemaVersion: ACCOUNT_DELETION_SCHEMA_VERSION,
      uid: "account-a", deletionId: "b".repeat(32), status: "complete", phase: "complete",
    }, "account-a"))).toEqual({ status: "complete", phase: "complete" });
    expect(ACCOUNT_DELETION_TOMBSTONE_TTL_MS).toBe(24 * 60 * 60_000);
  });

  it("protects another owner's committed revision prefix", () => {
    const prefix = "published/owner-b/gallery-a/revisions/revision-a/";
    expect(galleryManifestReferencesPrefix({
      coverPath: `${prefix}cover.webp`,
      artworks: [],
    }, prefix)).toBe(true);
    expect(galleryManifestReferencesPrefix({
      coverPath: "published/owner-b/gallery-a/revisions/revision-b/cover.webp",
      artworks: [{ storagePath: `${prefix}artworks/1.webp` }],
    }, prefix)).toBe(true);
    expect(galleryManifestReferencesPrefix({
      coverPath: "published/owner-b/gallery-a/revisions/revision-b/cover.webp",
      artworks: [],
    }, prefix)).toBe(false);
  });

  it("recomputes permit deletion authority and rejects checkpoint tampering", () => {
    const base = {
      schemaVersion: ACCOUNT_DELETION_SCHEMA_VERSION,
      uid: "editor-a",
      deletionId: "c".repeat(32),
      status: "running",
      phase: "uploaded-revision-permits",
      currentPermitPath: "galleryRevisionPermits/space-a_revision-a",
      currentPermitPrefix: "published/owner-a/space-a/revisions/revision-a/",
      currentPermitOwnerId: "owner-a",
      currentPermitExternalOwner: true,
    } as const;
    const state = assertAccountDeletionJobState(base, "editor-a");
    const permit = {
      ownerId: "owner-a",
      uploaderId: "editor-a",
      galleryId: "space-a",
      revisionId: "revision-a",
    };
    expect(accountDeletionPermitAuthority(state, base.currentPermitPath, permit)).toEqual({
      ownerId: "owner-a",
      galleryId: "space-a",
      prefix: base.currentPermitPrefix,
      externalOwner: true,
    });
    const tampered = assertAccountDeletionJobState({
      ...base,
      currentPermitPrefix: "published/owner-a/space-a/revisions/other/",
    }, "editor-a");
    expect(() => accountDeletionPermitAuthority(tampered, base.currentPermitPath, permit))
      .toThrow("deletion-permit-authority-invalid");
    expect(() => accountDeletionPermitAuthority(state, base.currentPermitPath, {
      ...permit,
      uploaderId: "someone-else",
    })).toThrow("deletion-permit-authority-invalid");
  });

  it("reconciles aggregates idempotently without negative counts", () => {
    expect(aggregateAfterRelationRemoval(4)).toBe(3);
    expect(aggregateAfterRelationRemoval(0)).toBe(0);
    expect(aggregateAfterRelationRemoval(undefined)).toBe(0);
  });

  it("removes malformed matching follows without touching an aggregate", () => {
    expect(accountDeletionFollowRelation({
      followerCreatorId: "creator-a",
      followedCreatorId: "../../invalid",
    }, "creator-a")).toEqual({ remove: true });
    expect(accountDeletionFollowRelation({
      followerCreatorId: "other",
      followedCreatorId: "creator-b",
    }, "creator-a")).toEqual({ remove: false });
  });

  it("accepts only Auth user-not-found as an ambiguous delete retry", () => {
    expect(accountDeletionAuthenticationAlreadyMissing({ code: "auth/user-not-found" })).toBe(true);
    expect(accountDeletionAuthenticationAlreadyMissing({ code: "auth/internal-error" })).toBe(false);
    expect(accountDeletionAuthenticationAlreadyMissing(new Error("user-not-found"))).toBe(false);
  });

  it("fences an existing invite recipient and fails closed on Auth lookup errors", async () => {
    await expect(existingAuthUidForDeletionFence(
      "recipient@example.test",
      async () => ({ uid: "recipient-account" }),
    )).resolves.toBe("recipient-account");
    await expect(existingAuthUidForDeletionFence(
      "missing@example.test",
      async () => { throw { code: "auth/user-not-found" }; },
    )).resolves.toBeUndefined();
    await expect(existingAuthUidForDeletionFence(
      "unknown@example.test",
      async () => { throw { code: "auth/internal-error" }; },
    )).rejects.toEqual({ code: "auth/internal-error" });
  });

  it("moves retained reports to deterministic unlinkable document IDs", () => {
    const deletionId = "d".repeat(32);
    const oldReportId = "a".repeat(64);
    const migrated = accountDeletionPseudonymousReportId(deletionId, oldReportId);
    expect(migrated).toMatch(/^[a-f0-9]{64}$/);
    expect(migrated).not.toBe(oldReportId);
    expect(accountDeletionPseudonymousReportId(deletionId, oldReportId)).toBe(migrated);
    expect(accountDeletionPseudonymousReportId("e".repeat(32), oldReportId)).not.toBe(migrated);
  });

  it("does not let a delayed invocation be overtaken before its runtime ceiling", () => {
    const startedAt = 1_000_000;
    const expiresAt = startedAt + ACCOUNT_DELETION_LEASE_MS;
    expect(ACCOUNT_DELETION_LEASE_MS).toBeGreaterThan(5 * 60_000);
    expect(accountDeletionLeaseAvailable(expiresAt, startedAt + 5 * 60_000)).toBe(false);
    expect(accountDeletionLeaseAvailable(expiresAt, expiresAt - 1)).toBe(false);
    expect(accountDeletionLeaseAvailable(expiresAt, expiresAt)).toBe(true);
  });

  it("waits for active media writes and drains only absent or expired leases", () => {
    const lease = {
      uid: "account-a",
      leaseId: "f".repeat(32),
      schemaVersion: 1,
    };
    expect(accountMediaUploadLeaseDisposition(undefined, undefined, "account-a", 1_000)).toBe("absent");
    expect(accountMediaUploadLeaseDisposition(lease, 1_001, "account-a", 1_000)).toBe("active");
    expect(accountMediaUploadLeaseDisposition(lease, 1_000, "account-a", 1_000)).toBe("expired");
    expect(() => accountMediaUploadLeaseDisposition(
      { ...lease, uid: "another-account" }, 2_000, "account-a", 1_000,
    )).toThrow("deletion-media-lease-invalid");
  });

  it("rejects oversized pages before performing deletes", async () => {
    const remove = vi.fn();
    await expect(drainAccountDeletionPage({
      limit: 2,
      fetchPage: async () => [1, 2, 3],
      remove,
    })).rejects.toThrow("deletion-page-invalid");
    expect(remove).not.toHaveBeenCalled();
  });
});
