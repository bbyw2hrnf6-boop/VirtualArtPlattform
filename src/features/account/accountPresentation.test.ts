import { describe, expect, it } from "vitest";
import type { GalleryRecord } from "../../services/galleryRepository";
import accountSource from "./AccountDialog.tsx?raw";
import creatorSettingsSource from "./CreatorProfileSettings.tsx?raw";
import {
  accountSectionFromUrl,
  accountSectionTitle,
  accountSectionUrl,
  accountSignInMethods,
  isPublicProfileSpace,
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
    expect(creatorSettingsSource).toContain('<b>Publish profile</b>');
    expect(creatorSettingsSource).not.toContain('Public profile is live');
    expect(creatorSettingsSource).not.toContain('Publish public profile');
    expect(creatorSettingsSource).not.toContain('<dd>Profile status</dd>');
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
      lifecycleStatus: "active",
      expiresAt: "2030-01-01T00:00:00.000Z",
    } as GalleryRecord;
    expect(isPublicProfileSpace(space, "owner-1", Date.parse("2029-01-01"))).toBe(true);
    expect(isPublicProfileSpace({ ...space, visibility: "private" }, "owner-1", Date.parse("2029-01-01"))).toBe(false);
    expect(isPublicProfileSpace({ ...space, ownerId: "other", effectiveRole: "viewer" }, "owner-1", Date.parse("2029-01-01"))).toBe(false);
    expect(isPublicProfileSpace({ ...space, expiresAt: "2028-01-01T00:00:00.000Z" }, "owner-1", Date.parse("2029-01-01"))).toBe(false);
  });
});
