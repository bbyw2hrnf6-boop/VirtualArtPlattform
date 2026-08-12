export function galleryShareUrl(galleryId: string, currentHref: string) {
  const url = new URL(currentHref);
  url.search = "";
  url.hash = `/g/${encodeURIComponent(galleryId)}`;
  return url.toString();
}
