export const PUBLIC_SITE_ORIGIN = "https://lieuva.com";
export const SPACE_CARD_FALLBACK = `${PUBLIC_SITE_ORIGIN}/assets/demo/aura-hero-gallery.webp`;

type SpaceVisibility = "public" | "unlisted" | "private";

export type PublicSpaceDelivery = {
  kind: "public";
  id: string;
  title: string;
  creator: string;
  indexEligible: boolean;
  revision: number;
  updatedAt?: string;
  coverPath?: string;
};

const PLACEHOLDER_TITLE = /^(?:untitled|test|demo)(?:\b|[-_\s])/i;
const PLACEHOLDER_CREATOR = /^(?:your(?:[-_\s]*name|\d)|test(?:\b|[-_\s])|demo(?:\b|[-_\s]))/i;

function publicSpaceIndexEligibility(
  data: Record<string, unknown>,
  title: string,
  creator: string,
): boolean {
  // Public access and reviewed distribution are deliberately separate. Only a
  // trusted operator can set this gate to true; missing legacy values therefore
  // fail closed without breaking direct public links.
  if (data.discoverEligible !== true) return false;
  if (PLACEHOLDER_TITLE.test(title) || PLACEHOLDER_CREATOR.test(creator)) return false;
  if (!Array.isArray(data.artworks)) return false;
  return data.artworks.some((value) => {
    const artwork = recordValue(value);
    return artwork?.hidden !== true
      && [artwork?.src, artwork?.storagePath, artwork?.assetId].some(
        (source) => typeof source === "string" && source.length > 0,
      );
  });
}

export type SpaceDelivery =
  | PublicSpaceDelivery
  | { kind: "unlisted"; id: string }
  | { kind: "private"; id: string }
  | { kind: "not-found"; id?: string }
  | { kind: "temporary-error"; id?: string };

export type SpaceDocumentMetadata = {
  status: number;
  title: string;
  description: string;
  canonical: string;
  robots: string;
  ogType: "website";
  ogTitle: string;
  ogDescription: string;
  ogUrl: string;
  ogImage: string;
  ogImageAlt: string;
  twitterCard: "summary_large_image";
  structuredData?: Record<string, unknown>;
};

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseSpaceIdentifier(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value)
    ? value
    : null;
}

function timestampMillis(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const milliseconds = new Date(value).getTime();
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  const candidate = recordValue(value) as { toMillis?: () => number } | null;
  if (typeof candidate?.toMillis === "function") {
    const milliseconds = candidate.toMillis();
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  return null;
}

function boundedText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  return text && text.length <= maximum ? text : null;
}

function visibilityFor(data: Record<string, unknown>): SpaceVisibility | null {
  if (data.visibility === "public" || data.visibility === "unlisted" || data.visibility === "private")
    return data.visibility;
  return data.schemaVersion === 1 || data.schemaVersion === 2 ? "public" : null;
}

function validCoverPath(path: unknown, ownerId: unknown, galleryId: string): string | undefined {
  if (typeof path !== "string" || typeof ownerId !== "string") return undefined;
  const prefix = `published/${ownerId}/${galleryId}/`;
  if (!path.startsWith(prefix) || !/(?:^|\/)cover[.]webp$/.test(path)) return undefined;
  return path;
}

