import { describe, expect, it, vi } from "vitest";
import {
  applyPageMetadata,
  pageMetadataPolicy,
  publicCreatorMetadataPolicy,
  publishedSpaceMetadataPolicy,
  unavailableCreatorMetadataPolicy,
} from "./pageMetadata";

describe("page metadata policy", () => {
  it("keeps admin routes out of indexing and archives", () => {
    expect(pageMetadataPolicy("admin")).toMatchObject({
      title: "Admin Console | LIEUVA",
      canonical: "https://lieuva.com/admin/overview",
      robots: "noindex,nofollow,noarchive",
    });
  });
  it("indexes only the public marketing surface by default", () => {
    expect(pageMetadataPolicy("home")).toMatchObject({
      canonical: "https://lieuva.com/",
      robots: "index,follow,max-image-preview:large",
      description: "Create, publish and explore immersive 3D spaces for art, design and ideas — directly in your browser.",
      image: "https://lieuva.com/assets/social/lieuva-social-preview-v2.jpg",
    });
    for (const page of ["create", "demo", "data", "account", "auth-action", "space-not-found", "other"] as const)
      expect(pageMetadataPolicy(page).robots).toBe("noindex,nofollow");
  });

  it("keeps the public Creator directory indexable after the client application mounts", () => {
    expect(pageMetadataPolicy("creators")).toMatchObject({
      title: "Creators | LIEUVA",
      canonical: "https://lieuva.com/creators",
      robots: "index,follow,max-image-preview:large",
      image: "https://lieuva.com/assets/social/lieuva-social-preview-v2.jpg",
    });
  });

  it("keeps the personalized Creator Hub out of search with a self-canonical URL", () => {
    expect(pageMetadataPolicy("creator-hub")).toMatchObject({
      title: "Creator Hub | LIEUVA",
      canonical: "https://lieuva.com/creator-hub",
      robots: "noindex,nofollow,noarchive",
    });
  });

  it("updates public Creator metadata when profiles change inside the Hub shell", () => {
    expect(publicCreatorMetadataPolicy({
      handle: "studio-north",
      displayName: "Studio North",
      bio: "Spatial work in progress.",
      imagePresent: true,
    }, undefined, true)).toMatchObject({
      title: "Studio North — Creator | LIEUVA",
      description: "Spatial work in progress.",
      canonical: "https://lieuva.com/creators/studio-north",
      robots: "index,follow,max-image-preview:large",
      image: "https://lieuva.com/creator-images/studio-north.webp",
    });
  });

  it("uses a custom Creator cover as the large sharing image", () => {
    expect(publicCreatorMetadataPolicy({
      handle: "studio-north",
      displayName: "Studio North",
      coverPresent: true,
      imagePresent: true,
    }, undefined, true).image).toBe("https://lieuva.com/creator-covers/studio-north.webp");
  });

  it("preserves a server-derived Creator noindex decision after hydration", () => {
    expect(publicCreatorMetadataPolicy({
      handle: "skippertestadmin",
      displayName: "SkipperAdmin",
      bio: "test Bio admin 001",
    }, undefined, false)).toMatchObject({
      robots: "noindex,follow,noarchive",
    });
  });

  it("preserves matching server JSON-LD and removes stale route entities", () => {
    const staleStructuredData = {
      getAttribute: vi.fn(() => "https://lieuva.com/creators/another-studio"),
      remove: vi.fn(),
    };
    const matchingStructuredData = {
      getAttribute: vi.fn(() => "https://lieuva.com/creators/studio-north"),
      remove: vi.fn(),
    };
    const existingElement = { href: "", rel: "", setAttribute: vi.fn(), remove: vi.fn() };
    const head = {
      append: vi.fn(),
      querySelector: vi.fn(() => existingElement),
      querySelectorAll: vi.fn(() => [staleStructuredData, matchingStructuredData]),
    };
    const documentRef = {
      title: "Creators | LIEUVA",
      head,
      createElement: vi.fn(() => existingElement),
    } as unknown as Document;
    const publicPolicy = publicCreatorMetadataPolicy({
      handle: "studio-north",
      displayName: "Studio North",
      bio: "Spatial work.",
      imagePresent: true,
    }, undefined, true);

    applyPageMetadata(publicPolicy, documentRef);

    expect(staleStructuredData.remove).toHaveBeenCalledOnce();
    expect(matchingStructuredData.remove).not.toHaveBeenCalled();

    staleStructuredData.remove.mockClear();
    applyPageMetadata(unavailableCreatorMetadataPolicy(), documentRef);

    expect(documentRef.title).toBe("Creator unavailable | LIEUVA");
    expect(staleStructuredData.remove).toHaveBeenCalledOnce();
    expect(matchingStructuredData.remove).toHaveBeenCalledOnce();
    expect(existingElement.setAttribute).toHaveBeenCalledWith(
      "content",
      "noindex,nofollow,noarchive",
    );
    expect(existingElement.href).toBe("https://lieuva.com/creators");
  });

  it("removes route JSON-LD on noindex pages even when the canonical is shared", () => {
    const structuredData = {
      getAttribute: vi.fn(() => "https://lieuva.com/"),
      remove: vi.fn(),
    };
    const existingElement = { href: "", rel: "", setAttribute: vi.fn(), remove: vi.fn() };
    const documentRef = {
      title: "LIEUVA",
      head: {
        append: vi.fn(),
        querySelector: vi.fn(() => existingElement),
        querySelectorAll: vi.fn(() => [structuredData]),
      },
      createElement: vi.fn(() => existingElement),
    } as unknown as Document;

    applyPageMetadata(pageMetadataPolicy("account"), documentRef);

    expect(structuredData.remove).toHaveBeenCalledOnce();
  });

  it("keeps public Space metadata specific and protected Space metadata generic", () => {
    const publicPolicy = publishedSpaceMetadataPolicy({
      id: "material-futures-123",
      revision: 7,
      visibility: "public",
      title: "Material Futures",
      artist: "Field Office",
      indexEligible: true,
    });
    expect(publicPolicy).toMatchObject({
      canonical: "https://lieuva.com/spaces/material-futures-123",
      robots: "index,follow,max-image-preview:large",
      description: "Material Futures by Field Office. Enter this immersive 3D Space on LIEUVA.",
      image: "https://lieuva.com/space-cards/material-futures-123?v=7",
      imageAlt: "Material Futures, an immersive Space by Field Office",
    });
    expect(publicPolicy.title).toContain("Material Futures");

    expect(publishedSpaceMetadataPolicy({
      id: "material-futures-123",
      revision: 7,
      visibility: "public",
      title: "Material Futures",
      artist: "Field Office",
      indexEligible: false,
    }).robots).toBe("noindex,follow,noarchive");
    expect(publishedSpaceMetadataPolicy({
      id: "legacy-without-gate",
      revision: 1,
      visibility: "public",
      title: "Legacy Space",
      artist: "Field Office",
    } as Parameters<typeof publishedSpaceMetadataPolicy>[0]).robots)
      .toBe("noindex,follow,noarchive");

    for (const visibility of ["unlisted", "private"] as const) {
      const protectedPolicy = publishedSpaceMetadataPolicy({
        id: "secret-space-123",
        revision: 3,
        visibility,
        title: "Confidential launch",
        artist: "Private studio",
        indexEligible: false,
      });
      expect(protectedPolicy.robots).toBe("noindex,nofollow,noarchive");
      expect(protectedPolicy.title).toBe(`LIEUVA — ${visibility === "private" ? "Private Space" : "Shared Space"}`);
      expect(JSON.stringify(protectedPolicy)).not.toContain("Confidential launch");
      expect(JSON.stringify(protectedPolicy)).not.toContain("Private studio");
    }
  });

  it("reconciles the complete social metadata contract across hydrated routes", () => {
    type FakeElement = {
      tag: string;
      removed: boolean;
      href: string;
      rel: string;
      attributes: Map<string, string>;
      getAttribute: (name: string) => string | null;
      setAttribute: (name: string, value: string) => void;
      remove: () => void;
    };
    const elements: FakeElement[] = [];
    const createElement = (tag: string): FakeElement => {
      const element: FakeElement = {
        tag,
        removed: false,
        href: "",
        rel: "",
        attributes: new Map(),
        getAttribute(name) {
          return this.attributes.get(name) ?? null;
        },
        setAttribute(name, value) {
          this.attributes.set(name, value);
        },
        remove() {
          this.removed = true;
        },
      };
      return element;
    };
    const find = (selector: string) => {
      const match = /^(meta|link)\[(name|property|rel)="([^"]+)"\]$/.exec(selector);
      if (!match) return null;
      return elements.find((element) => !element.removed
        && element.tag === match[1]
        && (match[2] === "rel" ? element.rel : element.getAttribute(match[2])) === match[3]) ?? null;
    };
    const documentRef = {
      title: "",
      head: {
        append: (element: FakeElement) => elements.push(element),
        querySelector: find,
        querySelectorAll: () => [],
      },
      createElement,
    } as unknown as Document;
    const content = (selector: string) => find(selector)?.getAttribute("content");

    applyPageMetadata(pageMetadataPolicy("home"), documentRef);
    expect(content('meta[property="og:image:width"]')).toBe("1200");

    applyPageMetadata(publishedSpaceMetadataPolicy({
      id: "material-futures-123",
      revision: 7,
      visibility: "public",
      title: "Material Futures",
      artist: "Field Office",
      indexEligible: true,
    }), documentRef);

    expect(documentRef.title).toBe("Material Futures — Field Office | LIEUVA");
    expect(content('meta[property="og:type"]')).toBe("website");
    expect(content('meta[property="og:image"]')).toBe("https://lieuva.com/space-cards/material-futures-123?v=7");
    expect(content('meta[property="og:image:secure_url"]')).toBe("https://lieuva.com/space-cards/material-futures-123?v=7");
    expect(content('meta[property="og:image:type"]')).toBe("image/webp");
    expect(content('meta[property="og:image:alt"]')).toBe("Material Futures, an immersive Space by Field Office");
    expect(content('meta[property="og:image:width"]')).toBeUndefined();
    expect(content('meta[property="og:image:height"]')).toBeUndefined();
    expect(content('meta[name="twitter:card"]')).toBe("summary_large_image");
    expect(content('meta[name="twitter:image:alt"]')).toBe("Material Futures, an immersive Space by Field Office");

    applyPageMetadata(publicCreatorMetadataPolicy({
      handle: "studio-north",
      displayName: "Studio North",
      imagePresent: true,
    }, undefined, true), documentRef);
    expect(content('meta[property="og:type"]')).toBe("profile");
    expect(content('meta[property="og:image:alt"]')).toBe("Public Creator profile for Studio North");
  });
});
