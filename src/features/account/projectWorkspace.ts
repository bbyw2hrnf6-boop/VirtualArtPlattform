import type { GalleryDraft } from "../gallery/types";
import type { GalleryRecord } from "../../services/galleryRepository";
import type { StoredGalleryDraft } from "../../services/draftStorage";

function artworkSignature(artwork: GalleryDraft["artworks"][number]) {
  return {
    id: artwork.id,
    assetId: artwork.assetId,
    storagePath: artwork.storagePath,
    title: artwork.title,
    year: artwork.year,
    medium: artwork.medium,
    dimensions: artwork.dimensions,
    description: artwork.description,
    aspect: artwork.aspect,
    wall: artwork.wall,
    x: artwork.x,
    y: artwork.y,
    scale: artwork.scale,
    frame: artwork.frame,
    mat: artwork.mat,
    locked: artwork.locked,
    hidden: artwork.hidden,
  };
}

/** A stable, privacy-safe comparison of authored Space content. */
export function galleryDraftSignature(draft: GalleryDraft): string {
  return JSON.stringify({
    templateId: draft.templateId,
    title: draft.title,
    artist: draft.artist,
    wall: draft.wall,
    floor: draft.floor,
    ceiling: draft.ceiling,
    lighting: draft.lighting,
    decor: draft.decor,
    artworks: draft.artworks.map(artworkSignature),
  });
}

export type PublishedProjectState = "published" | "changes" | "conflict";

export function publishedProjectState(
  room: GalleryRecord,
  stored?: StoredGalleryDraft,
): { state: PublishedProjectState; label: string; detail: string } {
  if (!stored) {
    return { state: "published", label: "Live", detail: `Revision ${room.revision}` };
  }
  const localDiffers = galleryDraftSignature(stored.draft) !== galleryDraftSignature(room);
  const localRevision = stored.publication?.revision ?? room.revision;
  if (localRevision < room.revision && localDiffers) {
    return {
      state: "conflict",
      label: "Review conflict",
      detail: `Local work is based on revision ${localRevision}; live is revision ${room.revision}`,
    };
  }
  if (localDiffers) {
    return { state: "changes", label: "Changes not live", detail: `Based on revision ${room.revision}` };
  }
  return { state: "published", label: "Live", detail: `Revision ${room.revision}` };
}
