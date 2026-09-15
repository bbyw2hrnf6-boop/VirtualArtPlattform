import { PRODUCT_BRAND, productTitle } from "../config/brand";
import type { GalleryVisibility } from "./galleryAccess";
import { creatorCanonicalUrl, spaceCanonicalUrl } from "./spaceRoutes";

const HOME_CANONICAL = "https://lieuva.com/";
const CREATOR_DIRECTORY_CANONICAL = `${HOME_CANONICAL}creators`;
const CREATOR_HUB_CANONICAL = `${HOME_CANONICAL}creator-hub`;
const HOME_IMAGE = `${HOME_CANONICAL}assets/social/lieuva-social-preview-v2.jpg`;
const SPACE_CARD_ENDPOINT = `${HOME_CANONICAL}space-cards/`;

export type PageMetadataPolicy = {
  title: string;
  description: string;
  canonical: string;
  robots:
    | "index,follow,max-image-preview:large"
    | "noindex,nofollow"
    | "noindex,nofollow,noarchive"
    | "noindex,follow,noarchive";
  image?: string;
  imageAlt?: string;
  ogType?: "profile" | "website";
};

const NON_INDEXED_DESCRIPTION =
  "Create, manage and share immersive 3D presentations with LIEUVA.";

export function pageMetadataPolicy(
  page: "home" | "sculpture-pavilion" | "obsidian" | "creators" | "creator-hub" | "create" | "demo" | "data" | "account" | "admin" | "auth-action" | "space-not-found" | "other",
): PageMetadataPolicy {
  if (page === "home") return {
    title: productTitle(),
    description: PRODUCT_BRAND.description,
    canonical: HOME_CANONICAL,
    robots: "index,follow,max-image-preview:large",
    image: HOME_IMAGE,
    imageAlt: "A contemporary immersive gallery space created for LIEUVA",
  };
  if (page === "creators") return {
    title: productTitle("Creators"),
    description: "Explore public Creators and their immersive Spaces in the LIEUVA Creator Hub.",
    canonical: CREATOR_DIRECTORY_CANONICAL,
    robots: "index,follow,max-image-preview:large",
    image: HOME_IMAGE,
    imageAlt: "Public Creators and Spaces in the LIEUVA Creator Hub",
  };
  if (page === "creator-hub") return {
    title: productTitle("Creator Hub"),
    description: "Manage your Creator profile, follow practices, and share updates in the LIEUVA Creator Hub.",
    canonical: CREATOR_HUB_CANONICAL,
    robots: "noindex,nofollow,noarchive",
    image: HOME_IMAGE,
    imageAlt: "The personalized LIEUVA Creator Hub",
  };
  if (page === "sculpture-pavilion") return {
    title: productTitle("Sculpture Pavilion — Future Nature"),
    description: "Five sculptures. Three sunlit rooms. Explore stone, bronze, wood and glass in a bespoke LIEUVA pavilion.",
    canonical: HOME_CANONICAL, robots: "noindex,nofollow",
    image: `${HOME_CANONICAL}assets/showcases/sculpture-pavilion/cover.webp`,
    imageAlt: "Sculpture Pavilion, an ivory atrium beneath an elliptical skylight",
  };
  if (page === "obsidian") return {
    title: productTitle("Obsidian — Three connected galleries"),
    description: "Explore eleven visions of nature in a bespoke three-room LIEUVA exhibition.",
    canonical: HOME_CANONICAL,
    robots: "noindex,nofollow",
    image: `${HOME_CANONICAL}assets/showcases/obsidian/cover.webp`,
    imageAlt: "Obsidian, a bespoke LIEUVA exhibition in stone, walnut and warm light",
  };
  if (page === "demo") return {
    title: productTitle("Threshold — Danny Hirsch Arts"),
    description: "Enter Threshold, the authored Danny Hirsch Arts reference Space presented in LIEUVA.",
    canonical: HOME_CANONICAL,
    robots: "noindex,nofollow",
    image: `${HOME_CANONICAL}assets/demo/danny-cover.webp`,
    imageAlt: "Threshold, the Danny Hirsch Arts reference Space",
  };
  if (page === "admin") return {
    title: productTitle("Admin Console"),
    description: "Restricted LIEUVA administration. Sign in with an authorized administrator account.",
    canonical: `${HOME_CANONICAL}admin/overview`,
    robots: "noindex,nofollow,noarchive",
  };
  const labels: Record<Exclude<Parameters<typeof pageMetadataPolicy>[0], "home" | "creators" | "creator-hub" | "demo" | "obsidian" | "sculpture-pavilion" | "admin">, string> = {
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
  revision: number;
  visibility: GalleryVisibility;
  title: string;
  artist: string;
  indexEligible: boolean;
}): PageMetadataPolicy {
  const canonical = spaceCanonicalUrl(space.id);
  if (space.visibility !== "public") return {
    title: `LIEUVA — ${space.visibility === "private" ? "Private Space" : "Shared Space"}`,
    description: "A protected immersive Space shared through LIEUVA.",
    canonical,
    robots: "noindex,nofollow,noarchive",
    image: HOME_IMAGE,
    imageAlt: "LIEUVA immersive 3D presentation platform",
  };
  return {
    title: productTitle(`${space.title} — ${space.artist}`),
    description: `${space.title} by ${space.artist}. Enter this immersive 3D Space on LIEUVA.`,
    canonical,
    robots: space.indexEligible === true
      ? "index,follow,max-image-preview:large"
      : "noindex,follow,noarchive",
    image: `${SPACE_CARD_ENDPOINT}${encodeURIComponent(space.id)}?v=${space.revision}`,
    imageAlt: `${space.title}, an immersive Space by ${space.artist}`,
  };
}

