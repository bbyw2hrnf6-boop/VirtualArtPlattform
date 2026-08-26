import type { PublicCreatorDirectoryEntry } from "./creatorProfile";
import type { GalleryRecord } from "./galleryRepository";

function searchable(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

export function searchPublicDirectory(
  spaces: GalleryRecord[],
  creators: PublicCreatorDirectoryEntry[],
  query: string,
) {
  const needle = searchable(query);
  if (!needle) return { spaces, creators: [] };
  return {
    spaces: spaces.filter((space) =>
      searchable(`${space.title} ${space.artist}`).includes(needle),
    ),
    creators: creators.filter((creator) =>
      searchable(`${creator.displayName} ${creator.handle} ${creator.bio}`).includes(needle),
    ),
  };
}
