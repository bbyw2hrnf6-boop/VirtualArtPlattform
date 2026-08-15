export const GALLERY_VISIBILITIES = ["public", "unlisted", "private"] as const;
export type GalleryVisibility = (typeof GALLERY_VISIBILITIES)[number];

export function parseGalleryId(value: unknown) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{2,99}$/i.test(value)
    ? value
    : null;
}

export function normalizeMemberEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^/@]+@[^/@]+[.][^/@]+$/.test(email)
    ? email
    : null;
}

export function publicationTerms(
  verified: boolean,
  visibility: GalleryVisibility,
  now: number,
) {
  if (!verified && visibility !== "public") return null;
  const days = verified ? 365 : 10;
  return {
    retention: verified ? "account-preview" as const : "guest-10-days" as const,
    expiresAt: new Date(now + days * 86_400_000),
  };
}
