export const TRUSTED_GALLERY_SCHEMA_VERSION = 3;

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;
const TEMPLATE_IDS = ["white-cube", "nocturne", "pavilion"] as const;
const WALL_IDS = [
  "north",
  "south",
  "west",
  "east",
  "divider-front",
  "divider-back",
  "north-cross-west",
  "north-room-west",
  "north-cross-east",
  "north-room-east",
  "south-cross-west",
  "south-room-west",
  "south-cross-east",
  "south-room-east",
] as const;
const WALL_FINISHES = [
  "chalk",
  "warm",
  "travertine",
  "linen",
  "charcoal",
  "microcement",
  "limestone",
  "oak-slats",
  "light-concrete",
  "black-slats",
  "marble-wall",
  "dark-stone",
] as const;
const FLOOR_FINISHES = [
  "concrete",
  "oak",
  "terrazzo",
  "marble",
  "black-marble",
  "walnut",
  "dark-oak",
  "microcement",
  "slate",
  "dark-concrete",
  "travertine-floor",
] as const;
const CEILING_FINISHES = ["gallery", "warm", "dark", "skylight", "vaulted"] as const;
const LIGHTING_PRESETS = ["daylight", "museum", "evening"] as const;
const DECOR_IDS = [
  "olive",
  "monstera",
  "arc-lamp",
  "pedestal",
  "gallery-bench",
  "stone-sculpture",
  "floor-vase",
  "ficus",
  "snake-plant",
  "leather-bench",
  "wood-stool",
  "rope-barrier",
] as const;
const POT_FINISHES = ["light", "black"] as const;
const ARTWORK_FRAMES = ["black", "white", "oak", "dark-wood", "metal", "none"] as const;
const ARTWORK_MATS = ["white", "warm-white", "black", "none"] as const;

const TOP_LEVEL_KEYS = new Set([
  "artist",
  "artworks",
  "ceiling",
  "decor",
  "floor",
  "lighting",
  "templateId",
  "title",
  "wall",
]);
const ARTWORK_KEYS = new Set([
  "aspect",
  "assetId",
  "description",
  "dimensions",
  "frame",
  "id",
  "mat",
  "medium",
  "scale",
  "src",
  "storagePath",
  "title",
  "wall",
  "x",
  "y",
  "year",
]);
const DECOR_KEYS = new Set(["id", "potColor", "rotation", "scale", "type", "x", "z"]);
const MAX_MANIFEST_BYTES = 192 * 1024;

type UnknownRecord = Record<string, unknown>;
type TemplateId = (typeof TEMPLATE_IDS)[number];

export type TrustedGalleryArtwork = {
  id: string;
  title: string;
  src: "";
  storagePath: string;
  aspect: number;
  wall: (typeof WALL_IDS)[number];
  x: number;
  y: number;
  scale: number;
  year?: string;
  medium?: string;
  dimensions?: string;
  description?: string;
  frame?: (typeof ARTWORK_FRAMES)[number];
  mat?: (typeof ARTWORK_MATS)[number];
};

export type TrustedGalleryDraft = {
  title: string;
  artist: string;
  templateId: TemplateId;
  wall: (typeof WALL_FINISHES)[number];
  floor: (typeof FLOOR_FINISHES)[number];
  ceiling: (typeof CEILING_FINISHES)[number];
  lighting: (typeof LIGHTING_PRESETS)[number];
  decor: Array<{
    id: string;
    type: (typeof DECOR_IDS)[number];
    x: number;
    z: number;
    rotation: number;
    scale: number;
    potColor?: (typeof POT_FINISHES)[number];
  }>;
  artworks: TrustedGalleryArtwork[];
};

export type GalleryManifestContext = {
  ownerId: string;
  galleryId: string;
  revisionId?: string;
};

function invalid(field: string, reason: string): never {
  throw new Error(`Invalid trusted gallery manifest at ${field}: ${reason}.`);
}

function objectValue(value: unknown, field: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid(field, "expected an object");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    invalid(field, "expected a plain object");
  return value as UnknownRecord;
}

function allowedKeys(value: UnknownRecord, allowed: ReadonlySet<string>, field: string) {
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length) invalid(field, `unexpected field ${unexpected.sort()[0]}`);
}

function stringValue(
  value: unknown,
  field: string,
  { minimum = 0, maximum }: { minimum?: number; maximum: number },
) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum)
    invalid(field, `expected ${minimum}-${maximum} characters`);
  if (value.includes("\u0000")) invalid(field, "contains invalid control data");
  return value;
}

