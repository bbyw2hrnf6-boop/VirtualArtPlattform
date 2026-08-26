import { applicationRootUrl } from "./spaceRoutes";

const ABSOLUTE_SOURCE = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

/**
 * Resolve bundled public assets against the application root rather than the
 * current clean route. This keeps `/spaces/:id` from requesting assets below
 * `/spaces/assets/` while retaining the legacy GitHub Pages subpath fallback.
 */
export function publicAssetUrl(source: string, currentHref?: string): string {
  if (!source || ABSOLUTE_SOURCE.test(source)) return source;
  const href =
    currentHref ??
    (typeof location === "undefined" ? "https://lieuva.com/" : location.href);
  const relative = source.replace(/^\.?\//, "");
  return new URL(relative, applicationRootUrl(href)).href;
}