export function classifySpaceForDelivery(
  idValue: unknown,
  value: unknown,
  now = Date.now(),
): SpaceDelivery {
  const id = parseSpaceIdentifier(idValue);
  if (!id) return { kind: "not-found" };
  const data = recordValue(value);
  if (!data) return { kind: "not-found", id };
  const visibility = visibilityFor(data);
  const expiresAt = timestampMillis(data.expiresAt);
  const lifecycle = data.lifecycleStatus ?? "active";
  if (!visibility || expiresAt === null || expiresAt <= now || lifecycle !== "active")
    return { kind: "not-found", id };
  if (visibility === "unlisted") return { kind: "unlisted", id };
  if (visibility === "private") return { kind: "private", id };

  const title = boundedText(data.title, 100);
  const creator = boundedText(data.artist, 100);
  if (!title || !creator) return { kind: "not-found", id };
  const revision =
    typeof data.revision === "number" && Number.isSafeInteger(data.revision) && data.revision > 0
      ? data.revision
      : 1;
  const updatedMilliseconds = timestampMillis(data.updatedAt ?? data.publishedAt);
  const coverPath = validCoverPath(data.coverPath, data.ownerId, id);
  return {
    kind: "public",
    id,
    title,
    creator,
    indexEligible: publicSpaceIndexEligibility(data, title, creator),
    revision,
    ...(updatedMilliseconds !== null ? { updatedAt: new Date(updatedMilliseconds).toISOString() } : {}),
    ...(coverPath ? { coverPath } : {}),
  };
}

export function spaceCanonicalUrl(id: string): string {
  const parsed = parseSpaceIdentifier(id);
  if (!parsed) throw new Error("Invalid Space ID.");
  return `${PUBLIC_SITE_ORIGIN}/spaces/${parsed}`;
}

function publicDescription(space: PublicSpaceDelivery): string {
  return `${space.title} by ${space.creator}. Enter this immersive 3D Space on LIEUVA.`;
}

