import { describe, expect, it } from "vitest";
import {
  creatorCanonicalUrl,
  isReservedCreatorHandle,
  isValidCreatorWebp,
  normalizeCreatorHandle,
  parseCreatorProfileInput,
  publicCreatorDirectoryEntry,
  renderCreatorDocument,
} from "./creatorIdentity.js";

const SHELL = "<!doctype html><html><head><title>Home</title><meta name=\"robots\" content=\"index\"><link rel=\"canonical\" href=\"https://lieuva.com/\"></head><body><div id=\"root\"></div></body></html>";

describe("Creator identity contract", () => {
  it("normalizes case but rejects destructive or unsafe transformations", () => {
    expect(normalizeCreatorHandle(" Studio-North ")).toBe("studio-north");
    for (const value of ["st", "studio north", "studio_north", "studio--north", "-studio", "crëator"])
      expect(normalizeCreatorHandle(value)).toBeNull();
  });

  it("reserves product and routing names", () => {
    expect(isReservedCreatorHandle("LIEUVA")).toBe(true);
    expect(normalizeCreatorHandle("spaces")).toBeNull();
  });

  it("accepts only bounded WebP payloads", () => {
    const webp = Buffer.from("RIFF0000WEBPpayload", "ascii");
    expect(isValidCreatorWebp(webp)).toBe(true);
    expect(isValidCreatorWebp(Buffer.from("not-an-image"))).toBe(false);
    const oversized = Buffer.alloc(512 * 1024 + 1);
    oversized.write("RIFF", 0, "ascii");
    oversized.write("WEBP", 8, "ascii");
    expect(isValidCreatorWebp(oversized)).toBe(false);
  });

  it("validates the narrow public projection", () => {
    expect(parseCreatorProfileInput({
      handle: "studio-north",
      displayName: "Studio North",
      bio: "Spatial work.",
      profilePublic: true,
      imagePresent: false,
      links: [{ label: "Website", url: "https://example.com" }],
    })).toMatchObject({ handle: "studio-north", profilePublic: true });
    expect(parseCreatorProfileInput({
      handle: "studio-north", displayName: "Studio North", bio: "", profilePublic: true,
      links: [{ label: "Bad", url: "http://example.com" }],
    })).toBeNull();
  });

  it("lists only public profiles through the Creator directory projection", () => {
    const profile = {
      handle: "studio-north",
      displayName: "Studio North",
      bio: "Spatial work.",
      links: [],
      imagePresent: true,
    };
    expect(publicCreatorDirectoryEntry({ ...profile, profilePublic: true })).toEqual({
      handle: "studio-north",
      displayName: "Studio North",
      bio: "Spatial work.",
      imagePresent: true,
    });
    expect(publicCreatorDirectoryEntry({ ...profile, profilePublic: false })).toBeNull();
  });

  it("renders public metadata without an internal identifier", () => {
    const html = renderCreatorDocument(SHELL, {
      kind: "public",
      profile: { handle: "studio-north", displayName: "Studio North", bio: "Spatial work.", links: [], profilePublic: true, imagePresent: false },
      spaces: [{ id: "space-safe", title: "Material Futures", creator: "Studio North", coverUrl: "https://lieuva.com/space-cards/space-safe" }],
    });
    expect(html).toContain(creatorCanonicalUrl("studio-north"));
    expect(html).toContain("ProfilePage");
    expect(html).not.toContain("ownerId");
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
  });

  it("keeps non-public profiles generic and noindex", () => {
    const html = renderCreatorDocument(SHELL, { kind: "not-found", handle: "hidden-name" });
    expect(html).toContain("noindex,nofollow,noarchive");
    expect(html).not.toContain("hidden-name");
  });
});
