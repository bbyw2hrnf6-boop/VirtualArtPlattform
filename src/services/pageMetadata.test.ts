import { describe, expect, it } from "vitest";
import { pageMetadataPolicy, publishedSpaceMetadataPolicy } from "./pageMetadata";

describe("page metadata policy", () => {
  it("indexes only the public marketing surface by default", () => {
    expect(pageMetadataPolicy("home")).toMatchObject({
      canonical: "https://lieuva.com/",
      robots: "index,follow,max-image-preview:large",
    });
    for (const page of ["create", "demo", "data", "account", "auth-action", "space-not-found", "other"] as const)
      expect(pageMetadataPolicy(page).robots).toBe("noindex,nofollow");
  });

  it("keeps public Space metadata specific and protected Space metadata generic", () => {
    const publicPolicy = publishedSpaceMetadataPolicy({
      id: "material-futures-123",
      visibility: "public",
      title: "Material Futures",
      artist: "Field Office",
    });
    expect(publicPolicy).toMatchObject({
      canonical: "https://lieuva.com/spaces/material-futures-123",
      robots: "index,follow,max-image-preview:large",
      image: "https://lieuva.com/space-cards/material-futures-123",
    });
    expect(publicPolicy.title).toContain("Material Futures");

    expect(publishedSpaceMetadataPolicy({
      id: "material-futures-123",
      visibility: "public",
      title: "Material Futures",
      artist: "Field Office",
      indexEligible: false,
    }).robots).toContain("noindex");

    for (const visibility of ["unlisted", "private"] as const) {
      const protectedPolicy = publishedSpaceMetadataPolicy({
        id: "secret-space-123",
        visibility,
        title: "Confidential launch",
        artist: "Private studio",
      });
      expect(protectedPolicy.robots).toBe("noindex,nofollow");
      expect(JSON.stringify(protectedPolicy)).not.toContain("Confidential launch");
      expect(JSON.stringify(protectedPolicy)).not.toContain("Private studio");
    }
  });
});
