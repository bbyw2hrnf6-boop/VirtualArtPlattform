import { describe, expect, it } from "vitest";
import type { Artwork, GalleryDraft } from "../types";
import { reviewGalleryForPublish } from "./publishReview";

function artwork(overrides: Partial<Artwork> = {}): Artwork {
  return {
    id: "art-1",
    title: "Field Notes",
    year: "2026",
    description: "Pigment and light on linen.",
    src: "data:image/png;base64,art",
    aspect: 1,
    wall: "south",
    x: 0,
    y: 1.55,
    scale: 1,
    ...overrides,
  };
}

function draft(overrides: Partial<GalleryDraft> = {}): GalleryDraft {
  return {
    title: "A real exhibition",
    artist: "A real artist",
    templateId: "white-cube",
    wall: "chalk",
    floor: "concrete",
    ceiling: "gallery",
    lighting: "daylight",
    decor: [],
    artworks: [artwork()],
    ...overrides,
  };
}

describe("publish review", () => {
  it("accepts a complete, valid gallery", () => {
    expect(reviewGalleryForPublish(draft())).toEqual([]);
  });

  it("blocks placeholder exhibition identity and an empty room", () => {
    const issues = reviewGalleryForPublish(
      draft({
        title: "Untitled exhibition",
        artist: "Your name",
        artworks: [],
      }),
    );
    expect(
      issues
        .filter((issue) => issue.severity === "error")
        .map((issue) => issue.id),
    ).toEqual(["title", "artist", "artworks"]);
  });

  it("blocks missing image and title while warning about optional visitor context", () => {
    const issues = reviewGalleryForPublish(
      draft({
        artworks: [artwork({ title: " ", src: "", year: "", description: "" })],
      }),
    );
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "source-art-1",
          severity: "error",
          targetId: "art-1",
        }),
        expect.objectContaining({
          id: "artwork-title-art-1",
          severity: "error",
          targetId: "art-1",
        }),
        expect.objectContaining({
          id: "year-art-1",
          severity: "warning",
          targetId: "art-1",
        }),
        expect.objectContaining({
          id: "description-art-1",
          severity: "warning",
          targetId: "art-1",
        }),
      ]),
    );
  });

  it("turns every invalid placement into a publish-blocking geometry error", () => {
    const invalid = artwork({ x: 20 });
    const issues = reviewGalleryForPublish(draft({ artworks: [invalid] }));
    const geometry = issues.find((issue) =>
      issue.id.startsWith("geometry-artwork-art-1"),
    );
    expect(geometry).toMatchObject({
      severity: "error",
      title: "Invalid artwork placement",
      targetId: "art-1",
    });
    expect(geometry?.detail).toContain("wall edges");
  });

  it("reports overlapping floor objects as publish blockers", () => {
    const issues = reviewGalleryForPublish(
      draft({
        decor: [
          {
            id: "decor-1",
            type: "pedestal",
            x: 0,
            z: 0,
            rotation: 0,
            scale: 1,
          },
          {
            id: "decor-2",
            type: "pedestal",
            x: 0,
            z: 0,
            rotation: 0,
            scale: 1,
          },
        ],
      }),
    );
    const geometry = issues.filter((issue) =>
      issue.id.startsWith("geometry-decor"),
    );
    expect(geometry).toHaveLength(2);
    expect(geometry.every((issue) => issue.severity === "error")).toBe(true);
  });

  it("requires one visible work but ignores deliberately hidden artwork metadata", () => {
    const hidden = artwork({ hidden: true, title: "", src: "", x: 30 });
    const issues = reviewGalleryForPublish(draft({ artworks: [hidden] }));
    expect(issues.map((issue) => issue.id)).toEqual(["artworks"]);
  });
});