function optionalString(value: unknown, field: string, maximum: number) {
  return value === undefined
    ? undefined
    : stringValue(value, field, { maximum });
}

function finiteNumber(value: unknown, field: string, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum)
    invalid(field, `expected a finite number from ${minimum} to ${maximum}`);
  return value;
}

function enumValue<const T extends readonly string[]>(value: unknown, values: T, field: string): T[number] {
  if (typeof value !== "string" || !values.includes(value))
    invalid(field, `expected one of ${values.join(", ")}`);
  return value as T[number];
}

function checkedSegment(value: string, field: string) {
  if (typeof value !== "string" || !SAFE_SEGMENT.test(value))
    invalid(field, "expected a portable identifier");
  return value;
}

function templateDimensions(templateId: TemplateId) {
  if (templateId === "white-cube") return { width: 16, depth: 12, height: 5.3, maximumArtworks: 8 };
  if (templateId === "nocturne") return { width: 15.5, depth: 11.5, height: 5.8, maximumArtworks: 8 };
  return { width: 40, depth: 60, height: 5.6, maximumArtworks: 14 };
}

function availableWalls(templateId: TemplateId) {
  return templateId === "pavilion" ? WALL_IDS : WALL_IDS.slice(0, 4);
}

function wallWidth(templateId: TemplateId, wall: (typeof WALL_IDS)[number]) {
  const dimensions = templateDimensions(templateId);
  if (wall.startsWith("divider")) return 14;
  if (wall.includes("-room-") || wall.includes("-cross-")) return dimensions.width / 4;
  return wall === "north" || wall === "south" ? dimensions.width : dimensions.depth;
}

export function galleryUploadRoot(context: GalleryManifestContext) {
  const ownerId = checkedSegment(context.ownerId, "ownerId");
  const galleryId = checkedSegment(context.galleryId, "galleryId");
  const root = `published/${ownerId}/${galleryId}`;
  if (context.revisionId === undefined) return root;
  return `${root}/revisions/${checkedSegment(context.revisionId, "revisionId")}`;
}

export function expectedGalleryUploadPaths(
  draft: Pick<TrustedGalleryDraft, "artworks">,
  context: GalleryManifestContext,
) {
  const root = galleryUploadRoot(context);
  return [
    `${root}/cover.webp`,
    ...draft.artworks.map((_, index) => `${root}/artworks/${index + 1}.webp`),
  ];
}

function parseArtwork(
  value: unknown,
  index: number,
  templateId: TemplateId,
  context: GalleryManifestContext,
): TrustedGalleryArtwork {
  const field = `artworks[${index}]`;
  const item = objectValue(value, field);
  allowedKeys(item, ARTWORK_KEYS, field);
  const wall = enumValue(item.wall, availableWalls(templateId), `${field}.wall`);
  const expectedPath = `${galleryUploadRoot(context)}/artworks/${index + 1}.webp`;
  const storagePath = stringValue(item.storagePath, `${field}.storagePath`, { minimum: 1, maximum: 320 });
  if (storagePath !== expectedPath) invalid(`${field}.storagePath`, "does not match its trusted upload slot");
  if (item.src !== "") invalid(`${field}.src`, "embedded image data is forbidden");

  const artwork: TrustedGalleryArtwork = {
    id: stringValue(item.id, `${field}.id`, { minimum: 1, maximum: 100 }),
    title: stringValue(item.title, `${field}.title`, { maximum: 80 }),
    src: "",
    storagePath,
    aspect: finiteNumber(item.aspect, `${field}.aspect`, 0.08, 12),
    wall,
    x: finiteNumber(item.x, `${field}.x`, -wallWidth(templateId, wall) / 2, wallWidth(templateId, wall) / 2),
    y: finiteNumber(item.y, `${field}.y`, 0.2, templateDimensions(templateId).height),
    scale: finiteNumber(item.scale, `${field}.scale`, 0.2, 3),
  };
  const year = optionalString(item.year, `${field}.year`, 12);
  const medium = optionalString(item.medium, `${field}.medium`, 80);
  const dimensions = optionalString(item.dimensions, `${field}.dimensions`, 80);
  const description = optionalString(item.description, `${field}.description`, 240);
  if (year !== undefined) artwork.year = year;
  if (medium !== undefined) artwork.medium = medium;
  if (dimensions !== undefined) artwork.dimensions = dimensions;
  if (description !== undefined) artwork.description = description;
  if (item.frame !== undefined) artwork.frame = enumValue(item.frame, ARTWORK_FRAMES, `${field}.frame`);
  if (item.mat !== undefined) artwork.mat = enumValue(item.mat, ARTWORK_MATS, `${field}.mat`);
  return artwork;
}

