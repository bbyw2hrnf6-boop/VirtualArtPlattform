import { describe, expect, it } from "vitest";
import {
  assertRecentAuthentication,
  assertAccountAccess,
  assertImmediateAccountExportSize,
  buildAccountExport,
  collectBoundedPages,
  mapInChunks,
} from "./accountDataRights.js";

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
      newsletter: {
        status: "subscribed",
        tokenHash: "secret",
        metadata: { firebaseStorageDownloadTokens: "download-secret" },
      },
      ownedSpaces: [{
        id: "space-a",
        manifest: { title: "My space", ownerId: "account-a" },
        members: [{ email: "collaborator@example.com", role: "editor", status: "active" }],
        media: [{ path: "published/account-a/space-a/cover.webp", contentType: "image/webp" }],
      }],
      sharedSpaces: [{ galleryId: "space-b", ownerId: "other", email: "owner@example.com", role: "viewer" }],
      receivedInvitations: [{ galleryId: "space-c", email: "owner@example.com", role: "viewer" }],
      sentInvitations: [{ galleryId: "space-a", email: "invitee@example.com", role: "editor" }],
      submittedModerationReports: [{
        recordRef: "report-opaque",
        reason: "rights",
        status: "private-status",
        caseId: "private-case",
        assigneeEmail: "moderator@example.com",
        evidence: { sourceReportIds: ["other-report"] },
      }],
      operationalState: { pendingPublicationPermits: 0 },
    });
    const json = JSON.stringify(result);
    expect(json).toContain("owner@example.com");
    expect(json).not.toContain("collaborator@example.com");
    expect(json).not.toContain("invitee@example.com");
    expect(json).not.toContain("refreshToken");
    expect(json).not.toContain("tokenHash");
    expect(json).not.toContain("download-secret");
    expect(json).not.toContain('"ownerId":"other"');
    expect(json).not.toContain("private-status");
    expect(json).not.toContain("private-case");
    expect(json).not.toContain("moderator@example.com");
    expect(json).not.toContain("other-report");
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

  it("bounds the synchronous callable response without printing its data", () => {
    expect(assertImmediateAccountExportSize({ value: "safe" }, 64)).toEqual({ value: "safe" });
    expect(() => assertImmediateAccountExportSize({ value: "x".repeat(100) }, 64))
      .toThrow("export-size-limit-exceeded");
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

  it("requires a recent authentication timestamp", () => {
    expect(() => assertRecentAuthentication(1_000, 1_500, 600)).not.toThrow();
    expect(() => assertRecentAuthentication(1_000, 1_601, 600)).toThrow("recent-authentication-required");
    expect(() => assertRecentAuthentication(undefined, 1_500, 600)).toThrow("recent-authentication-required");
  });

});

describe("bounded lifecycle helpers", () => {
  it("collects cursor pages and refuses an oversized immediate operation", async () => {
    const values = [1, 2, 3, 4, 5];
    const collect = (maximumItems: number) => collectBoundedPages<number, number>({
      maximumItems,
      fetchPage: async (cursor, limit) => {
        const start = cursor === undefined ? 0 : values.indexOf(cursor) + 1;
        const items = values.slice(start, start + limit);
        const nextCursor = items.length && start + items.length < values.length ? items.at(-1) : undefined;
        return { items, ...(nextCursor === undefined ? {} : { nextCursor }) };
      },
    });
    await expect(collect(5)).resolves.toEqual(values);
    await expect(collect(4)).rejects.toThrow("page-limit-exceeded");
  });

  it("rejects empty nonterminal and repeated-cursor pages without looping", async () => {
    await expect(collectBoundedPages<number, string>({
      maximumItems: 10,
      fetchPage: async () => ({ items: [], nextCursor: "same" }),
    })).rejects.toThrow("page-invalid");
    let calls = 0;
    await expect(collectBoundedPages<number, string>({
      maximumItems: 10,
      fetchPage: async () => {
        calls += 1;
        return { items: [calls], nextCursor: "same" };
      },
    })).rejects.toThrow("page-invalid");
    expect(calls).toBe(2);
  });

  it("runs work in bounded concurrent chunks while preserving output order", async () => {
    await expect(mapInChunks([1, 2, 3, 4, 5], 2, async (value) => value * 2))
      .resolves.toEqual([2, 4, 6, 8, 10]);
  });
});
