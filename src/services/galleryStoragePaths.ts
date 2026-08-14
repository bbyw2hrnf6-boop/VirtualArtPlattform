const SAFE_SEGMENT = /^[a-zA-Z0-9_-]{1,128}$/;

function safeSegment(value: string, label: string) {
  if (!SAFE_SEGMENT.test(value)) throw new Error(`Invalid ${label} for gallery storage.`);
  return value;
}

export function galleryStorageRoot(ownerId: string, galleryId: string) {
  return `published/${safeSegment(ownerId, "owner")}/${safeSegment(galleryId, "gallery")}`;
}

export function galleryCoverPath(ownerId: string, galleryId: string) {
  return `${galleryStorageRoot(ownerId, galleryId)}/cover.webp`;
}

export function galleryArtworkPath(ownerId: string, galleryId: string, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= 14)
    throw new Error("Invalid artwork index for gallery storage.");
  return `${galleryStorageRoot(ownerId, galleryId)}/artworks/${index + 1}.webp`;
}

export function galleryRevisionRoot(
  ownerId: string,
  galleryId: string,
  revisionId: string,
) {
  return `${galleryStorageRoot(ownerId, galleryId)}/revisions/${safeSegment(revisionId, "revision")}`;
}

export function galleryRevisionCoverPath(
  ownerId: string,
  galleryId: string,
  revisionId: string,
) {
  return `${galleryRevisionRoot(ownerId, galleryId, revisionId)}/cover.webp`;
}

export function galleryRevisionArtworkPath(
  ownerId: string,
  galleryId: string,
  revisionId: string,
  index: number,
) {
  if (!Number.isInteger(index) || index < 0 || index >= 14)
    throw new Error("Invalid artwork index for gallery storage.");
  return `${galleryRevisionRoot(ownerId, galleryId, revisionId)}/artworks/${index + 1}.webp`;
}

export function isOwnedGalleryStoragePath(path: string, ownerId: string, galleryId: string) {
  const root = galleryStorageRoot(ownerId, galleryId);
  return path === galleryCoverPath(ownerId, galleryId)
    || Array.from({ length: 14 }, (_, index) => galleryArtworkPath(ownerId, galleryId, index)).includes(path)
    || new RegExp(`^${root}/revisions/[a-zA-Z0-9_-]{1,128}/(?:cover[.]webp|artworks/(?:[1-9]|1[0-4])[.]webp)$`).test(path);
}
