export const GALLERY_VISIBILITIES = ["public", "unlisted", "private"] as const;
export type GalleryVisibility = (typeof GALLERY_VISIBILITIES)[number];

/** Guest identity is authenticated by Firebase, never by a client payload. */
export function isGuestPublisher(auth: { token: Record<string, unknown> } | undefined) {
  const firebase = auth?.token.firebase;
  return Boolean(firebase && typeof firebase === "object"
    && (firebase as { sign_in_provider?: unknown }).sign_in_provider === "anonymous");
}

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
  guest = false,
) {
  if ((!verified && !guest) || (guest && visibility !== "public")) return null;
  return {
    // Storage lifetime is independent of the seven-day Explore placement.
    // Keep the existing extended-preview retention/cleanup contract.
    retention: "account-preview" as const,
    expiresAt: new Date(now + 365 * 86_400_000),
    guestPublication: guest,
  };
}
