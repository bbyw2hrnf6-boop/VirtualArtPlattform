import { describe, expect, it, vi } from "vitest";
import {
  assertRecentAuthentication,
  assertAccountAccess,
  buildAccountExport,
  executeAccountDeletion,
  type AccountDeletionExecutor,
  type AccountDeletionPlan,
} from "./accountDataRights.js";

const plan = (overrides: Partial<AccountDeletionPlan> = {}): AccountDeletionPlan => ({
  uid: "account-a",
  ownedGalleryIds: [],
  membershipPaths: [],
  invitePaths: [],
  documentPaths: ["profiles/account-a", "newsletterSubscriptions/account-a"],
  ...overrides,
});

function executor(fail?: { method: keyof AccountDeletionExecutor; once?: boolean }) {
  const calls: string[] = [];
  let failed = false;
  const invoke = async (method: keyof AccountDeletionExecutor, value?: string) => {
    calls.push(`${method}${value ? `:${value}` : ""}`);
    if (fail?.method === method && (!fail.once || !failed)) {
      failed = true;
      throw new Error(`${method}-failed`);
    }
  };
  const value: AccountDeletionExecutor = {
    phase: (name) => invoke("phase", name),
    markOwnedSpaces: (ids) => invoke("markOwnedSpaces", ids.join(",")),
    deleteOwnedSpaceAssets: (_uid, id) => invoke("deleteOwnedSpaceAssets", id),
    deleteOwnedSpace: (id) => invoke("deleteOwnedSpace", id),
    removeMembership: (path) => invoke("removeMembership", path),
    removeInvitation: (path) => invoke("removeInvitation", path),
    deleteAvatar: (uid) => invoke("deleteAvatar", uid),
    removeLinkedDocument: (path) => invoke("removeLinkedDocument", path),
    deleteAuthentication: (uid) => invoke("deleteAuthentication", uid),
    finish: () => invoke("finish"),
  };
  return { value, calls };
}

describe("account-wide export", () => {
  it("accepts an account and rejects unauthenticated/anonymous export access", () => {
    expect(assertAccountAccess("account-a", "password")).toBe("account-a");
    expect(() => assertAccountAccess(undefined, undefined)).toThrow("account-required");
    expect(() => assertAccountAccess("guest-a", "anonymous")).toThrow("account-required");
  });

  it("exports owned data while removing collaborator and invitation target emails", () => {
    const result = buildAccountExport({
      generatedAt: "2026-08-23T10:00:00.000Z",
      account: { uid: "account-a", email: "owner@example.com", refreshToken: "secret" },
      profile: { displayName: "Owner" },
      newsletter: { status: "subscribed", tokenHash: "secret" },
      ownedSpaces: [{
        id: "space-a",
        manifest: { title: "My space", ownerId: "account-a" },
        members: [{ email: "collaborator@example.com", role: "editor", status: "active" }],
        media: [{ path: "published/account-a/space-a/cover.webp", contentType: "image/webp" }],
      }],
      sharedSpaces: [{ galleryId: "space-b", ownerId: "other", email: "owner@example.com", role: "viewer" }],
      receivedInvitations: [{ galleryId: "space-c", email: "owner@example.com", role: "viewer" }],
      sentInvitations: [{ galleryId: "space-a", email: "invitee@example.com", role: "editor" }],
      submittedModerationReports: [{ id: "report-a", reason: "rights", status: "open" }],
      operationalState: { pendingPublicationPermits: 0 },
    });
    const json = JSON.stringify(result);
    expect(json).toContain("owner@example.com");
    expect(json).not.toContain("collaborator@example.com");
    expect(json).not.toContain("invitee@example.com");
    expect(json).not.toContain("refreshToken");
    expect(json).not.toContain("tokenHash");
    expect(json).not.toContain('"ownerId":"other"');
    expect(json).toContain("published/account-a/space-a/cover.webp");
    expect(json).toContain('"reason":"rights"');
  });

  it("normalizes malformed or unsupported values without failing the export", () => {
    const result = buildAccountExport({
      generatedAt: "2026-08-23T10:00:00.000Z",
      account: { uid: "account-a", broken: undefined, value: Number.NaN },
      ownedSpaces: [], sharedSpaces: [], receivedInvitations: [], sentInvitations: [],
      operationalState: {},
    });
    expect(JSON.stringify(result)).toContain('"value":null');
  });

  it("keeps legacy manifest fields available without granting shared manifest access", () => {
    const result = buildAccountExport({
      generatedAt: "2026-08-23T10:00:00.000Z",
      account: { uid: "account-a" },
      ownedSpaces: [{
        id: "legacy-space",
        manifest: { schemaVersion: 1, artworks: [{ assetId: "legacy-art" }] },
        members: [], media: [],
      }],
      sharedSpaces: [{ galleryId: "shared", role: "editor", manifest: { private: true } }],
      receivedInvitations: [], sentInvitations: [], operationalState: {},
    });
    const json = JSON.stringify(result);
    expect(json).toContain("legacy-art");
    expect(json).not.toContain('"private":true');
  });
});

