const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_GALLERY_MEDIA = 15;

function safePath(value: unknown, ownerId: string, galleryId: string) {
  if (typeof value !== "string" || value.length > 512) return undefined;
  const prefix = `published/${ownerId}/${galleryId}/`;
  return value.startsWith(prefix) && (
    value === `${prefix}cover.webp`
    || /^artworks\/(?:[1-9]|1[0-4])[.]webp$/.test(value.slice(prefix.length))
    || /^revisions\/[A-Za-z0-9_-]{1,128}\/(?:cover[.]webp|artworks\/(?:[1-9]|1[0-4])[.]webp)$/.test(
      value.slice(prefix.length),
    )
  ) ? value : undefined;
}

export function galleryManifestStoragePaths(
  value: Record<string, unknown> | undefined,
  ownerId: string,
  galleryId: string,
) {
  if (!SAFE_SEGMENT.test(ownerId) || !SAFE_SEGMENT.test(galleryId))
    throw new Error("gallery-retirement-context-invalid");
  const paths = [
    safePath(value?.coverPath, ownerId, galleryId),
    ...(Array.isArray(value?.artworks)
      ? value.artworks.map((artwork) => safePath(
          artwork && typeof artwork === "object" ? (artwork as Record<string, unknown>).storagePath : undefined,
          ownerId,
          galleryId,
        ))
      : []),
  ].filter((path): path is string => Boolean(path));
  if (paths.length > MAX_GALLERY_MEDIA || new Set(paths).size !== paths.length)
    throw new Error("gallery-retirement-paths-invalid");
  return paths;
}

export function retiredGalleryStoragePaths({
  previous,
  currentPaths,
  ownerId,
  galleryId,
}: {
  previous: Record<string, unknown> | undefined;
  currentPaths: readonly string[];
  ownerId: string;
  galleryId: string;
}) {
  const current = new Set(currentPaths.map((path) => {
    const checked = safePath(path, ownerId, galleryId);
    if (!checked) throw new Error("gallery-retirement-paths-invalid");
    return checked;
  }));
  if (current.size > MAX_GALLERY_MEDIA) throw new Error("gallery-retirement-paths-invalid");
  return galleryManifestStoragePaths(previous, ownerId, galleryId)
    .filter((path) => !current.has(path));
}
