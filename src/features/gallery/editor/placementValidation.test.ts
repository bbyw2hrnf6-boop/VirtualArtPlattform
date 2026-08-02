import { describe, expect, it } from "vitest";
import type {
  Artwork,
  DecorPlacement,
  GalleryDraft,
  TemplateId,
} from "../types";
import {
  DEFAULT_ARTWORK_EYE_LINE_METRES,
  PLACEMENT_GRID_STEP_METRES,
  findAvailableArtworkPlacement,
  findAvailableDecorPlacement,
  galleryWalls,
  artworkHorizontalBounds,
  distributeArtworksOnWall,
  repairDraftPlacements,
  updateArtworkPlacement,
  updateDecorPlacement,
  validateArtworkPlacement,
  validateDecorPlacement,
  validateDraftPlacements,
} from "./placementValidation";

function draft(
  templateId: TemplateId = "white-cube",
  artworks: Artwork[] = [],
  decor: DecorPlacement[] = [],
): GalleryDraft {
  return {
    title: "A real exhibition",
    artist: "A real artist",
    templateId,
    wall:
      templateId === "nocturne"
        ? "charcoal"
        : templateId === "pavilion"
          ? "travertine"
          : "chalk",
    floor:
      templateId === "nocturne"
        ? "dark-oak"
        : templateId === "pavilion"
          ? "marble"
          : "concrete",
    ceiling: templateId === "nocturne" ? "dark" : "gallery",
    lighting: templateId === "nocturne" ? "evening" : "daylight",
    artworks,
    decor,
  };
}

function artwork(id: string, overrides: Partial<Artwork> = {}): Artwork {
  return {
    id,
    title: `Artwork ${id}`,
    year: "2026",
    description: "A visitor-facing note.",
    src: `data:image/png;base64,${id}`,
    aspect: 1,
    wall: "south",
    x: 0,
    y: DEFAULT_ARTWORK_EYE_LINE_METRES,
    scale: 1,
    ...overrides,
  };
}

function object(
  id: string,
  overrides: Partial<DecorPlacement> = {},
): DecorPlacement {
  return {
    id,
    type: "pedestal",
    x: 0,
    z: 0,
    rotation: 0,
    scale: 1,
    ...overrides,
  };
}

