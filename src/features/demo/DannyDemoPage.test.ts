import { describe, expect, it } from "vitest";
import {
  DANNY_ARTWORKS,
  DANNY_DEMO_ASSET_URL,
  DANNY_DEMO_METADATA,
} from "./dannyReference";

describe("Danny reference exhibition contract", () => {
  it("keeps the canonical route, identity and delivered GLB", () => {
    expect(DANNY_DEMO_METADATA).toEqual({
      artist: "Danny Hirsch",
      caption: "Material, movement, and atmosphere by Danny Hirsch.",
      creator: "Danny Hirsch Arts",
      directorySource:
        "Metadata comes from the delivered exhibition model. Six images are magnified surface studies; wARTrobe is a complete front view.",
      route: "/demo",
      title: "Threshold",
      year: "2026",
    });
    expect(DANNY_DEMO_ASSET_URL).toBe(
      "./assets/demo/danny-gallery-mobile.glb",
    );
  });

  it("maps every delivered hotspot to its stable directory entry", () => {
    expect(
      DANNY_ARTWORKS.map(({ id, imageKey, title }) => ({
        id,
        imageKey,
        title,
      })),
    ).toEqual([
      {
        id: "artwork-01",
        imageKey: "artwork-01",
        title: "Yellow Field, Veined",
      },
      { id: "artwork-02", imageKey: "artwork-02", title: "Black Current" },
      { id: "artwork-03", imageKey: "artwork-03", title: "Soft Terrain" },
      { id: "artwork-04", imageKey: "artwork-04", title: "Oxide Drift" },
      { id: "artwork-05", imageKey: "artwork-05", title: "Blue Aperture" },
      { id: "artwork-06", imageKey: "artwork-06", title: "Nocturne Relic" },
      {
        id: "wartrobe-front",
        imageKey: "gallery-04",
        title: "wARTrobe · Front",
      },
    ]);
    expect(DANNY_ARTWORKS.every(({ artist }) => artist === "Danny Hirsch")).toBe(
      true,
    );
  });
});
