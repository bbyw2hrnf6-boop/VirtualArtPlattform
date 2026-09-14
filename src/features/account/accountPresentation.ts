import type { GalleryRecord } from "../../services/galleryRepository";
import { discoverEligibility, isPublicSpaceIndexEligible } from "../../services/discoverEligibility";
import { hashApplicationUrl } from "../../services/spaceRoutes";

export type AccountSection = "rooms" | "creator" | "account" | "data";

const accountSections = new Set<AccountSection>(["rooms", "creator", "account", "data"]);

export function accountSectionFromUrl(href: string): AccountSection {
  const requested = new URL(href).searchParams.get("accountSection");
  return requested && accountSections.has(requested as AccountSection)
    ? requested as AccountSection
    : "rooms";
}

export function accountSectionUrl(section: AccountSection, currentHref: string) {
  const target = new URL(hashApplicationUrl("/account", currentHref));
  target.searchParams.set("accountSection", section);
  return target.toString();
}

export function accountSectionTitle(section: AccountSection) {
  if (section === "creator") return "Public profile.";
  if (section === "account") return "Account & security.";
  if (section === "data") return "Data & rights.";
  return "Your account.";
}

export function accountSignInMethods(providers: string[]) {
  return providers.map((provider) => {
    if (provider === "google.com") return "Google";
    if (provider === "password") return "Email and password";
    return provider.replace(/\.com$/, "");
  });
}

export function isPublicProfileSpace(
  record: GalleryRecord,
  ownerId: string,
  now = Date.now(),
) {
  const owned = record.ownerId === ownerId || record.effectiveRole === "owner";
  return owned
    && record.guestPublication !== true
    && isPublicSpaceIndexEligible(record, now);
}

export function publicPlacementNote(record: GalleryRecord, now = Date.now()) {
  if (record.visibility !== "public")
    return "Set visibility to Public before choosing public placement.";
  const expiry = new Date(record.expiresAt).getTime();
  if (record.lifecycleStatus !== "active" || !Number.isFinite(expiry) || expiry <= now)
    return "Public placement is unavailable while this Space is archived or expired.";
  const eligibility = discoverEligibility({
    ...record,
    exploreListed: true,
    guestPublication: false,
  }, now);
  if (eligibility.reason === "invalid-identity")
    return "Direct link live. Replace placeholder title or creator credit, then publish a new revision.";
  if (eligibility.reason === "no-visible-content")
    return "Direct link live. Add a visible artwork, then publish a new revision.";
  if (eligibility.reason === "safety-restricted")
    return "Direct link live. Search and any requested listings await quality/safety review.";
  if (record.guestPublication)
    return "Guest Space: no Creator profile. An approved Explore listing ends 7 days after first publication; updates do not reset it.";
  return eligibility.eligible
    ? "Choose whether this Space appears in Explore Spaces on the main homepage and/or in your Creator Hub profile. Changes apply automatically."
    : "Public placement is currently unavailable.";
}
