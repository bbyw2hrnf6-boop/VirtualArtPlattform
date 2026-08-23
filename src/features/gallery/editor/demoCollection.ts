import type { Artwork, GalleryDraft, TemplateId } from "../types";
import { createGalleryDraft } from "./draftDefaults";
import {
  DEFAULT_ARTWORK_EYE_LINE_METRES,
  snapToPlacementGrid,
} from "./placementValidation";

const DEMO_ARTWORKS = [
  {
    src: "./assets/artworks/aura-cliffs-study.webp",
    title: "Cliff Study",
    description:
      "A fictional mineral landscape created as sample work for LIEUVA Studio.",
  },
  {
    src: "./assets/artworks/aura-forest-study.webp",
    title: "Forest Study",
    description:
      "A fictional botanical abstraction created as sample work for LIEUVA Studio.",
  },
  {
    src: "./assets/artworks/aura-pigment-study.webp",
    title: "Pigment Study",
    description:
      "A fictional pigment composition created as sample work for LIEUVA Studio.",
  },
] as const;

const DEMO_ASPECT = 518 / 810;
const DEMO_X = [-2.01, 0, 2.01] as const;
const FORUM_DEMO_X = [-3, 0, 3] as const;

export function createDemoCollectionDraft(
  templateId: TemplateId,
  createId: () => string = () => crypto.randomUUID(),
): GalleryDraft {
  const draft = createGalleryDraft(templateId);
  const artworks: Artwork[] = DEMO_ARTWORKS.map((artwork, index) => ({
    id: createId(),
    ...artwork,
    year: "2026",
    aspect: DEMO_ASPECT,
    wall: templateId === "pavilion" ? "divider-front" : "north",
    x: snapToPlacementGrid(
      templateId === "pavilion" ? FORUM_DEMO_X[index] : DEMO_X[index],
    ),
    y: DEFAULT_ARTWORK_EYE_LINE_METRES,
    scale: 1,
  }));
  return {
    ...draft,
    title: "Field Studies",
    artist: "LIEUVA sample collection",
    artworks,
  };
}
