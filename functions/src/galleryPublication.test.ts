import { describe, expect, it } from "vitest";
import {
  galleryRevisionPermitId,
  validateInitialPublicationPermit,
  validateRevisionAuthorization,
  validateRevisionPermit,
} from "./galleryPublication.js";

const timestamp = (milliseconds: number) => ({ toMillis: () => milliseconds });

describe("trusted publication permits", () => {
  it("accepts only a current owner-bound initial permit", () => {
    const permit = {
      kind: "initial",
      status: "pending",
      ownerId: "owner-1",
      galleryId: "space-1",
      visibility: "public",
      retention: "account-preview",
      expiresAt: timestamp(10_000_000),
      permitExpiresAt: timestamp(100_000),
    };
    expect(validateInitialPublicationPermit(permit, {
      ownerId: "owner-1",
      galleryId: "space-1",
      now: 50_000,
    })).toMatchObject({ visibility: "public", expiresAtMs: 10_000_000 });
    expect(() => validateInitialPublicationPermit({ ...permit, status: "aborting" }, {
      ownerId: "owner-1",
      galleryId: "space-1",
      now: 50_000,
    })).toThrow(/not pending/);
    expect(() => validateInitialPublicationPermit(permit, {
      ownerId: "attacker",
      galleryId: "space-1",
      now: 50_000,
    })).toThrow(/ownership/);
  });

  it("binds revision permits to uploader, base revision, and immutable path ID", () => {
    const permit = {
      kind: "revision",
      status: "pending",
      ownerId: "owner-1",
      uploaderId: "editor-1",
      galleryId: "space-1",
      revisionId: "r2-safe",
      baseRevision: 1,
      visibility: "private",
      retention: "account-preview",
      expiresAt: timestamp(10_000_000),
      permitExpiresAt: timestamp(100_000),
    };
    expect(galleryRevisionPermitId("space-1", "r2-safe")).toBe("space-1_r2-safe");
    expect(validateRevisionPermit(permit, {
      ownerId: "owner-1",
      uploaderId: "editor-1",
      galleryId: "space-1",
      revisionId: "r2-safe",
      baseRevision: 1,
      now: 50_000,
    })).toMatchObject({ visibility: "private" });
    expect(() => validateRevisionPermit(permit, {
      ownerId: "owner-1",
      uploaderId: "editor-1",
      galleryId: "space-1",
      revisionId: "r2-safe",
      baseRevision: 2,
      now: 50_000,
    })).toThrow(/does not match/);
  });

  it("authorizes only a current Owner or active email-bound Editor", () => {
    const gallery = {
      ownerId: "owner-1",
      templateId: "white-cube",
      revision: 4,
      lifecycleStatus: "active",
      expiresAt: timestamp(10_000_000),
      publishedAt: timestamp(1_000),
      visibility: "unlisted",
      retention: "account-preview",
      accessVersion: 1,
      exploreListed: false,
      creatorProfileListed: true,
    };
    expect(validateRevisionAuthorization({ gallery, member: undefined, uid: "owner-1", expectedRevision: 4, now: 50_000 }))
      .toMatchObject({ ownerId: "owner-1", visibility: "unlisted", templateId: "white-cube" });
    expect(validateRevisionAuthorization({
      gallery,
      member: { email: "editor@example.test", role: "editor", status: "active" },
      uid: "editor-1",
      email: "editor@example.test",
      expectedRevision: 4,
      now: 50_000,
    })).toMatchObject({ ownerId: "owner-1" });
    expect(() => validateRevisionAuthorization({
      gallery,
      member: { email: "editor@example.test", role: "viewer", status: "active" },
      uid: "viewer-1",
      email: "editor@example.test",
      expectedRevision: 4,
      now: 50_000,
    })).toThrow(/Owner or Editor/);
    expect(() => validateRevisionAuthorization({ gallery, member: undefined, uid: "owner-1", expectedRevision: 3, now: 50_000 }))
      .toThrow(/revision changed/);
    expect(() => validateRevisionAuthorization({
      gallery: { ...gallery, publishedAt: "not-a-timestamp" },
      member: undefined,
      uid: "owner-1",
      expectedRevision: 4,
      now: 50_000,
    })).toThrow(/publication time/);
    expect(() => validateRevisionAuthorization({
      gallery,
      member: undefined,
      uid: "owner-1",
      expectedRevision: 4,
      now: Number.NaN,
    })).toThrow(/current time/);
  });
});
