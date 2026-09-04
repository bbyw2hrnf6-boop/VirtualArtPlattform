import { describe, expect, it } from "vitest";
import {
  accountInvitation,
  creatorActivityExport,
  ownedSpaceMediaBatch,
  ownedSpaceMemberBatch,
  safeAccountExportSourceRecord,
  sharedSpaceMembership,
  storageObjectWindowAfterCursor,
} from "./accountExportProjection.js";

describe("managed account export projections", () => {
  it("omits another person's identity from owned Space membership", () => {
    const value = ownedSpaceMemberBatch("gallery-a", [{
      email: "collaborator@example.com",
      uid: "other-account",
      role: "editor",
      status: "active",
      addedAt: "2026-09-03T00:00:00Z",
    }]);
    expect(value).toEqual({
      galleryId: "gallery-a",
      members: [{ role: "editor", status: "active", addedAt: "2026-09-03T00:00:00Z" }],
    });
    expect(JSON.stringify(value)).not.toContain("collaborator@example.com");
    expect(JSON.stringify(value)).not.toContain("other-account");
  });

  it("exports only the account's shared-access fields", () => {
    expect(sharedSpaceMembership("gallery-b", {
      email: "owner@example.com",
      ownerId: "another-owner",
      manifest: { private: true },
      role: "viewer",
      status: "active",
    })).toEqual({ galleryId: "gallery-b", role: "viewer", status: "active", addedAt: undefined });
  });

  it("omits invitation target email and server token fields", () => {
    const value = accountInvitation("job_0123456789abcdef012345", "invite-a", {
      email: "invitee@example.com",
      tokenHash: "secret",
      galleryId: "gallery-a",
      role: "editor",
      status: "pending",
    }, "sent");
    expect(JSON.stringify(value)).not.toContain("invitee@example.com");
    expect(JSON.stringify(value)).not.toContain("secret");
    expect(value).toMatchObject({
      recordRef: expect.stringMatching(/^invitation-[a-f0-9]{24}$/),
      direction: "sent",
      galleryId: "gallery-a",
    });
    expect(JSON.stringify(value)).not.toContain("invite-a");
  });

  it("exports media footprint without custom metadata or download tokens", () => {
    const value = ownedSpaceMediaBatch("gallery-a", [{
      path: "published/account-a/gallery-a/revisions/rev-a/artworks/one.webp",
      contentType: "image/webp",
      size: "1024",
      updated: "2026-09-03T00:00:00Z",
      metadata: { firebaseStorageDownloadTokens: "secret" },
    } as never]);
    expect(value.media[0]).toEqual({
      path: "published/account-a/gallery-a/revisions/rev-a/artworks/one.webp",
      contentType: "image/webp",
      sizeBytes: 1024,
      updatedAt: "2026-09-03T00:00:00Z",
      revisionId: "rev-a",
    });
    expect(JSON.stringify(value)).not.toContain("secret");
    expect(ownedSpaceMediaBatch("gallery-a", [{
      path: "published/account-a/gallery-a/unknown",
      metadataUnavailable: true,
    }]).media[0]).toMatchObject({ metadataUnavailable: true });
  });

  it("drops an inclusive Storage cursor while retaining one bounded look-ahead object", () => {
    const objects = ["art/000", "art/001", "art/002", "art/003"]
      .map((name) => ({ name }));
    expect(storageObjectWindowAfterCursor(objects, "art/000", 2).map(({ name }) => name))
      .toEqual(["art/001", "art/002", "art/003"]);
    expect(storageObjectWindowAfterCursor(objects, "art/001a", 2).map(({ name }) => name))
      .toEqual(["art/002", "art/003"]);
    expect(() => storageObjectWindowAfterCursor(objects, undefined, 0))
      .toThrow("export-storage-window-invalid");
  });

  it("advances past a malformed source record with a visible, non-sensitive marker", () => {
    expect(safeAccountExportSourceRecord(() => {
      throw new Error("document contains private evidence");
    })).toEqual({
      recordUnavailable: true,
      reason: "malformed-source-record",
    });
  });

  it("replaces other Creator IDs and interaction paths with export-scoped references", () => {
    const jobId = "job_0123456789abcdef012345";
    const relatedId = "otherCreatorPrivateId";
    const postId = "targetPostPrivateId";
    const reportId = "reportPrivateId";
    const notificationId = "notificationPrivateId";
    const activity = creatorActivityExport(jobId, {
      following: [{ relatedCreatorId: relatedId, data: { createdAt: "now", followerCreatorId: "self" } }],
      blocks: [{ relatedCreatorId: relatedId, data: { blockerCreatorId: "self" } }],
      reports: [{ id: reportId, data: {
        targetCreatorId: relatedId,
        postId,
        reporterAccountId: "account-a",
        caseId: "private-case",
        assigneeId: "moderator-a",
        decision: "private-decision",
        sourceReportIds: ["other-report"],
        status: "private-status",
      } }],
      comments: [{
        targetCreatorId: relatedId,
        postId,
        data: { authorCreatorId: "self", body: "Hello" },
      }],
      reactions: [{ targetCreatorId: relatedId, postId, data: { creatorId: "self" } }],
      notifications: [{ id: notificationId, data: {
        actorCreatorId: relatedId,
        actorHandle: "other-person-handle",
        actorDisplayName: "Other Person",
        actorEmail: "other@example.com",
        postId,
        bodyPreview: "other person's private words",
      } }],
    });
    const json = JSON.stringify(activity);
    expect(json).not.toContain(relatedId);
    expect(json).not.toContain(postId);
    expect(json).not.toContain(reportId);
    expect(json).not.toContain(notificationId);
    expect(json).not.toContain("account-a");
    expect(json).not.toContain("private-case");
    expect(json).not.toContain("moderator-a");
    expect(json).not.toContain("private-decision");
    expect(json).not.toContain("other-report");
    expect(json).not.toContain("private-status");
    expect(json).not.toContain("other-person-handle");
    expect(json).not.toContain("Other Person");
    expect(json).not.toContain("other@example.com");
    expect(json).not.toContain("other person's private words");
    expect(json).not.toContain("authorCreatorId");
    expect(json).not.toContain("creatorId");
    expect(json).toContain("related-");
    expect(json).toContain("post-");
    expect(json).toContain("report-");
    expect(json).toContain("notification-");
    expect(activity.following[0].relatedCreatorRef)
      .toBe(activity.notifications[0].relatedCreatorRef);
  });
});
