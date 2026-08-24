import { spaceCanonicalUrl } from "./spaceRoutes";

/** Legacy function name retained as a compatibility boundary for existing UI code. */
export function galleryShareUrl(galleryId: string, currentHref: string) {
  return spaceCanonicalUrl(galleryId, currentHref);
}