describe("artwork placement", () => {
  it("exposes divider walls only for the pavilion", () => {
    expect(galleryWalls("white-cube")).toEqual([
      "north",
      "south",
      "west",
      "east",
    ]);
    expect(galleryWalls("pavilion")).toContain("divider-front");
    expect(galleryWalls("pavilion")).toContain("divider-back");
  });

  it("rejects invalid numbers, unavailable walls, and unsafe scales", () => {
    expect(
      validateArtworkPlacement(draft(), artwork("nan", { x: Number.NaN }))
        ?.code,
    ).toBe("invalid-number");
    expect(
      validateArtworkPlacement(draft(), artwork("aspect", { aspect: 0 }))?.code,
    ).toBe("invalid-number");
    expect(
      validateArtworkPlacement(
        draft(),
        artwork("wall", { wall: "divider-front" }),
      )?.code,
    ).toBe("invalid-wall");
    expect(
      validateArtworkPlacement(draft(), artwork("small", { scale: 0.44 }))
        ?.code,
    ).toBe("scale");
    expect(
      validateArtworkPlacement(draft(), artwork("large", { scale: 1.66 }))
        ?.code,
    ).toBe("scale");
  });

  it("validates the complete rectangle against all wall edges", () => {
    expect(
      validateArtworkPlacement(draft(), artwork("left", { x: -7.1 }))?.code,
    ).toBe("out-of-bounds");
    expect(
      validateArtworkPlacement(draft(), artwork("right", { x: 7.1 }))?.code,
    ).toBe("out-of-bounds");
    expect(
      validateArtworkPlacement(draft(), artwork("floor", { y: 0.8 }))?.code,
    ).toBe("out-of-bounds");
    expect(
      validateArtworkPlacement(draft(), artwork("ceiling", { y: 4.5 }))?.code,
    ).toBe("out-of-bounds");
    expect(validateArtworkPlacement(draft(), artwork("valid"))).toBeNull();
  });

  it("keeps artwork clear of authored wall architecture", () => {
    const issue = validateArtworkPlacement(
      draft(),
      artwork("reveal", { wall: "north", x: 16 * 0.31 }),
    );
    expect(issue).toMatchObject({
      code: "opening",
      target: "artwork",
      targetId: "reveal",
    });
  });

  it("detects overlap on the same wall but permits the same coordinates on another wall", () => {
    const existing = artwork("first");
    const overlapping = artwork("second", { x: 1.7 });
    const issue = validateArtworkPlacement(
      draft("white-cube", [existing, overlapping]),
      overlapping,
    );
    expect(issue).toMatchObject({ code: "overlap", relatedId: "first" });

    const otherWall = artwork("other-wall", { wall: "north" });
    expect(
      validateArtworkPlacement(
        draft("white-cube", [existing, otherWall]),
        otherWall,
      ),
    ).toBeNull();
  });

  it("keeps rejected transforms transactional and snaps accepted placement to the 3 cm grid", () => {
    const original = draft("white-cube", [
      artwork("first"),
      artwork("second", { x: 3 }),
    ]);
    const rejected = updateArtworkPlacement(original, "second", { x: 0 });
    expect(rejected.ok).toBe(false);
    expect(rejected.draft).toBe(original);
    expect(original.artworks[1].x).toBe(3);

    const accepted = updateArtworkPlacement(original, "second", {
      x: 2.137,
      y: 1.731,
    });
    expect(accepted.ok).toBe(true);
    expect(accepted.draft).not.toBe(original);
    expect(accepted.draft.artworks[1]).toMatchObject({ x: 2.13, y: 1.72 });
    expect(original.artworks[1].x).toBe(3);
  });

  it("exposes safe alignment bounds and keeps locked artwork stationary", () => {
    const item = artwork("locked", { locked: true });
    const current = draft("white-cube", [item]);
    const bounds = artworkHorizontalBounds(current, item);
    expect(bounds.min).toBeLessThan(0);
    expect(bounds.max).toBeGreaterThan(0);
    const result = updateArtworkPlacement(current, item.id, { x: bounds.min });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issue.code).toBe("locked");
    expect(result.draft).toBe(current);
  });

  it("finds a snapped free slot instead of returning an overlapping preference", () => {
    const moving = artwork("moving");
    const existing = artwork("existing");
    const current = draft("white-cube", [existing, moving]);
    const placement = findAvailableArtworkPlacement(
      current,
      moving.id,
      "south",
      0,
      DEFAULT_ARTWORK_EYE_LINE_METRES,
    );
    expect(placement).not.toBeNull();
    expect(placement?.x).not.toBe(0);
    expect((placement?.x ?? 0) / PLACEMENT_GRID_STEP_METRES).toBeCloseTo(
      Math.round((placement?.x ?? 0) / PLACEMENT_GRID_STEP_METRES),
      8,
    );
    expect(
      ((placement?.y ?? 0) - DEFAULT_ARTWORK_EYE_LINE_METRES) /
        PLACEMENT_GRID_STEP_METRES,
    ).toBeCloseTo(
      Math.round(
        ((placement?.y ?? 0) - DEFAULT_ARTWORK_EYE_LINE_METRES) /
          PLACEMENT_GRID_STEP_METRES,
      ),
      8,
    );
    expect(
      validateArtworkPlacement(current, { ...moving, ...placement }),
    ).toBeNull();
  });

  it("distributes visible wall artwork transactionally and respects locks", () => {
    const current = draft("white-cube", [
      artwork("left", { x: -2.4 }),
      artwork("middle", { x: 0 }),
      artwork("right", { x: 2.4 }),
    ]);
    const result = distributeArtworksOnWall(current, "south");
    expect(result.ok).toBe(true);
    expect(validateDraftPlacements(result.draft)).toEqual([]);
    const positions = result.draft.artworks.map((item) => item.x);
    expect(positions[0]).toBeLessThan(positions[1]);
    expect(positions[1]).toBeLessThan(positions[2]);

    const locked = draft("white-cube", [
      artwork("fixed", { x: -2.4, locked: true }),
      artwork("free", { x: 2.4 }),
    ]);
    const blocked = distributeArtworksOnWall(locked, "south");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.issue.code).toBe("locked");
    expect(blocked.draft).toBe(locked);
  });
});

