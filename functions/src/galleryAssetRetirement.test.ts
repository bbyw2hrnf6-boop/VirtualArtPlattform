import { describe, expect, it } from "vitest";
import {
  galleryManifestStoragePaths,
  retiredGalleryStoragePaths,
} from "./galleryAssetRetirement.js";

describe("gallery asset retirement", () => {
  it("returns only former exact media paths not used by the new manifest", () => {
    const previous = {
      coverPath: "published/owner-a/space-a/cover.webp",
      artworks: [
        { storagePath: "published/owner-a/space-a/artworks/1.webp" },
        { storagePath: "published/owner-a/space-a/artworks/2.webp" },
      ],
    };
    expect(retiredGalleryStoragePaths({
      previous,
      currentPaths: ["published/owner-a/space-a/revisions/rev-2/cover.webp"],
      ownerId: "owner-a",
      galleryId: "space-a",
    })).toEqual([
      "published/owner-a/space-a/cover.webp",
      "published/owner-a/space-a/artworks/1.webp",
      "published/owner-a/space-a/artworks/2.webp",
    ]);
  });

  it("rejects cross-gallery, traversal, duplicate, and over-limit paths", () => {
    expect(() => retiredGalleryStoragePaths({
      previous: { coverPath: "published/other/space-a/cover.webp" },
      currentPaths: ["published/owner-a/space-a/../cover.webp"],
      ownerId: "owner-a",
      galleryId: "space-a",
    })).toThrow("gallery-retirement-paths-invalid");
    expect(() => galleryManifestStoragePaths({
      coverPath: "published/owner-a/space-a/cover.webp",
      artworks: Array.from({ length: 15 }, () => ({
        storagePath: "published/owner-a/space-a/artworks/1.webp",
      })),
    }, "owner-a", "space-a")).toThrow("gallery-retirement-paths-invalid");
  });
});
