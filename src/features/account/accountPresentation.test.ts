import { describe, expect, it } from "vitest";
import type { GalleryRecord } from "../../services/galleryRepository";
import {
  accountSectionTitle,
  accountSignInMethods,
  isPublicProfileSpace,
} from "./accountPresentation";

describe("account presentation", () => {
  it("keeps the settings hierarchy explicit", () => {
    expect(accountSectionTitle("rooms")).toBe("Your account.");
    expect(accountSectionTitle("creator")).toBe("Public profile.");
    expect(accountSectionTitle("account")).toBe("Account & security.");
    expect(accountSectionTitle("data")).toBe("Data & rights.");
  });

  it("shows only real connected sign-in methods", () => {
    expect(accountSignInMethods(["password", "google.com"]))
      .toEqual(["Email and password", "Google"]);
    expect(accountSignInMethods([])).toEqual([]);
  });

  it("uses only active, public, owned Spaces in the profile preview", () => {
    const space = {
      ownerId: "owner-1",
      visibility: "public",
      lifecycleStatus: "active",
      expiresAt: "2030-01-01T00:00:00.000Z",
    } as GalleryRecord;
    expect(isPublicProfileSpace(space, "owner-1", Date.parse("2029-01-01"))).toBe(true);
    expect(isPublicProfileSpace({ ...space, visibility: "private" }, "owner-1", Date.parse("2029-01-01"))).toBe(false);
    expect(isPublicProfileSpace({ ...space, ownerId: "other", effectiveRole: "viewer" }, "owner-1", Date.parse("2029-01-01"))).toBe(false);
    expect(isPublicProfileSpace({ ...space, expiresAt: "2028-01-01T00:00:00.000Z" }, "owner-1", Date.parse("2029-01-01"))).toBe(false);
  });
});