export function publicCreatorMetadataPolicy(profile: {
  handle: string;
  displayName: string;
  bio?: string;
  imagePresent?: boolean;
  coverPresent?: boolean;
}, featuredImage: string | undefined, indexEligible: boolean): PageMetadataPolicy {
  const canonical = creatorCanonicalUrl(profile.handle);
  const description = profile.bio || `Explore public immersive Spaces by ${profile.displayName} on LIEUVA.`;
  const image = profile.coverPresent
    ? `${HOME_CANONICAL}creator-covers/${profile.handle}.webp`
    : profile.imagePresent
    ? `${HOME_CANONICAL}creator-images/${profile.handle}.webp`
    : featuredImage || HOME_IMAGE;
  return {
    title: `${profile.displayName} — Creator | LIEUVA`,
    description,
    canonical,
    robots: indexEligible
      ? "index,follow,max-image-preview:large"
      : "noindex,follow,noarchive",
    image,
    imageAlt: `Public Creator profile for ${profile.displayName}`,
    ogType: "profile",
  };
}

export function unavailableCreatorMetadataPolicy(): PageMetadataPolicy {
  return {
    title: productTitle("Creator unavailable"),
    description: "This LIEUVA Creator profile is not public.",
    canonical: CREATOR_DIRECTORY_CANONICAL,
    robots: "noindex,nofollow,noarchive",
    image: HOME_IMAGE,
    imageAlt: "Public Creator profile for LIEUVA",
    ogType: "profile",
  };
}

function upsertMeta(documentRef: Document, attribute: "name" | "property", key: string, content: string) {
  let element = documentRef.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = documentRef.createElement("meta");
    documentRef.head.append(element);
  }
  element.setAttribute(attribute, key);
  element.setAttribute("content", content);
}

function removeMeta(documentRef: Document, attribute: "name" | "property", key: string) {
  documentRef.head.querySelector(`meta[${attribute}="${key}"]`)?.remove();
}

export function applyPageMetadata(policy: PageMetadataPolicy, documentRef = document) {
  documentRef.head.querySelectorAll("script[data-lieuva-page-metadata]")
    .forEach((script) => {
      if (!policy.robots.startsWith("index,")
        || script.getAttribute("data-lieuva-page-metadata") !== policy.canonical)
        script.remove();
    });
  documentRef.title = policy.title;
  const image = policy.image ?? HOME_IMAGE;
  const imageAlt = policy.imageAlt ?? "LIEUVA immersive 3D presentation platform";
  upsertMeta(documentRef, "name", "description", policy.description);
  upsertMeta(documentRef, "name", "robots", policy.robots);
  upsertMeta(documentRef, "property", "og:type", policy.ogType ?? "website");
  upsertMeta(documentRef, "property", "og:site_name", "LIEUVA");
  upsertMeta(documentRef, "property", "og:title", policy.title);
  upsertMeta(documentRef, "property", "og:description", policy.description);
  upsertMeta(documentRef, "property", "og:url", policy.canonical);
  upsertMeta(documentRef, "property", "og:image", image);
  upsertMeta(documentRef, "property", "og:image:secure_url", image);
  upsertMeta(documentRef, "property", "og:image:type", image === HOME_IMAGE ? "image/jpeg" : "image/webp");
  if (image === HOME_IMAGE) {
    upsertMeta(documentRef, "property", "og:image:width", "1200");
    upsertMeta(documentRef, "property", "og:image:height", "630");
  } else {
    removeMeta(documentRef, "property", "og:image:width");
    removeMeta(documentRef, "property", "og:image:height");
  }
  upsertMeta(documentRef, "property", "og:image:alt", imageAlt);
  upsertMeta(documentRef, "name", "twitter:card", "summary_large_image");
  upsertMeta(documentRef, "name", "twitter:title", policy.title);
  upsertMeta(documentRef, "name", "twitter:description", policy.description);
  upsertMeta(documentRef, "name", "twitter:image", image);
  upsertMeta(documentRef, "name", "twitter:image:alt", imageAlt);
  let canonical = documentRef.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = documentRef.createElement("link");
    canonical.rel = "canonical";
    documentRef.head.append(canonical);
  }
  canonical.href = policy.canonical;
}
