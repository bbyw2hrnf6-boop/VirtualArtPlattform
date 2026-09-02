import type { GalleryRecord } from "./galleryRepository";

export type DiscoverEligibilityReason =
  | "eligible"
  | "not-public"
  | "not-active"
  | "expired"
  | "review-pending"
  | "not-listed"
  | "invalid-identity"
  | "no-visible-content";

export type DiscoverEligibility = {
  eligible: boolean;
  reason: DiscoverEligibilityReason;
};

function hasPublicIdentity(record: Pick<GalleryRecord, "title" | "artist">) {
  const title = record.title.trim();
  const creator = record.artist.trim();
  const placeholderTitle = /^(?:untitled|test|demo)(?:\b|[-_\s])/i;
  const placeholderCreator = /^(?:your(?:[-_\s]*name|\d)|test(?:\b|[-_\s])|demo(?:\b|[-_\s]))/i;
  return title.length >= 3
    && creator.length >= 2
    && !placeholderTitle.test(title)
    && !placeholderCreator.test(creator);
}

function hasVisibleMedia(record: Pick<GalleryRecord, "artworks">) {
  return record.artworks.some((artwork) =>
    !artwork.hidden && Boolean(artwork.src || artwork.storagePath || artwork.assetId),
  );
}

/**
 * Public access and Discover eligibility are deliberately separate concepts.
 * A public Space remains reachable by URL even when it is held out of the
 * curated Discover surface. `discoverEligible: true` is a trusted operator
 * approval. False or missing values remain shareable by direct URL, but stay
 * out of public discovery and indexing until review. Defensive placeholder and
 * visible-media checks mirror the server response policy.
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
  > & { exploreListed?: boolean },
  now = Date.now(),
): DiscoverEligibility {
  if (record.visibility !== "public")
    return { eligible: false, reason: "not-public" };
  if (record.lifecycleStatus !== "active")
    return { eligible: false, reason: "not-active" };
  const expiry = new Date(record.expiresAt).getTime();
  if (!Number.isFinite(expiry) || expiry <= now)
    return { eligible: false, reason: "expired" };
  if (record.discoverEligible !== true)
    return { eligible: false, reason: "review-pending" };
  if (record.exploreListed === false)
    return { eligible: false, reason: "not-listed" };
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

/**
 * Public URL indexing is independent from optional homepage placement. A
 * Creator can remove a Space from Explore without breaking its direct URL or
 * creating a client/server robots mismatch.
 */
export function isPublicSpaceIndexEligible(
  record: Parameters<typeof discoverEligibility>[0],
  now = Date.now(),
) {
  return discoverEligibility({ ...record, exploreListed: true }, now).eligible;
}
