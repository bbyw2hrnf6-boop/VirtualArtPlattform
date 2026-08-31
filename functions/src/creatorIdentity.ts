export const CREATOR_HANDLE_MIN = 3;
export const CREATOR_HANDLE_MAX = 30;
export const CREATOR_HANDLE_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const RESERVED_HANDLES = new Set([
  "account", "admin", "api", "app", "auth", "create", "creator", "creator-hub", "creators",
  "data", "demo", "discover", "help", "home", "legal", "login", "logout",
  "lieuva", "moderator", "privacy", "root", "settings", "signin", "signup",
  "sitemap", "space", "spaces", "studio", "support", "system", "terms", "www",
  "mira-vale", "atlas-studio", "noor-patel", "common-field", "elian-ross",
]);

export type CreatorLink = { label: string; url: string };

export type PublicCreatorProfile = {
  handle: string;
  displayName: string;
  bio: string;
  links: CreatorLink[];
  profilePublic: boolean;
  imagePresent: boolean;
  followerCount: number;
  updatedAt?: string;
};

export type PublicCreatorSpace = {
  id: string;
  title: string;
  creator: string;
  coverUrl: string;
  updatedAt?: string;
};

export type PublicCreatorPost = {
  id: string;
  handle: string;
  displayName: string;
  body: string;
  createdAt: string;
  reactionCount: number;
  commentCount: number;
};

export type PublicCreatorDirectoryEntry = {
  handle: string;
  displayName: string;
  bio: string;
  imagePresent: boolean;
  followerCount: number;
};

export type CreatorNotificationProjection = {
  kind: "follow" | "reaction" | "comment";
  actorHandle: string;
  actorDisplayName: string;
  createdAt: string;
  read: boolean;
  postId?: string;
  bodyPreview?: string;
};

export type CreatorDelivery =
  | { kind: "public"; profile: PublicCreatorProfile; spaces: PublicCreatorSpace[]; posts: PublicCreatorPost[] }
  | { kind: "not-found"; handle?: string }
  | { kind: "temporary-error"; handle?: string };

export type CreatorDocumentRoute =
  | { kind: "directory" }
  | { kind: "hub" }
  | { kind: "profile"; handle: string }
  | { kind: "malformed" };

export function normalizeCreatorHandle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim().toLowerCase();
  if (
    normalized.length < CREATOR_HANDLE_MIN ||
    normalized.length > CREATOR_HANDLE_MAX ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(normalized) ||
    normalized.includes("--") ||
    RESERVED_HANDLES.has(normalized)
  ) return null;
  return normalized;
}

export function isReservedCreatorHandle(value: unknown): boolean {
  return typeof value === "string" && RESERVED_HANDLES.has(value.trim().toLowerCase());
}

export function isValidCreatorWebp(bytes: Buffer): boolean {
  return bytes.length >= 12 && bytes.length <= 512 * 1024 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

function boundedText(value: unknown, maximum: number, required = false): string | null {
  if (typeof value !== "string") return required ? null : "";
  const text = value.trim().replace(/\s+/g, " ");
  if ((required && !text) || text.length > maximum) return null;
  return text;
}

export function parseCreatorPostInput(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const body = value.trim().replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return body && body.length <= 600 ? body : null;
}

export function parseCreatorCommentInput(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const body = value.trim().replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return body && body.length <= 280 ? body : null;
}

const CREATOR_REPORT_REASONS = new Set(["spam", "harassment", "rights", "unsafe", "other"]);

export function parseCreatorReportReason(value: unknown): "spam" | "harassment" | "rights" | "unsafe" | "other" | null {
  return typeof value === "string" && CREATOR_REPORT_REASONS.has(value)
    ? value as "spam" | "harassment" | "rights" | "unsafe" | "other"
    : null;
}

export function parseCreatorLinks(value: unknown): CreatorLink[] | null {
  if (!Array.isArray(value) || value.length > 4) return null;
  const links: CreatorLink[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const label = boundedText(record.label, 24, true);
    const rawUrl = boundedText(record.url, 240, true);
    if (!label || !rawUrl) return null;
    let url: URL;
    try { url = new URL(rawUrl); } catch { return null; }
    if (url.protocol !== "https:" || url.username || url.password) return null;
    links.push({ label, url: url.href });
  }
  return links;
}

export function parseCreatorProfileInput(value: unknown): PublicCreatorProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const handle = normalizeCreatorHandle(record.handle);
  const displayName = boundedText(record.displayName, 60, true);
  const bio = boundedText(record.bio, 320) ?? null;
  const links = parseCreatorLinks(record.links);
  if (!handle || !displayName || bio === null || !links || typeof record.profilePublic !== "boolean")
    return null;
  const followerCount = typeof record.followerCount === "number" && Number.isSafeInteger(record.followerCount)
    ? Math.max(0, record.followerCount)
    : 0;
  return { handle, displayName, bio, links, profilePublic: record.profilePublic, imagePresent: record.imagePresent === true, followerCount };
}

