export const CANONICAL_APP_ORIGIN = "https://lieuva.com";
export const SPACE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
export const CREATOR_HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;
const FIREBASE_DEFAULT_HOSTS = new Set([
  "virtualartplattform.web.app",
  "virtualartplattform.firebaseapp.com",
]);

export type SpaceRouteMatch =
  | { kind: "space"; id: string; legacy: boolean }
  | { kind: "malformed" }
  | null;

export type CreatorRouteMatch =
  | { kind: "directory" }
  | { kind: "hub" }
  | { kind: "settings" }
  | { kind: "creator"; handle: string }
  | { kind: "malformed" }
  | null;

const LEGACY_CREATOR_HUB_HASHES = new Set([
  "creator-home",
  "creator-feed",
  "creator-spaces",
  "creator-profile",
  "creator-activity",
]);

export function isValidSpaceIdentifier(value: string): boolean {
  return SPACE_IDENTIFIER_PATTERN.test(value);
}

export function spacePath(spaceId: string): string {
  if (!isValidSpaceIdentifier(spaceId)) throw new Error("Invalid Space ID.");
  return `/spaces/${spaceId}`;
}

export function isValidCreatorHandle(value: string): boolean {
  return CREATOR_HANDLE_PATTERN.test(value);
}

export function creatorPath(handle: string): string {
  if (!isValidCreatorHandle(handle)) throw new Error("Invalid Creator handle.");
  return `/creators/${handle}`;
}

export function creatorCanonicalUrl(handle: string, currentHref?: string): string {
  return `${appOrigin(currentHref)}${creatorPath(handle)}`;
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function appOrigin(currentHref?: string): string {
  if (!currentHref) return CANONICAL_APP_ORIGIN;
  const current = new URL(currentHref);
  return isLocalHost(current.hostname) ? current.origin : CANONICAL_APP_ORIGIN;
}

export function canonicalHostRedirectUrl(currentHref: string): string | null {
  const current = new URL(currentHref);
  if (!FIREBASE_DEFAULT_HOSTS.has(current.hostname)) return null;
  const canonical = new URL(CANONICAL_APP_ORIGIN);
  canonical.pathname = current.pathname;
  canonical.search = current.search;
  canonical.hash = current.hash;
  return canonical.href;
}

export function spaceCanonicalUrl(spaceId: string, currentHref?: string): string {
  return `${appOrigin(currentHref)}${spacePath(spaceId)}`;
}

export function exploreSpacesUrl(spaceId?: string, currentHref?: string): string {
  if (spaceId && !isValidSpaceIdentifier(spaceId)) throw new Error("Invalid Space ID.");
  const url = new URL(`${appOrigin(currentHref)}/`);
  url.searchParams.set("explore", "spaces");
  if (spaceId) url.searchParams.set("space", spaceId);
  return url.href;
}

function safelyDecoded(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function matchSpaceRoute(pathname: string, hash: string): SpaceRouteMatch {
  const cleanMatch = /^\/spaces\/([^/]+)\/?$/.exec(pathname);
  if (cleanMatch) {
    const id = safelyDecoded(cleanMatch[1]);
    return id && isValidSpaceIdentifier(id)
      ? { kind: "space", id, legacy: false }
      : { kind: "malformed" };
  }
  if (pathname === "/spaces" || pathname.startsWith("/spaces/"))
    return { kind: "malformed" };

  const normalizedHash = hash.replace(/^#/, "");
  if (!normalizedHash.startsWith("/g/")) return null;
  const id = safelyDecoded(normalizedHash.slice(3));
  return id && isValidSpaceIdentifier(id)
    ? { kind: "space", id, legacy: true }
    : { kind: "malformed" };
}

export function matchCreatorRoute(pathname: string): CreatorRouteMatch {
  if (pathname === "/creator-hub" || pathname === "/creator-hub/") return { kind: "hub" };
  if (pathname === "/creator-hub/profile" || pathname === "/creator-hub/profile/")
    return { kind: "settings" };
  if (pathname.startsWith("/creator-hub/")) return { kind: "malformed" };
  if (pathname === "/creators" || pathname === "/creators/") return { kind: "directory" };
  const match = /^\/creators\/([^/]+)\/?$/.exec(pathname);
  if (match) {
    const handle = safelyDecoded(match[1]);
    return handle && isValidCreatorHandle(handle)
      ? { kind: "creator", handle }
      : { kind: "malformed" };
  }
  return pathname.startsWith("/creators/")
    ? { kind: "malformed" }
    : null;
}

/** Returns a same-origin clean Creator route that can be handled by the SPA
 * without tearing down the persistent Creator Hub shell. */
export function creatorExperienceNavigationPath(targetHref: string, currentHref: string): string | null {
  const current = new URL(currentHref);
  const target = new URL(targetHref, current);
  if (target.origin !== current.origin) return null;
  const route = matchCreatorRoute(target.pathname);
  if (!route || route.kind === "malformed") return null;
  return `${target.pathname}${target.search}${target.hash}`;
}

/** Maps only the historical personalized Hub anchors away from the public
 * Creator directory. `#creator-directory` deliberately stays on /creators. */
export function legacyCreatorHubRedirectPath(pathname: string, hash: string): string | null {
  if (pathname !== "/creators" && pathname !== "/creators/") return null;
  const hashValue = hash.replace(/^#/, "");
  const routeHash = hashValue.split("?", 1)[0]?.toLowerCase();
  if (!routeHash || !LEGACY_CREATOR_HUB_HASHES.has(routeHash)) return null;
  return `/creator-hub#${hashValue}`;
}

export function applicationRootUrl(currentHref: string): string {
  const current = new URL(currentHref);
  if (isLocalHost(current.hostname) || !current.hostname.endsWith(".github.io"))
    return `${current.origin}/`;
  const projectPath = current.pathname.split("/").filter(Boolean)[0];
  return `${current.origin}${projectPath ? `/${projectPath}/` : "/"}`;
}

export function hashApplicationUrl(path: string, currentHref: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${applicationRootUrl(currentHref)}#${normalized}`;
}
