import type { DirectoryArtwork } from "../gallery/ViewerExperience";

export const DANNY_DEMO_METADATA = {
  artist: "Danny Hirsch",
  caption: "Material, movement, and atmosphere by Danny Hirsch.",
  creator: "Danny Hirsch Arts",
  directorySource:
    "Metadata comes from the delivered exhibition model. Six images are magnified surface studies; wARTrobe is a complete front view.",
  route: "/demo",
  title: "Threshold",
  year: "2026",
} as const;

export const DANNY_DEMO_ASSET_URL =
  "./assets/demo/danny-gallery-mobile.glb";

// Copied from the delivered HOTSPOT_* extras in both Danny GLBs. The runtime
// image loader reads the matching, embedded WebP sources by asset key.
export const DANNY_ARTWORKS = [
  {
    id: "artwork-01",
    imageKey: "artwork-01",
    title: "Yellow Field, Veined",
    artist: "Danny Hirsch",
    year: "2026",
    medium: "Mixed Media on Canvas",
    dimensions: "40 × 50 cm",
    availability: "Available",
    description:
      "A charged botanical trace held inside a saturated field of light.",
    imageAlt:
      "Magnified surface detail of Yellow Field, Veined by Danny Hirsch",
  },
  {
    id: "artwork-02",
    imageKey: "artwork-02",
    title: "Black Current",
    artist: "Danny Hirsch",
    year: "2026",
    medium: "Acrylic on Canvas",
    dimensions: "40 × 50 cm",
    availability: "Available",
    description:
      "Dark movement breaks into mineral gold, fluid and deliberate.",
    imageAlt: "Magnified surface detail of Black Current by Danny Hirsch",
  },
  {
    id: "artwork-03",
    imageKey: "artwork-03",
    title: "Soft Terrain",
    artist: "Danny Hirsch",
    year: "2026",
    medium: "Mixed Media on Canvas",
    dimensions: "40 × 50 cm",
    availability: "Available",
    description:
      "Color drifts across the surface like atmosphere settling into matter.",
    imageAlt: "Magnified surface detail of Soft Terrain by Danny Hirsch",
  },
  {
    id: "artwork-04",
    imageKey: "artwork-04",
    title: "Oxide Drift",
    artist: "Danny Hirsch",
    year: "2026",
    medium: "Acrylic and Mineral Pigment on Canvas",
    dimensions: "40 × 50 cm",
    availability: "Available",
    description:
      "A low, metallic landscape shaped by pressure, reflection, and restraint.",
    imageAlt: "Magnified surface detail of Oxide Drift by Danny Hirsch",
  },
  {
    id: "artwork-05",
    imageKey: "artwork-05",
    title: "Blue Aperture",
    artist: "Danny Hirsch",
    year: "2026",
    medium: "Acrylic on Canvas",
    dimensions: "40 × 50 cm",
    availability: "Available",
    description:
      "Cool blues and silver tones open into a deep, architectural field.",
    imageAlt: "Magnified surface detail of Blue Aperture by Danny Hirsch",
  },
  {
    id: "artwork-06",
    imageKey: "artwork-06",
    title: "Nocturne Relic",
    artist: "Danny Hirsch",
    year: "2026",
    medium: "Mixed Media Assemblage",
    dimensions: "40 × 50 cm",
    availability: "Available",
    description:
      "Raw material interrupts a luminous ground with sculptural tension.",
    imageAlt: "Magnified surface detail of Nocturne Relic by Danny Hirsch",
  },
  {
    id: "wartrobe-front",
    imageKey: "gallery-04",
    title: "wARTrobe · Front",
    artist: "Danny Hirsch",
    year: "One-of-one object",
    medium: "Painted wardrobe installation",
    dimensions: "Details on request",
    availability: "Private inquiry",
    description:
      "A painted object where storage, memory, and surface become one architectural presence.",
    imageAlt:
      "Complete front view of the painted wARTrobe installation by Danny Hirsch",
  },
] satisfies readonly DirectoryArtwork[];