/** Minimal allow-listed projection used by public Creator search. */
export function publicCreatorDirectoryEntry(value: unknown): PublicCreatorDirectoryEntry | null {
  const profile = parseCreatorProfileInput(value);
  if (!profile?.profilePublic) return null;
  return {
    handle: profile.handle,
    displayName: profile.displayName,
    bio: profile.bio,
    imagePresent: profile.imagePresent,
    followerCount: profile.followerCount,
  };
}

export function creatorFollowTransition(
  action: "follow" | "unfollow",
  exists: boolean,
  followerCount: number,
) {
  const count = Math.max(0, Number.isSafeInteger(followerCount) ? followerCount : 0);
  if (action === "follow" && !exists) return { following: true, followerCount: count + 1, changed: true };
  if (action === "unfollow" && exists) return { following: false, followerCount: Math.max(0, count - 1), changed: true };
  return { following: exists, followerCount: count, changed: false };
}

/** Allow-listed private projection returned to the notification owner. */
export function creatorNotificationProjection(
  value: unknown,
  createdAt: string,
): CreatorNotificationProjection | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Number.isFinite(Date.parse(createdAt))) return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== "follow" && record.kind !== "reaction" && record.kind !== "comment") return null;
  const actorHandle = boundedText(record.actorHandle, 30, true);
  const actorDisplayName = boundedText(record.actorDisplayName, 60, true);
  if (!actorHandle || !actorDisplayName) return null;
  const postId = typeof record.postId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(record.postId)
    ? record.postId
    : undefined;
  const bodyPreview = record.kind === "comment" && typeof record.bodyPreview === "string"
    ? record.bodyPreview.trim().slice(0, 100)
    : undefined;
  return {
    kind: record.kind,
    actorHandle,
    actorDisplayName,
    createdAt,
    read: record.read === true,
    ...(postId ? { postId } : {}),
    ...(bodyPreview ? { bodyPreview } : {}),
  };
}

/** Legacy Spaces predate placement controls and remain visible by default. */
export function isCreatorProfileSpaceListed(data: Record<string, unknown>): boolean {
  return data.creatorProfileListed !== false;
}

export function creatorCanonicalUrl(handle: string): string {
  const normalized = normalizeCreatorHandle(handle);
  if (!normalized) throw new Error("Invalid Creator handle.");
  return `https://lieuva.com/creators/${normalized}`;
}