export function metadataForSpace(delivery: SpaceDelivery): SpaceDocumentMetadata {
  if (delivery.kind === "public") {
    const canonical = spaceCanonicalUrl(delivery.id);
    const description = publicDescription(delivery);
    const image = `${PUBLIC_SITE_ORIGIN}/space-cards/${delivery.id}?v=${delivery.revision}`;
    const title = `${delivery.title} — ${delivery.creator} | LIEUVA`;
    return {
      status: 200,
      title,
      description,
      canonical,
      robots: delivery.indexEligible
        ? "index,follow,max-image-preview:large"
        : "noindex,follow,noarchive",
      ogType: "website",
      ogTitle: title,
      ogDescription: description,
      ogUrl: canonical,
      ogImage: image,
      ogImageAlt: `${delivery.title}, an immersive Space by ${delivery.creator}`,
      twitterCard: "summary_large_image",
      ...(delivery.indexEligible ? { structuredData: {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: delivery.title,
        description,
        url: canonical,
        isPartOf: { "@type": "WebSite", name: "LIEUVA", url: `${PUBLIC_SITE_ORIGIN}/` },
        ...(delivery.updatedAt ? { dateModified: delivery.updatedAt } : {}),
      } } : {}),
    };
  }

  const canonical =
    delivery.id && parseSpaceIdentifier(delivery.id)
      ? spaceCanonicalUrl(delivery.id)
      : `${PUBLIC_SITE_ORIGIN}/spaces`;
  const protectedSpace = delivery.kind === "private" || delivery.kind === "unlisted";
  const title =
    delivery.kind === "private"
      ? "LIEUVA — Private Space"
      : delivery.kind === "unlisted"
        ? "LIEUVA — Shared Space"
        : delivery.kind === "temporary-error"
          ? "LIEUVA — Space temporarily unavailable"
          : "LIEUVA — Space unavailable";
  const description = protectedSpace
    ? "A protected immersive Space shared through LIEUVA."
    : "This LIEUVA Space is not currently available.";
  return {
    status: delivery.kind === "temporary-error" ? 503 : protectedSpace ? 200 : 404,
    title,
    description,
    canonical,
    robots: "noindex,nofollow,noarchive",
    ogType: "website",
    ogTitle: title,
    ogDescription: description,
    ogUrl: canonical,
    ogImage: SPACE_CARD_FALLBACK,
    ogImageAlt: "LIEUVA immersive 3D presentation platform",
    twitterCard: "summary_large_image",
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function stripRouteMetadata(html: string): string {
  return html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>/gi, "")
    .replace(/<meta\s+[^>]*name=["']lieuva:space-state["'][^>]*>/gi, "")
    .replace(
      /<meta\s+[^>]*(?:name|property)=["'](?:description|robots|og:type|og:site_name|og:url|og:title|og:description|og:image|og:image:width|og:image:height|og:image:alt|og:locale|twitter:card|twitter:title|twitter:description|twitter:image|twitter:image:alt)["'][^>]*>/gi,
      "",
    )
    .replace(/<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, "");
}

export function renderSpaceDocument(shell: string, delivery: SpaceDelivery): string {
  const metadata = metadataForSpace(delivery);
  const publicState = delivery.kind === "public"
    ? "public"
    : delivery.kind === "private" || delivery.kind === "unlisted"
      ? "protected"
      : delivery.kind;
  const tags = [
    `<title>${escapeHtml(metadata.title)}</title>`,
    `<meta name="description" content="${escapeHtml(metadata.description)}">`,
    `<meta name="robots" content="${escapeHtml(metadata.robots)}">`,
    `<meta name="lieuva:space-state" content="${publicState}">`,
    `<link rel="canonical" href="${escapeHtml(metadata.canonical)}">`,
    `<meta property="og:type" content="${metadata.ogType}">`,
    `<meta property="og:site_name" content="LIEUVA">`,
    `<meta property="og:url" content="${escapeHtml(metadata.ogUrl)}">`,
    `<meta property="og:title" content="${escapeHtml(metadata.ogTitle)}">`,
    `<meta property="og:description" content="${escapeHtml(metadata.ogDescription)}">`,
    `<meta property="og:image" content="${escapeHtml(metadata.ogImage)}">`,
    `<meta property="og:image:alt" content="${escapeHtml(metadata.ogImageAlt)}">`,
    `<meta name="twitter:card" content="${metadata.twitterCard}">`,
    `<meta name="twitter:title" content="${escapeHtml(metadata.ogTitle)}">`,
    `<meta name="twitter:description" content="${escapeHtml(metadata.ogDescription)}">`,
    `<meta name="twitter:image" content="${escapeHtml(metadata.ogImage)}">`,
    `<meta name="twitter:image:alt" content="${escapeHtml(metadata.ogImageAlt)}">`,
    ...(metadata.structuredData
      ? [`<script type="application/ld+json">${JSON.stringify(metadata.structuredData).replaceAll("<", "\\u003c")}</script>`]
      : []),
  ].join("\n    ");
  return stripRouteMetadata(shell).replace("</head>", `    ${tags}\n  </head>`);
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function renderPublicSitemap(
  spaces: PublicSpaceDelivery[],
  creators: Array<{ handle: string; updatedAt?: string }> = [],
): string {
  const unique = [...new Map(
    spaces.filter((space) => space.indexEligible).map((space) => [space.id, space]),
  ).values()]
    .sort((left, right) => left.id.localeCompare(right.id));
  const urls = [
    `  <url><loc>${PUBLIC_SITE_ORIGIN}/</loc><changefreq>weekly</changefreq></url>`,
    `  <url><loc>${PUBLIC_SITE_ORIGIN}/creators</loc><changefreq>daily</changefreq></url>`,
    ...unique.map((space) => {
      const modified = space.updatedAt ? `<lastmod>${escapeXml(space.updatedAt)}</lastmod>` : "";
      return `  <url><loc>${escapeXml(spaceCanonicalUrl(space.id))}</loc>${modified}</url>`;
    }),
    ...[...new Map(creators.map((creator) => [creator.handle, creator])).values()]
      .sort((left, right) => left.handle.localeCompare(right.handle))
      .map((creator) => {
        const modified = creator.updatedAt ? `<lastmod>${escapeXml(creator.updatedAt)}</lastmod>` : "";
        return `  <url><loc>${PUBLIC_SITE_ORIGIN}/creators/${escapeXml(creator.handle)}</loc>${modified}</url>`;
      }),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

export function cacheControlForSpace(delivery: SpaceDelivery): string {
  return delivery.kind === "public"
    ? "public, max-age=0, s-maxage=60, must-revalidate"
    : "private, no-store, max-age=0";
}