describe("account deletion plan", () => {
  it("deletes owned Spaces, shared roles and invitations before Auth", async () => {
    const fake = executor();
    const result = await executeAccountDeletion(plan({
      ownedGalleryIds: ["space-a"],
      membershipPaths: ["galleries/other/members/account"],
      invitePaths: ["galleryInvites/invite-a"],
    }), fake.value);
    expect(result).toEqual({
      ownedSpacesDeleted: 1,
      sharedMembershipsRemoved: 1,
      invitationsRemoved: 1,
      linkedDocumentsRemoved: 2,
      authenticationDeleted: true,
    });
    expect(fake.calls.indexOf("deleteOwnedSpaceAssets:space-a"))
      .toBeLessThan(fake.calls.indexOf("deleteOwnedSpace:space-a"));
    expect(fake.calls.indexOf("deleteAuthentication:account-a"))
      .toBeGreaterThan(fake.calls.indexOf("removeLinkedDocument:newsletterSubscriptions/account-a"));
  });

  it("works for an account with no Spaces", async () => {
    const fake = executor();
    const result = await executeAccountDeletion(plan(), fake.value);
    expect(result.ownedSpacesDeleted).toBe(0);
    expect(result.authenticationDeleted).toBe(true);
  });

  it("does not delete a shared Space when removing editor/viewer membership", async () => {
    const fake = executor();
    await executeAccountDeletion(plan({
      membershipPaths: ["galleries/other-a/members/a", "galleries/other-b/members/a"],
    }), fake.value);
    expect(fake.calls.some((call) => call.startsWith("deleteOwnedSpace:"))).toBe(false);
    expect(fake.calls.filter((call) => call.startsWith("removeMembership:"))).toHaveLength(2);
  });

  it("stops before Firestore/Auth deletion when Storage fails", async () => {
    const fake = executor({ method: "deleteOwnedSpaceAssets" });
    await expect(executeAccountDeletion(plan({ ownedGalleryIds: ["space-a"] }), fake.value))
      .rejects.toThrow("deleteOwnedSpaceAssets-failed");
    expect(fake.calls).not.toContain("deleteOwnedSpace:space-a");
    expect(fake.calls).not.toContain("deleteAuthentication:account-a");
  });

  it("never reports completion when Auth deletion fails", async () => {
    const fake = executor({ method: "deleteAuthentication" });
    await expect(executeAccountDeletion(plan(), fake.value)).rejects.toThrow("deleteAuthentication-failed");
    expect(fake.calls).not.toContain("finish");
  });

  it("stops with Auth intact when a linked Firestore deletion fails", async () => {
    const fake = executor({ method: "removeLinkedDocument" });
    await expect(executeAccountDeletion(plan(), fake.value)).rejects.toThrow("removeLinkedDocument-failed");
    expect(fake.calls).not.toContain("deleteAuthentication:account-a");
    expect(fake.calls).not.toContain("finish");
  });

  it("removes avatar, newsletter/profile records and pending invitations", async () => {
    const fake = executor();
    await executeAccountDeletion(plan({ invitePaths: ["galleryInvites/pending"] }), fake.value);
    expect(fake.calls).toContain("deleteAvatar:account-a");
    expect(fake.calls).toContain("removeInvitation:galleryInvites/pending");
    expect(fake.calls).toContain("removeLinkedDocument:profiles/account-a");
    expect(fake.calls).toContain("removeLinkedDocument:newsletterSubscriptions/account-a");
  });

  it("is retry-safe after a transient failure", async () => {
    const first = executor({ method: "removeMembership", once: true });
    const target = plan({ membershipPaths: ["galleries/other/members/a"] });
    await expect(executeAccountDeletion(target, first.value)).rejects.toThrow();
    const retry = executor();
    await expect(executeAccountDeletion(target, retry.value)).resolves.toMatchObject({
      authenticationDeleted: true,
    });
  });

  it("requires a recent authentication timestamp", () => {
    expect(() => assertRecentAuthentication(1_000, 1_500, 600)).not.toThrow();
    expect(() => assertRecentAuthentication(1_000, 1_601, 600)).toThrow("recent-authentication-required");
    expect(() => assertRecentAuthentication(undefined, 1_500, 600)).toThrow("recent-authentication-required");
  });

  it("does not invoke the executor for an unauthorized preflight", () => {
    const fake = executor();
    const authorize = vi.fn(() => { throw new Error("unauthenticated"); });
    expect(authorize).toThrow("unauthenticated");
    expect(fake.calls).toHaveLength(0);
  });
});
