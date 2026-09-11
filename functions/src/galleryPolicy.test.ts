import { describe, expect, it } from "vitest";
import { isGuestPublisher, normalizeMemberEmail, parseGalleryId, publicationTerms } from "./galleryPolicy.js";

describe("gallery mutation policy", () => {
  it("normalizes member identity without accepting malformed addresses", () => {
    expect(normalizeMemberEmail("  Artist@Example.COM ")).toBe("artist@example.com");
    expect(normalizeMemberEmail("not-an-email")).toBeNull();
  });

  it("accepts generated gallery ids and rejects path-like input", () => {
    expect(parseGalleryId("room-abc123")).toBe("room-abc123");
    expect(parseGalleryId("../galleries/room")).toBeNull();
  });

  it("requires a verified account for every publication visibility", () => {
    const now = Date.UTC(2026, 7, 15);
    expect(publicationTerms(false, "public", now)).toBeNull();
    expect(publicationTerms(false, "private", now)).toBeNull();
    expect(publicationTerms(true, "private", now)?.retention).toBe("account-preview");
    expect(publicationTerms(true, "public", now)?.expiresAt.getTime()).toBe(now + 365 * 86_400_000);
  });

  it("allows authenticated guests only public publication without changing storage lifetime", () => {
    const now = Date.UTC(2026, 8, 11);
    expect(publicationTerms(false, "public", now, true)).toEqual({
      retention: "account-preview", guestPublication: true,
      expiresAt: new Date(now + 365 * 86_400_000),
    });
    expect(publicationTerms(false, "unlisted", now, true)).toBeNull();
    expect(publicationTerms(false, "private", now, true)).toBeNull();
    expect(isGuestPublisher(undefined)).toBe(false);
    expect(isGuestPublisher({ token: { guestPublication: true } })).toBe(false);
    expect(isGuestPublisher({ token: { firebase: { sign_in_provider: "anonymous" } } })).toBe(true);
    expect(isGuestPublisher({ token: { firebase: { sign_in_provider: "password" } } })).toBe(false);
  });
});
