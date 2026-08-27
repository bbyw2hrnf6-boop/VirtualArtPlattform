import { PRODUCT_BRAND, productTitle } from "../config/brand";
import type { GalleryVisibility } from "./galleryAccess";
import { spaceCanonicalUrl } from "./spaceRoutes";

const HOME_CANONICAL = "https://lieuva.com/";
const HOME_IMAGE = `${HOME_CANONICAL}assets/demo/aura-hero-gallery.webp`;
const SPACE_CARD_ENDPOINT = `${HOME_CANONICAL}space-cards/`;

export type PageMetadataPolicy = {
  title: string;
  description: string;
  canonical: string;
  robots:
    | "index,follow,max-image-preview:large"
    | "noindex,nofollow"
    | "noindex,follow,noarchive";
  image?: string;
};

const NON_INDEXED_DESCRIPTION =
  "Create, manage and share immersive 3D presentations with LIEUVA.";

export function pageMetadataPolicy(
  page: "home" | "create" | "demo" | "data" | "account" | "auth-action" | "space-not-found" | "other",
): PageMetadataPolicy {
  if (page === "home") return {
    title: productTitle(),
    description: PRODUCT_BRAND.description,
    canonical: HOME_CANONICAL,
    robots: "index,follow,max-image-preview:large",
    image: HOME_IMAGE,
  };
  if (page === "demo") return {
    title: productTitle("Threshold — Danny Hirsch Arts"),
    description: "Enter Threshold, the authored Danny Hirsch Arts reference Space presented in LIEUVA.",
    canonical: HOME_CANONICAL,
    robots: "noindex,nofollow",
    image: `${HOME_CANONICAL}assets/demo/danny-cover.webp`,
  };
  const labels: Record<Exclude<Parameters<typeof pageMetadataPolicy>[0], "home" | "demo">, string> = {
    create: "Create a Space",
    data: "Data and rights",
    account: "Your Projects and account",
    "auth-action": "Account action",
    "space-not-found": "Space unavailable",
    other: "Immersive Space",
  };
  return {
    title: productTitle(labels[page]),
    description: NON_INDEXED_DESCRIPTION,
    canonical: HOME_CANONICAL,
    robots: "noindex,nofollow",
    image: HOME_IMAGE,
  };
}

export function publishedSpaceMetadataPolicy(space: {
  id: string;
  visibility: GalleryVisibility;
  title: string;
  artist: string;
  coverSrc?: string;
  indexEligible?: boolean;
}): PageMetadataPolicy {
  const canonical = spaceCanonicalUrl(space.id);
  if (space.visibility !== "public") return {
    title: productTitle(space.visibility === "private" ? "Private Space" : "Shared Space"),
    description: "A protected immersive Space shared through LIEUVA.",
    canonical,
    robots: "noindex,nofollow",
    image: HOME_IMAGE,
  };
  return {
    title: productTitle(`${space.title} — ${space.artist}`),
    description: `Enter ${space.title}, an immersive Space by ${space.artist}, presented with LIEUVA.`,
    canonical,
    robots: space.indexEligible === false
      ? "noindex,follow,noarchive"
      : "index,follow,max-image-preview:large",
    image: space.coverSrc ?? `${SPACE_CARD_ENDPOINT}${encodeURIComponent(space.id)}`,
  };
}

function upsertMeta(documentRef: Document, selector: string, attributes: Record<string, string>) {
  let element = documentRef.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = documentRef.createElement("meta");
    documentRef.head.append(element);
  }
  Object.entries(attributes).forEach(([name, value]) => element?.setAttribute(name, value));
}

export function applyPageMetadata(policy: PageMetadataPolicy, documentRef = document) {
  documentRef.title = policy.title;
  upsertMeta(documentRef, 'meta[name="description"]', { name: "description", content: policy.description });
  upsertMeta(documentRef, 'meta[name="robots"]', { name: "robots", content: policy.robots });
  upsertMeta(documentRef, 'meta[property="og:title"]', { property: "og:title", content: policy.title });
  upsertMeta(documentRef, 'meta[property="og:description"]', { property: "og:description", content: policy.description });
  upsertMeta(documentRef, 'meta[property="og:url"]', { property: "og:url", content: policy.canonical });
  upsertMeta(documentRef, 'meta[name="twitter:title"]', { name: "twitter:title", content: policy.title });
  upsertMeta(documentRef, 'meta[name="twitter:description"]', { name: "twitter:description", content: policy.description });
  if (policy.image) {
    upsertMeta(documentRef, 'meta[property="og:image"]', { property: "og:image", content: policy.image });
    upsertMeta(documentRef, 'meta[name="twitter:image"]', { name: "twitter:image", content: policy.image });
  }
  let canonical = documentRef.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = documentRef.createElement("link");
    canonical.rel = "canonical";
    documentRef.head.append(canonical);
  }
  canonical.href = policy.canonical;
}
