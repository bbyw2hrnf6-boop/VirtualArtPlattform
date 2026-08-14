import { describe, expect, it } from "vitest";
import {
  galleryArtworkPath,
  galleryCoverPath,
  isOwnedGalleryStoragePath,
} from "./galleryStoragePaths";

describe("gallery storage paths", () => {
  it("creates deterministic owner-scoped paths", () => {
    expect(galleryCoverPath("owner_1", "room-1")).toBe(
      "published/owner_1/room-1/cover.webp",
    );
    expect(galleryArtworkPath("owner_1", "room-1", 2)).toBe(
      "published/owner_1/room-1/artworks/3.webp",
    );
  });

  it("rejects traversal and indexes outside the public room contract", () => {
    expect(() => galleryCoverPath("../owner", "room-1")).toThrow();
    expect(() => galleryArtworkPath("owner", "room", 14)).toThrow();
  });

  it("recognizes only assets belonging to the expected room owner", () => {
    const path = galleryArtworkPath("owner", "room", 0);
    expect(isOwnedGalleryStoragePath(path, "owner", "room")).toBe(true);
    expect(isOwnedGalleryStoragePath(path, "other", "room")).toBe(false);
  });
});
