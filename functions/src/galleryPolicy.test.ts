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

  it("keeps guest rooms public and bounded to ten days", () => {
    const now = Date.UTC(2026, 7, 15);
    expect(publicationTerms(false, "private", now)).toBeNull();
    expect(publicationTerms(false, "public", now)?.expiresAt.getTime()).toBe(now + 10 * 86_400_000);
    expect(publicationTerms(true, "private", now)?.retention).toBe("account-preview");
  });
});
