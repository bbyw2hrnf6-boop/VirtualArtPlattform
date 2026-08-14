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

export function isOwnedGalleryStoragePath(path: string, ownerId: string, galleryId: string) {
  return path === galleryCoverPath(ownerId, galleryId)
    || Array.from({ length: 14 }, (_, index) => galleryArtworkPath(ownerId, galleryId, index)).includes(path);
}
