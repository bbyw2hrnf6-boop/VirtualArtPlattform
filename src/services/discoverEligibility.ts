import type { GalleryRecord } from "./galleryRepository";

export type DiscoverEligibilityReason =
  | "eligible"
  | "not-public"
  | "not-active"
  | "expired"
  | "moderation-disabled"
  | "placeholder-identity"
  | "no-visible-content";

export type DiscoverEligibility = {
  eligible: boolean;
  reason: DiscoverEligibilityReason;
};

const PLACEHOLDER_TITLE = /^(?:untitled|test|demo)(?:\b|[-_\s])/i;
const PLACEHOLDER_CREATOR = /^(?:your(?:[-_\s]*name|\d)|test(?:\b|[-_\s])|demo(?:\b|[-_\s]))/i;

function hasPublicIdentity(record: Pick<GalleryRecord, "title" | "artist">) {
  const title = record.title.trim();
  const creator = record.artist.trim();
  return title.length >= 3
    && creator.length >= 2
    && !PLACEHOLDER_TITLE.test(title)
    && !PLACEHOLDER_CREATOR.test(creator);
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
 * is a backwards-compatible moderation switch; missing legacy values fall
 * back to deterministic quality checks.
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
    return { eligible: false, reason: "placeholder-identity" };
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
