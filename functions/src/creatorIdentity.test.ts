import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  classifyCreatorDocumentRoute,
  creatorNotificationProjection,
  creatorFollowTransition,
  creatorCanonicalUrl,
  creatorPublicContentMatches,
  isReservedCreatorHandle,
  isCreatorProfileSpaceListed,
  isReviewedPublicCreatorProfile,
  isValidCreatorWebp,
  normalizeCreatorHandle,
  parseCreatorPostInput,
  parseCreatorCommentInput,
  parseCreatorReportReason,
  parseCreatorProfileInput,
  publicCreatorDirectoryEntry,
  renderCreatorDirectoryDocument,
  renderCreatorDocument,
  renderCreatorHubDocument,
} from "./creatorIdentity.js";

const SHELL = "<!doctype html><html><head><title>Home</title><meta name=\"robots\" content=\"index\"><meta property=\"og:image:width\" content=\"1200\"><meta name=\"twitter:image:alt\" content=\"Old alt\"><link rel=\"canonical\" href=\"https://lieuva.com/\"></head><body><div id=\"root\"></div></body></html>";

describe("Creator identity contract", () => {
  it("separates the public directory, private Hub and stable profile routes", () => {
    expect(classifyCreatorDocumentRoute("/creators")).toEqual({ kind: "directory" });
    expect(classifyCreatorDocumentRoute("/creator-hub/")).toEqual({ kind: "hub" });
    expect(classifyCreatorDocumentRoute("/creator-hub/profile")).toEqual({ kind: "hub" });
    expect(classifyCreatorDocumentRoute("/creators/studio-north")).toEqual({
      kind: "profile",
      handle: "studio-north",
    });
    expect(classifyCreatorDocumentRoute("/creator-hub/nested")).toEqual({ kind: "malformed" });
    expect(classifyCreatorDocumentRoute("/creators/studio/nested")).toEqual({ kind: "malformed" });
  });

  it("normalizes case but rejects destructive or unsafe transformations", () => {
    expect(normalizeCreatorHandle(" Studio-North ")).toBe("studio-north");
    for (const value of ["st", "studio north", "studio_north", "studio--north", "-studio", "crëator"])
      expect(normalizeCreatorHandle(value)).toBeNull();
  });

  it("keeps legacy profile Spaces visible but honors an explicit profile opt-out", () => {
    expect(isCreatorProfileSpaceListed({})).toBe(true);
    expect(isCreatorProfileSpaceListed({ creatorProfileListed: true })).toBe(true);
    expect(isCreatorProfileSpaceListed({ creatorProfileListed: false })).toBe(false);
  });

  it("reserves product and routing names", () => {
    expect(isReservedCreatorHandle("LIEUVA")).toBe(true);
    expect(normalizeCreatorHandle("creator-hub")).toBeNull();
    expect(normalizeCreatorHandle("spaces")).toBeNull();
    expect(normalizeCreatorHandle("mira-vale")).toBeNull();
  });

  it("fully decodes only bounded, single-frame WebP payloads", async () => {
    const webp = await sharp({
      create: { width: 3, height: 2, channels: 4, background: "#ff00ffff" },
    }).webp().toBuffer();
    await expect(isValidCreatorWebp(webp)).resolves.toBe(true);
    await expect(isValidCreatorWebp(Buffer.from("RIFF0000WEBPpayload", "ascii"))).resolves.toBe(false);
    await expect(isValidCreatorWebp(Buffer.from("not-an-image"))).resolves.toBe(false);

    const oversized = Buffer.alloc(512 * 1024 + 1);
    oversized.write("RIFF", 0, "ascii");
    oversized.write("WEBP", 8, "ascii");
    await expect(isValidCreatorWebp(oversized)).resolves.toBe(false);

    const overwide = await sharp({
      create: { width: 4_097, height: 1, channels: 3, background: "#000000" },
    }).webp().toBuffer();
    await expect(isValidCreatorWebp(overwide)).resolves.toBe(false);

    const animated = Buffer.from(
      "UklGRpQAAABXRUJQVlA4WAoAAAACAAAAAAAAAAAAQU5JTQYAAAD/////AABBTk1GMAAAAAAAAAAAAAAAAAAAAGQAAAJWUDggGAAAADABAJ0BKgEAAQABQCYlpAADcAD+/TZoAEFOTUYwAAAAAAAAAAAAAAAAAAAAZAAAAFZQOCAYAAAANAEAnQEqAQABAAAAJiWkAANwAP789AAA",
      "base64",
    );
    await expect(isValidCreatorWebp(animated)).resolves.toBe(false);
  });

  it("validates the narrow public projection", () => {
    expect(parseCreatorProfileInput({
      handle: "studio-north",
      displayName: "Studio North",
      bio: "Spatial work.",
      profilePublic: true,
      discoverEligible: true,
      imagePresent: false,
      links: [{ label: "Website", url: "https://example.com" }],
    })).toMatchObject({
      handle: "studio-north",
      profilePublic: true,
      discoverEligible: true,
      coverPresent: false,
      bioFont: "sans",
      profileTone: "paper",
    });
    expect(parseCreatorProfileInput({
      handle: "studio-north",
      displayName: "Studio North",
      bio: "Spatial work.",
      profilePublic: true,
      imagePresent: true,
      coverPresent: true,
      bioFont: "editorial",
      profileTone: "ink",
      links: [],
    })).toMatchObject({ coverPresent: true, bioFont: "editorial", profileTone: "ink" });
    expect(parseCreatorProfileInput({
      handle: "studio-north", displayName: "Studio North", bio: "", profilePublic: true,
      bioFont: "comic-sans", links: [],
    })).toBeNull();
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
    expect(publicCreatorDirectoryEntry({ ...profile, profilePublic: true, discoverEligible: true })).toEqual({
      handle: "studio-north",
      displayName: "Studio North",
      bio: "Spatial work.",
      imagePresent: true,
      followerCount: 0,
    });
    expect(publicCreatorDirectoryEntry({ ...profile, profilePublic: true })).toBeNull();
    expect(publicCreatorDirectoryEntry({ ...profile, profilePublic: true, discoverEligible: false })).toBeNull();
    expect(publicCreatorDirectoryEntry({ ...profile, profilePublic: false })).toBeNull();
  });

  it("requires trusted review and detects owner-controlled public changes", () => {
    const approved = parseCreatorProfileInput({
      handle: "studio-north", displayName: "Studio North", bio: "Spatial work.", links: [],
      profilePublic: true, discoverEligible: true,
    });
    expect(isReviewedPublicCreatorProfile(approved)).toBe(true);
    const same = parseCreatorProfileInput({
      handle: "studio-north", displayName: "Studio North", bio: "Spatial work.", links: [],
      profilePublic: true,
    });
    expect(same?.discoverEligible).toBe(false);
    expect(approved && same && creatorPublicContentMatches(approved, same)).toBe(true);
    const changed = parseCreatorProfileInput({
      handle: "studio-north", displayName: "Studio North", bio: "Changed.", links: [],
      profilePublic: true,
    });
    expect(approved && changed && creatorPublicContentMatches(approved, changed)).toBe(false);
  });

  it("accepts bounded Creator posts and preserves intentional paragraph breaks", () => {
    expect(parseCreatorPostInput("  New room.\n\nProcess notes.  ")).toBe("New room.\n\nProcess notes.");
    expect(parseCreatorPostInput("   ")).toBeNull();
    expect(parseCreatorPostInput("x".repeat(601))).toBeNull();
  });

  it("bounds comments and allow-lists report reasons", () => {
    expect(parseCreatorCommentInput("  Thoughtful note.  ")).toBe("Thoughtful note.");
    expect(parseCreatorCommentInput("x".repeat(281))).toBeNull();
    expect(parseCreatorReportReason("rights")).toBe("rights");
    expect(parseCreatorReportReason("delete-everything")).toBeNull();
  });

  it("renders public metadata without an internal identifier", () => {
    const html = renderCreatorDocument(SHELL, {
      kind: "public",
      profile: { handle: "studio-north", displayName: "Studio North", bio: "Spatial work.", links: [{ label: "Website", url: "https://example.com" }], profilePublic: true, discoverEligible: true, imagePresent: true, coverPresent: true, bioFont: "serif", profileTone: "warm", followerCount: 0 },
      spaces: [{ id: "space-safe", title: "Material Futures", creator: "Studio North", coverUrl: "https://lieuva.com/space-cards/space-safe" }],
      posts: [],
    });
    expect(html).toContain(creatorCanonicalUrl("studio-north"));
    expect(html).toContain("ProfilePage");
    expect(html).toContain('"mainEntity":{"@type":"Person"');
    expect(html).toContain('"alternateName":"@studio-north"');
    expect(html).toContain('"sameAs":["https://example.com"]');
    expect(html).toContain('name="twitter:image:alt" content="Public Creator profile for Studio North"');
    expect(html).toContain("https://lieuva.com/creator-covers/studio-north.webp");
    expect(html).not.toContain("og:image:width");
    expect(html).not.toContain("Old alt");
    expect(html).not.toContain("ownerId");
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
  });

  it("keeps non-public profiles generic and noindex", () => {
    const html = renderCreatorDocument(SHELL, { kind: "not-found", handle: "hidden-name" });
    expect(html).toContain("noindex,nofollow,noarchive");
    expect(html).not.toContain("hidden-name");
  });

  it("renders the public Creator directory as a canonical indexable route", () => {
    const html = renderCreatorDirectoryDocument(SHELL);
    expect(html).toContain("Creators | LIEUVA");
    expect(html).toContain("https://lieuva.com/creators");
    expect(html).toContain("index,follow,max-image-preview:large");
    expect(html).toContain('name="lieuva:creator-route" content="directory"');
    expect(html).toContain("CollectionPage");
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html).not.toContain("Creator unavailable");
  });

  it("renders the personalized Creator Hub noindex with a self-canonical URL", () => {
    const html = renderCreatorHubDocument(SHELL);
    expect(html).toContain("Creator Hub | LIEUVA");
    expect(html).toContain("https://lieuva.com/creator-hub");
    expect(html).toContain("noindex,nofollow,noarchive");
    expect(html).toContain('name="lieuva:creator-route" content="hub"');
    expect(html).not.toContain("CollectionPage");
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
  });

  it("keeps follow and unfollow transitions idempotent and non-negative", () => {
    expect(creatorFollowTransition("follow", false, 2)).toEqual({ following: true, followerCount: 3, changed: true });
    expect(creatorFollowTransition("follow", true, 3)).toEqual({ following: true, followerCount: 3, changed: false });
    expect(creatorFollowTransition("unfollow", true, 0)).toEqual({ following: false, followerCount: 0, changed: true });
    expect(creatorFollowTransition("unfollow", false, 0)).toEqual({ following: false, followerCount: 0, changed: false });
  });

  it("allow-lists notification targets and preserves bounded comment context", () => {
    expect(creatorNotificationProjection({
      kind: "comment",
      actorHandle: "studio-north",
      actorDisplayName: "Studio North",
      postId: "post_123",
      bodyPreview: `  ${"x".repeat(120)}  `,
      read: false,
      privateOwnerId: "never-return-this",
    }, "2026-08-31T12:00:00.000Z")).toEqual({
      kind: "comment",
      actorHandle: "studio-north",
      actorDisplayName: "Studio North",
      postId: "post_123",
      bodyPreview: "x".repeat(100),
      createdAt: "2026-08-31T12:00:00.000Z",
      read: false,
    });
    expect(creatorNotificationProjection({ kind: "unknown", actorHandle: "x", actorDisplayName: "X" }, "2026-08-31T12:00:00.000Z")).toBeNull();
    expect(creatorNotificationProjection({ kind: "follow", actorHandle: "studio-north", actorDisplayName: "Studio North" }, "not-a-date")).toBeNull();
  });
});