function parseDecor(value: unknown, index: number, templateId: TemplateId) {
  const field = `decor[${index}]`;
  const item = objectValue(value, field);
  allowedKeys(item, DECOR_KEYS, field);
  const bounds = templateDimensions(templateId);
  const decor: TrustedGalleryDraft["decor"][number] = {
    id: stringValue(item.id, `${field}.id`, { minimum: 1, maximum: 100 }),
    type: enumValue(item.type, DECOR_IDS, `${field}.type`),
    x: finiteNumber(item.x, `${field}.x`, -bounds.width / 2, bounds.width / 2),
    z: finiteNumber(item.z, `${field}.z`, -bounds.depth / 2, bounds.depth / 2),
    rotation: finiteNumber(item.rotation, `${field}.rotation`, -7, 7),
    scale: finiteNumber(item.scale, `${field}.scale`, 0.2, 3),
  };
  if (item.potColor !== undefined)
    decor.potColor = enumValue(item.potColor, POT_FINISHES, `${field}.potColor`);
  return decor;
}

function unique(values: string[], field: string) {
  if (new Set(values).size !== values.length) invalid(field, "expected unique values");
}

export function validateTrustedGalleryManifest(
  value: unknown,
  context: GalleryManifestContext,
): TrustedGalleryDraft {
  checkedSegment(context.ownerId, "ownerId");
  checkedSegment(context.galleryId, "galleryId");
  if (context.revisionId !== undefined) checkedSegment(context.revisionId, "revisionId");
  let bytes: number;
  try {
    bytes = Buffer.byteLength(JSON.stringify(value));
  } catch {
    invalid("gallery", "must be serializable JSON");
  }
  if (bytes > MAX_MANIFEST_BYTES) invalid("gallery", "exceeds the byte limit");
  const data = objectValue(value, "gallery");
  allowedKeys(data, TOP_LEVEL_KEYS, "gallery");
  const templateId = enumValue(data.templateId, TEMPLATE_IDS, "templateId");
  if (!Array.isArray(data.artworks) || !data.artworks.length)
    invalid("artworks", "expected a non-empty list");
  if (!Array.isArray(data.decor)) invalid("decor", "expected a list");
  const bounds = templateDimensions(templateId);
  if (data.artworks.length > bounds.maximumArtworks)
    invalid("artworks", `expected at most ${bounds.maximumArtworks} items`);
  if (data.decor.length > 8) invalid("decor", "expected at most 8 items");

  const artworks = data.artworks.map((item, index) => parseArtwork(item, index, templateId, context));
  const decor = data.decor.map((item, index) => parseDecor(item, index, templateId));
  unique(artworks.map((artwork) => artwork.id), "artworks.id");
  unique(artworks.map((artwork) => artwork.storagePath), "artworks.storagePath");
  unique(decor.map((item) => item.id), "decor.id");

  return {
    // Match the shipped client validator. Existing drafts may intentionally
    // retain surrounding whitespace, so server mediation must not introduce a
    // new rejection during rollout.
    title: stringValue(data.title, "title", { minimum: 1, maximum: 100 }),
    artist: stringValue(data.artist, "artist", { minimum: 1, maximum: 100 }),
    templateId,
    wall: enumValue(data.wall, WALL_FINISHES, "wall"),
    floor: enumValue(data.floor, FLOOR_FINISHES, "floor"),
    ceiling: data.ceiling === undefined
      ? "gallery"
      : enumValue(data.ceiling, CEILING_FINISHES, "ceiling"),
    lighting: enumValue(data.lighting, LIGHTING_PRESETS, "lighting"),
    decor,
    artworks,
  };
}

export function validateGalleryDistribution(value: unknown) {
  const data = objectValue(value, "distribution");
  allowedKeys(data, new Set(["creatorProfileListed", "exploreListed"]), "distribution");
  if (typeof data.exploreListed !== "boolean" || typeof data.creatorProfileListed !== "boolean")
    invalid("distribution", "expected explicit boolean choices");
  return {
    exploreListed: data.exploreListed,
    creatorProfileListed: data.creatorProfileListed,
  };
}
