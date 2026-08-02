import { describe, expect, it } from "vitest";
import {
  DEFAULT_ARTWORK_EYE_LINE_METRES,
  PLACEMENT_GRID_STEP_METRES,
  validateDraftPlacements,
} from "./placementValidation";
import { createDemoCollectionDraft } from "./demoCollection";

describe("demo collection sandbox", () => {
  it.each(["white-cube", "nocturne", "pavilion"] as const)(
    "creates a valid %s starter exhibition",
    (templateId) => {
      let id = 0;
      const draft = createDemoCollectionDraft(templateId, () => `demo-${++id}`);
      expect(draft).toMatchObject({
        templateId,
        title: "Field Studies",
        artist: "AURA sample collection",
      });
      expect(draft.artworks).toHaveLength(3);
      expect(new Set(draft.artworks.map((artwork) => artwork.id)).size).toBe(3);
      expect(
        draft.artworks.every(
          (artwork) =>
            artwork.y === DEFAULT_ARTWORK_EYE_LINE_METRES &&
            Math.abs(
              artwork.x / PLACEMENT_GRID_STEP_METRES -
                Math.round(artwork.x / PLACEMENT_GRID_STEP_METRES),
            ) < 1e-8,
        ),
      ).toBe(true);
      expect(
        draft.artworks.every((artwork) =>
          artwork.src.startsWith("./assets/artworks/"),
        ),
      ).toBe(true);
      expect(validateDraftPlacements(draft)).toEqual([]);
    },
  );
});
