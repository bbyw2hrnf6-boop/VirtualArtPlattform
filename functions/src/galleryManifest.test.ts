import { describe, expect, it } from "vitest";
import {
  expectedGalleryUploadPaths,
  validateGalleryDistribution,
  validateTrustedGalleryManifest,
} from "./galleryManifest.js";

const context = {
  ownerId: "owner-1",
  galleryId: "space-123",
};

function validManifest(overrides: Record<string, unknown> = {}) {
  return {
    title: "Material Futures",
    artist: "Studio North",
    templateId: "white-cube",
    wall: "chalk",
    floor: "concrete",
    ceiling: "gallery",
    lighting: "daylight",
    decor: [{ id: "plant-1", type: "olive", x: 1, z: 2, rotation: 0, scale: 1 }],
    artworks: [{
      id: "work-1",
      title: "Study",
      src: "",
      storagePath: "published/owner-1/space-123/artworks/1.webp",
      aspect: 1.25,
      wall: "north",
      x: 0,
      y: 2,
      scale: 1,
      frame: "oak",
    }],
    ...overrides,
  };
}

describe("trusted gallery manifest", () => {
  it("normalizes a bounded create manifest and derives exact upload paths", () => {
    const manifest = validateTrustedGalleryManifest(validManifest(), context);
    expect(manifest).toMatchObject({ title: "Material Futures", templateId: "white-cube" });
    expect(expectedGalleryUploadPaths(manifest, context)).toEqual([
      "published/owner-1/space-123/cover.webp",
      "published/owner-1/space-123/artworks/1.webp",
    ]);
  });

  it("preserves text accepted by the shipped client validator", () => {
    const manifest = validateTrustedGalleryManifest(validManifest({
      title: "  Material Futures ",
      artist: " Studio North  ",
    }), context);
    expect(manifest.title).toBe("  Material Futures ");
    expect(manifest.artist).toBe(" Studio North  ");
  });

  it("accepts only the exact immutable revision prefix", () => {
    const revisionContext = { ...context, revisionId: "r2-abc" };
    const manifest = validManifest({
      artworks: [{
        ...validManifest().artworks[0],
        storagePath: "published/owner-1/space-123/revisions/r2-abc/artworks/1.webp",
      }],
    });
    expect(validateTrustedGalleryManifest(manifest, revisionContext).artworks[0].storagePath)
      .toContain("/revisions/r2-abc/");
    expect(() => validateTrustedGalleryManifest(manifest, { ...revisionContext, revisionId: "r2-other" }))
      .toThrow(/trusted upload slot/);
  });

  it("rejects hostile fields, embedded bytes, malformed geometry, and excess lists", () => {
    expect(() => validateTrustedGalleryManifest({ ...validManifest(), ownerId: "attacker" }, context))
      .toThrow(/unexpected field ownerId/);
    expect(() => validateTrustedGalleryManifest(validManifest({
      artworks: [{ ...validManifest().artworks[0], src: "data:image/png;base64,AAAA" }],
    }), context)).toThrow(/embedded image data is forbidden/);
    expect(() => validateTrustedGalleryManifest(validManifest({
      artworks: [{ ...validManifest().artworks[0], x: 100 }],
    }), context)).toThrow(/finite number/);
    expect(() => validateTrustedGalleryManifest(validManifest({
      artworks: Array.from({ length: 9 }, (_, index) => ({
        ...validManifest().artworks[0],
        id: `work-${index}`,
        storagePath: `published/owner-1/space-123/artworks/${index + 1}.webp`,
      })),
    }), context)).toThrow(/at most 8/);
    expect(() => expectedGalleryUploadPaths(validManifest() as never, {
      ownerId: null as never,
      galleryId: "space-123",
    })).toThrow(/portable identifier/);
  });

  it("strips legacy asset IDs and requires explicit bounded distribution", () => {
    const manifest = validateTrustedGalleryManifest(validManifest({
      artworks: [{ ...validManifest().artworks[0], assetId: "legacy-asset" }],
    }), context);
    expect(manifest.artworks[0]).not.toHaveProperty("assetId");
    expect(validateGalleryDistribution({ exploreListed: true, creatorProfileListed: false }))
      .toEqual({ exploreListed: true, creatorProfileListed: false });
    expect(() => validateGalleryDistribution({ exploreListed: true }))
      .toThrow(/explicit boolean/);
  });
});