describe("decor placement", () => {
  it("rejects invalid values, unsafe scales, and rotated footprints outside the room", () => {
    expect(
      validateDecorPlacement(
        draft(),
        object("nan", { rotation: Number.POSITIVE_INFINITY }),
      )?.code,
    ).toBe("invalid-number");
    expect(
      validateDecorPlacement(draft(), object("small", { scale: 0.49 }))?.code,
    ).toBe("scale");
    expect(
      validateDecorPlacement(draft(), object("large", { scale: 1.81 }))?.code,
    ).toBe("scale");
    expect(
      validateDecorPlacement(
        draft(),
        object("edge", { type: "gallery-bench", z: 5, rotation: Math.PI / 2 }),
      )?.code,
    ).toBe("out-of-bounds");
  });

  it("detects procedural architecture in different templates", () => {
    const reveal = object("reveal", {
      x: 16 * 0.31,
      z: -12 / 2 + 12 * 0.1 + 0.18,
    });
    expect(validateDecorPlacement(draft("white-cube"), reveal)?.code).toBe(
      "architecture",
    );

    const stage = object("stage", { x: 0, z: 0.65 });
    expect(validateDecorPlacement(draft("nocturne"), stage)).toMatchObject({
      code: "architecture",
      targetId: "stage",
    });
  });

  it("uses oriented footprints for object overlap", () => {
    const first = object("first", {
      type: "gallery-bench",
      rotation: Math.PI / 4,
    });
    const second = object("second", {
      type: "gallery-bench",
      rotation: -Math.PI / 4,
    });
    expect(
      validateDecorPlacement(draft("white-cube", [], [first, second]), second),
    ).toMatchObject({ code: "overlap", relatedId: "first" });

    const clear = object("clear", { type: "gallery-bench", x: 4 });
    expect(
      validateDecorPlacement(draft("white-cube", [], [first, clear]), clear),
    ).toBeNull();
  });

  it("keeps rejected transforms transactional", () => {
    const original = draft(
      "white-cube",
      [],
      [object("first"), object("second", { x: 3 })],
    );
    const rejected = updateDecorPlacement(original, "second", { x: 0 });
    expect(rejected.ok).toBe(false);
    expect(rejected.draft).toBe(original);

    const accepted = updateDecorPlacement(original, "second", {
      x: 3.137,
      z: 0.123,
      rotation: 0.37,
    });
    expect(accepted.ok).toBe(true);
    expect(accepted.draft.decor[1]).toMatchObject({
      x: 3.15,
      z: 0.12,
      rotation: 0.37,
    });
  });

  it("finds a valid snapped slot around occupied floor space", () => {
    const existing = object("existing");
    const moving = object("moving");
    const current = draft("white-cube", [], [existing, moving]);
    const placement = findAvailableDecorPlacement(current, moving, 0, 0);
    expect(placement).not.toBeNull();
    expect(placement && (placement.x !== 0 || placement.z !== 0)).toBe(true);
    expect((placement?.x ?? 0) / PLACEMENT_GRID_STEP_METRES).toBeCloseTo(
      Math.round((placement?.x ?? 0) / PLACEMENT_GRID_STEP_METRES),
      8,
    );
    expect((placement?.z ?? 0) / PLACEMENT_GRID_STEP_METRES).toBeCloseTo(
      Math.round((placement?.z ?? 0) / PLACEMENT_GRID_STEP_METRES),
      8,
    );
    expect(
      validateDecorPlacement(current, placement as DecorPlacement),
    ).toBeNull();
  });
});

describe("draft validation and repair", () => {
  it("repairs overlapping artwork and decor into valid nearby slots", () => {
    const broken = draft(
      "white-cube",
      [artwork("art-1"), artwork("art-2")],
      [object("decor-1"), object("decor-2")],
    );
    expect(validateDraftPlacements(broken).map((issue) => issue.code)).toEqual([
      "overlap",
      "overlap",
      "overlap",
      "overlap",
    ]);

    const repaired = repairDraftPlacements(broken);
    expect(repaired.unresolved).toEqual([]);
    expect(validateDraftPlacements(repaired.draft)).toEqual([]);
    expect(repaired.draft.artworks[1]).not.toMatchObject({
      x: 0,
      y: DEFAULT_ARTWORK_EYE_LINE_METRES,
    });
    expect(repaired.draft.decor[1]).not.toMatchObject({ x: 0, z: 0 });
  });

  it("reports geometry that cannot fit any slot", () => {
    const impossible = draft("white-cube", [
      artwork("too-wide", { aspect: 20 }),
    ]);
    const repaired = repairDraftPlacements(impossible);
    expect(repaired.unresolved).toHaveLength(1);
    expect(repaired.unresolved[0]).toMatchObject({
      code: "out-of-bounds",
      targetId: "too-wide",
    });
  });
});
