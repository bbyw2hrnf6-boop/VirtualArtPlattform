import { describe, expect, it } from "vitest";
import type { GalleryRecord } from "./galleryRepository";
import { discoverEligibility, isDiscoverEligible } from "./discoverEligibility";

const future = "2030-01-01T00:00:00.000Z";
const base = {
  visibility: "public",
  lifecycleStatus: "active",
  expiresAt: future,
  title: "Material Futures",
  artist: "Field Office",
  artworks: [{ id: "work-1", src: "data:image/webp;base64,AA==" }],
} as unknown as GalleryRecord;

describe("Discover eligibility", () => {
  it("keeps public access separate from curated discovery", () => {
    expect(discoverEligibility({ ...base, discoverEligible: false }, 0)).toEqual({
      eligible: false,
      reason: "moderation-disabled",
    });
    expect(discoverEligibility({ ...base, visibility: "unlisted" }, 0).reason).toBe("not-public");
    expect(discoverEligibility({ ...base, visibility: "private" }, 0).reason).toBe("not-public");
  });

  it("rejects expired, archived, invalid and empty records deterministically", () => {
    expect(discoverEligibility({ ...base, expiresAt: "2020-01-01T00:00:00.000Z" }, Date.now()).reason).toBe("expired");
    expect(discoverEligibility({ ...base, lifecycleStatus: "archived" }, 0).reason).toBe("not-active");
    expect(discoverEligibility({ ...base, title: "  " }, 0).reason).toBe("invalid-identity");
    expect(discoverEligibility({ ...base, artist: "A" }, 0).reason).toBe("invalid-identity");
    expect(discoverEligibility({ ...base, artworks: [] }, 0).reason).toBe("no-visible-content");
  });

  it("keeps active public starter-titled Spaces visible until their Creator renames them", () => {
    expect(discoverEligibility({ ...base, title: "Untitled exhibition", artist: "Your nameefefef" }, 0).reason).toBe("eligible");
  });

  it("accepts legacy records without a moderation override when quality checks pass", () => {
    expect(isDiscoverEligible(base, 0)).toBe(true);
    expect(isDiscoverEligible({
      ...base,
      artworks: [{ id: "work-1", src: "", storagePath: "published/owner/room/artworks/1.webp" }],
    } as GalleryRecord, 0)).toBe(true);
  });
});