export function classifyCreatorDocumentRoute(path: string): CreatorDocumentRoute {
  const normalizedPath = path.replace(/\/+$/, "") || "/";
  if (normalizedPath === "/creators") return { kind: "directory" };
  if (normalizedPath === "/creator-hub" || normalizedPath === "/creator-hub/profile")
    return { kind: "hub" };
  const match = /^\/creators\/([^/]+)$/.exec(normalizedPath);
  if (!match) return { kind: "malformed" };
  try {
    return { kind: "profile", handle: decodeURIComponent(match[1]) };
  } catch {
    return { kind: "malformed" };
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function stripMetadata(html: string): string {
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>/gi, "")
    .replace(/<meta\s+[^>]*(?:name|property)=["'](?:description|robots|lieuva:creator-state|lieuva:creator-route|og:type|og:site_name|og:url|og:title|og:description|og:image|og:image:alt|og:image:width|og:image:height|og:locale|twitter:card|twitter:title|twitter:description|twitter:image|twitter:image:alt)["'][^>]*>/gi, "")
    .replace(/<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "");
}

export function renderCreatorDocument(shell: string, delivery: CreatorDelivery): string {
  const isPublic = delivery.kind === "public";
  const profile = isPublic ? delivery.profile : undefined;
  const canonical = profile ? creatorCanonicalUrl(profile.handle) : "https://lieuva.com/creators";
  const title = profile ? `${profile.displayName} — Creator | LIEUVA` : "Creator unavailable | LIEUVA";
  const description = profile
    ? profile.bio || `Explore public immersive Spaces by ${profile.displayName} on LIEUVA.`
    : "This LIEUVA Creator profile is not public.";
  const spaces = delivery.kind === "public" ? delivery.spaces : [];
  const image = profile?.imagePresent
    ? `https://lieuva.com/creator-images/${profile.handle}.webp`
    : profile && spaces[0] ? spaces[0].coverUrl
    : "https://lieuva.com/assets/demo/aura-hero-gallery.webp";
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta name="robots" content="${isPublic ? "index,follow,max-image-preview:large" : "noindex,nofollow,noarchive"}">`,
    `<meta name="lieuva:creator-state" content="${isPublic ? "public" : "unavailable"}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta property="og:type" content="profile">`,
    `<meta property="og:site_name" content="LIEUVA">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:image" content="${escapeHtml(image)}">`,
    `<meta property="og:image:alt" content="Public Creator profile for ${escapeHtml(profile?.displayName ?? "LIEUVA")}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(image)}">`,
    `<meta name="twitter:image:alt" content="Public Creator profile for ${escapeHtml(profile?.displayName ?? "LIEUVA")}">`,
    ...(profile ? [`<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      url: canonical,
      name: profile.displayName,
      description,
      mainEntity: {
        "@type": "Person",
        name: profile.displayName,
        alternateName: `@${profile.handle}`,
        url: canonical,
        ...(profile.imagePresent ? { image } : {}),
        ...(profile.links.length ? { sameAs: profile.links.map((link) => link.url) } : {}),
      },
    }).replaceAll("<", "\\u003c")}</script>`] : []),
  ].join("\n    ");
  return stripMetadata(shell).replace("</head>", `    ${tags}\n  </head>`);
}

/** Indexable server metadata for the public Creator directory. */
export function renderCreatorDirectoryDocument(shell: string): string {
  const canonical = "https://lieuva.com/creators";
  const title = "Creators | LIEUVA";
  const description = "Explore public Creators and their immersive Spaces in the LIEUVA Creator Hub.";
  const image = "https://lieuva.com/assets/demo/aura-hero-gallery.webp";
  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    `<meta name="robots" content="index,follow,max-image-preview:large">`,
    `<meta name="lieuva:creator-route" content="directory">`,
    `<link rel="canonical" href="${canonical}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="LIEUVA">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:alt" content="Public Creators and Spaces in the LIEUVA Creator Hub">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${image}">`,
    `<meta name="twitter:image:alt" content="Public Creators and Spaces in the LIEUVA Creator Hub">`,
    `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      url: canonical,
      name: "LIEUVA Creators",
      description,
    }).replaceAll("<", "\\u003c")}</script>`,
  ].join("\n    ");
  return stripMetadata(shell).replace("</head>", `    ${tags}\n  </head>`);
}

/** Noindex server metadata for the personalized Creator Hub application. */
export function renderCreatorHubDocument(shell: string): string {
  const canonical = "https://lieuva.com/creator-hub";
  const title = "Creator Hub | LIEUVA";
  const description = "Manage your Creator profile, follow practices, and share updates in the LIEUVA Creator Hub.";
  const image = "https://lieuva.com/assets/demo/aura-hero-gallery.webp";
  const tags = [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    `<meta name="robots" content="noindex,nofollow,noarchive">`,
    `<meta name="lieuva:creator-route" content="hub">`,
    `<link rel="canonical" href="${canonical}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="LIEUVA">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:image" content="${image}">`,
    `<meta property="og:image:alt" content="The personalized LIEUVA Creator Hub">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    `<meta name="twitter:image" content="${image}">`,
    `<meta name="twitter:image:alt" content="The personalized LIEUVA Creator Hub">`,
  ].join("\n    ");
  return stripMetadata(shell).replace("</head>", `    ${tags}\n  </head>`);
}
