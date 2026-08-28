import type { GalleryRecord } from "../../services/galleryRepository";

export type AccountSection = "rooms" | "creator" | "account" | "data";

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
    && record.visibility === "public"
    && record.lifecycleStatus === "active"
    && new Date(record.expiresAt).getTime() > now;
}
