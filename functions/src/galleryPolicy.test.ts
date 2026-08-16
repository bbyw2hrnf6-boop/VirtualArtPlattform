import { describe, expect, it } from "vitest";
import { normalizeMemberEmail, parseGalleryId, publicationTerms } from "./galleryPolicy.js";

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
});
