export const CANONICAL_APP_ORIGIN = "https://lieuva.com";
export const SPACE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export type SpaceRouteMatch =
  | { kind: "space"; id: string; legacy: boolean }
  | { kind: "malformed" }
  | null;

export function isValidSpaceIdentifier(value: string): boolean {
  return SPACE_IDENTIFIER_PATTERN.test(value);
}

export function spacePath(spaceId: string): string {
  if (!isValidSpaceIdentifier(spaceId)) throw new Error("Invalid Space ID.");
  return `/spaces/${spaceId}`;
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export function appOrigin(currentHref?: string): string {
  if (!currentHref) return CANONICAL_APP_ORIGIN;
  const current = new URL(currentHref);
  return isLocalHost(current.hostname) ? current.origin : CANONICAL_APP_ORIGIN;
}

export function spaceCanonicalUrl(spaceId: string, currentHref?: string): string {
  return `${appOrigin(currentHref)}${spacePath(spaceId)}`;
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
