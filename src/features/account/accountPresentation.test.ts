import { describe, expect, it } from "vitest";
import type { GalleryRecord } from "../../services/galleryRepository";
import accountSource from "./AccountDialog.tsx?raw";
import creatorSettingsSource from "./CreatorProfileSettings.tsx?raw";
import accountServiceSource from "../../services/accountService.ts?raw";
import {
  accountSectionFromUrl,
  accountSectionTitle,
  accountSectionUrl,
  accountSignInMethods,
  isPublicProfileSpace,
  publicPlacementNote,
} from "./accountPresentation";

describe("account presentation", () => {
  it("keeps the settings hierarchy explicit", () => {
    expect(accountSectionTitle("rooms")).toBe("Your account.");
    expect(accountSectionTitle("creator")).toBe("Public profile.");
    expect(accountSectionTitle("account")).toBe("Account & security.");
    expect(accountSectionTitle("data")).toBe("Data & rights.");
  });

  it("deep-links to one real account section without changing the app route", () => {
    const url = accountSectionUrl("creator", "https://lieuva.com/creators");
    expect(url).toBe("https://lieuva.com/?accountSection=creator#/account");
    expect(accountSectionFromUrl(url)).toBe("creator");
    expect(accountSectionFromUrl("https://lieuva.com/?accountSection=unknown#/account")).toBe("rooms");
  });

  it("uses the redesigned section navigation alone on the full account page", () => {
    expect(accountSource).toContain('className="account-local-nav"');
    expect(accountSource).toContain('className="account-local-nav__sections"');
    expect(accountSource).toContain('className="account-local-nav__scroll-cue"');
    expect(accountSource).toContain('data-account-section={section}');
    expect(accountSource).toContain('{presentation !== "page" && <div className="account-tabs account-tabs--settings"');
  });

  it("keeps one profile state instead of repeating activation headings", () => {
    expect(creatorSettingsSource).toContain('<strong>Profile visibility</strong>');
    expect(creatorSettingsSource).toContain('<b>Make profile public</b>');
    expect(creatorSettingsSource).not.toContain("review pending");
    expect(creatorSettingsSource).not.toContain("queued for review");
    expect(creatorSettingsSource).not.toContain('Public profile is live');
    expect(creatorSettingsSource).not.toContain('Publish public profile');
    expect(creatorSettingsSource).not.toContain('<dd>Profile status</dd>');
  });

  it("offers a real cover and safe profile style presets with live preview", () => {
    expect(creatorSettingsSource).toContain("Title image");
    expect(creatorSettingsSource).toContain("saveCreatorProfileCover");
    expect(creatorSettingsSource).toContain('aria-label="Bio typography"');
    expect(creatorSettingsSource).toContain('aria-label="Profile header color mood"');
    expect(creatorSettingsSource).toContain("creator-settings__preview-bio--");
    expect(creatorSettingsSource).toContain("loadMyCreatorProfileBundle");
    expect(creatorSettingsSource).toContain("storedImageSource");
    expect(creatorSettingsSource).toContain("storedCoverSource");
    expect(creatorSettingsSource).not.toContain("creator-public/");
  });

  it("keeps the private account avatar visible when a direct Storage read fails", () => {
    expect(accountServiceSource).toContain('"getMyAuraAccountAvatar"');
    expect(accountServiceSource).toContain("accountAvatarFallback");
  });

  it("keeps public visibility separate from homepage and Hub placement", () => {
    expect(accountSource).toContain("galleryRepository.updateDistribution");
    expect(accountSource).toContain('field: "exploreListed" | "creatorProfileListed"');
    expect(accountSource).toContain("Explore Spaces (Main homepage)");
    expect(accountSource).toContain("Show in Creator Hub");
    expect(accountSource).not.toContain("In Discover");
    expect(creatorSettingsSource).toContain("spaces.filter((space) => space.creatorProfileListed)");
    expect(creatorSettingsSource).toContain("Hub Space placement");
    expect(creatorSettingsSource).toContain('accountSectionUrl("rooms", window.location.href)');
    expect(creatorSettingsSource).not.toContain("galleryRepository.updateDistribution");
    expect(creatorSettingsSource).not.toContain("updateProfileSpace");
    expect(creatorSettingsSource).toContain("Space preview image");
    const distributionHandler = accountSource.slice(
      accountSource.indexOf("const updateRoomDistribution"),
      accountSource.indexOf("const exportRoom"),
    );
    expect(distributionHandler).toContain("await loadRooms()");
    expect(distributionHandler).not.toContain("setRooms((current)");
  });

  it("explains pending editorial review without promising a placement-toggle workaround", () => {
    expect(accountSource).not.toContain("Save either placement choice once");
  });

  it("offers one accessible filter system across the Space overview and list", () => {
    expect(accountSource).toContain('type AccountRoomFilter = "all" | "live" | "explore" | "hub" | "shared"');
    expect(accountSource).toContain('aria-label="Filter Spaces by status"');
    expect(accountSource).toContain('aria-label="Space filters"');
    expect(accountSource).toContain('aria-pressed={roomFilter === "hub"}');
    expect(accountSource).toContain('aria-controls="account-room-list"');
    expect(accountSource).toContain("filteredRooms.map");
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
      discoverEligible: true,
      creatorProfileListed: true,
      guestPublication: false,
      lifecycleStatus: "active",
      expiresAt: "2030-01-01T00:00:00.000Z",
      title: "Material Study",
      artist: "Field Studio",
      artworks: [{ src: "/art.webp" }],
    } as GalleryRecord;
    expect(isPublicProfileSpace(space, "owner-1", Date.parse("2029-01-01"))).toBe(true);
    expect(isPublicProfileSpace({ ...space, discoverEligible: false }, "owner-1", Date.parse("2029-01-01"))).toBe(false);
    expect(isPublicProfileSpace({ ...space, creatorProfileListed: false }, "owner-1", Date.parse("2029-01-01"))).toBe(true);
    expect(isPublicProfileSpace({ ...space, guestPublication: true }, "owner-1", Date.parse("2029-01-01"))).toBe(false);
    expect(isPublicProfileSpace({ ...space, artworks: [] }, "owner-1", Date.parse("2029-01-01"))).toBe(false);
    expect(isPublicProfileSpace({
      ...space,
      title: "Pavilion Test",
      artist: "LIEUVA Sample Collection",
    }, "owner-1", Date.parse("2029-01-01"))).toBe(false);
    expect(isPublicProfileSpace({ ...space, visibility: "private" }, "owner-1", Date.parse("2029-01-01"))).toBe(false);
    expect(isPublicProfileSpace({ ...space, ownerId: "other", effectiveRole: "viewer" }, "owner-1", Date.parse("2029-01-01"))).toBe(false);
    expect(isPublicProfileSpace({ ...space, expiresAt: "2028-01-01T00:00:00.000Z" }, "owner-1", Date.parse("2029-01-01"))).toBe(false);
  });

  it("distinguishes review from Creator-fixable public placement failures", () => {
    const space = {
      visibility: "public",
      lifecycleStatus: "active",
      expiresAt: "2030-01-01T00:00:00.000Z",
      title: "Material Study",
      artist: "Field Studio",
      artworks: [{ src: "/art.webp" }],
      discoverEligible: false,
    } as GalleryRecord;
    const now = Date.parse("2029-01-01");
    expect(publicPlacementNote(space, now)).toContain("await quality/safety review");
    expect(publicPlacementNote({ ...space, title: "Untitled Space", artist: "Your name" }, now))
      .toContain("Replace placeholder title or creator credit");
    expect(publicPlacementNote({ ...space, artworks: [] }, now))
      .toContain("Add a visible artwork");
  });
});
