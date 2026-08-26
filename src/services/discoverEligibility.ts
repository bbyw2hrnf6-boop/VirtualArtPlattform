import type { GalleryRecord } from "./galleryRepository";

export type DiscoverEligibilityReason =
  | "eligible"
  | "not-public"
  | "not-active"
  | "expired"
  | "moderation-disabled"
  | "invalid-identity"
  | "no-visible-content";

export type DiscoverEligibility = {
  eligible: boolean;
  reason: DiscoverEligibilityReason;
};

function hasPublicIdentity(record: Pick<GalleryRecord, "title" | "artist">) {
  const title = record.title.trim();
  const creator = record.artist.trim();
  return title.length >= 3 && creator.length >= 2;
}

function hasVisibleMedia(record: Pick<GalleryRecord, "artworks">) {
  return record.artworks.some((artwork) =>
    !artwork.hidden && Boolean(artwork.src || artwork.storagePath || artwork.assetId),
  );
}

/**
 * Public access and Discover eligibility are deliberately separate concepts.
 * A public Space remains reachable by URL even when it is held out of the
 * curated Discover surface. An optional persisted `discoverEligible: false`
 * is a backwards-compatible moderation switch. Published public Spaces are
 * not silently hidden just because their creator has not renamed starter text.
 */
export function discoverEligibility(
  record: Pick<
    GalleryRecord,
    | "visibility"
    | "lifecycleStatus"
    | "expiresAt"
    | "title"
    | "artist"
    | "artworks"
    | "discoverEligible"
  >,
  now = Date.now(),
): DiscoverEligibility {
  if (record.visibility !== "public")
    return { eligible: false, reason: "not-public" };
  if (record.lifecycleStatus !== "active")
    return { eligible: false, reason: "not-active" };
  const expiry = new Date(record.expiresAt).getTime();
  if (!Number.isFinite(expiry) || expiry <= now)
    return { eligible: false, reason: "expired" };
  if (record.discoverEligible === false)
    return { eligible: false, reason: "moderation-disabled" };
  if (!hasPublicIdentity(record))
    return { eligible: false, reason: "invalid-identity" };
  if (!hasVisibleMedia(record))
    return { eligible: false, reason: "no-visible-content" };
  return { eligible: true, reason: "eligible" };
}

export function isDiscoverEligible(
  record: Parameters<typeof discoverEligibility>[0],
  now = Date.now(),
) {
  return discoverEligibility(record, now).eligible;
}
