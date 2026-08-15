import { Timestamp } from 'firebase/firestore';
import { getTemplate } from '../features/gallery/templates';
import {
  FORUM_INTERIOR_WALLS,
  isShortGalleryWall,
  type Artwork,
  type ArtworkFrame,
  type CeilingFinish,
  type DecorId,
  type DecorPlacement,
  type FloorFinish,
  type GalleryDraft,
  type LightingPreset,
  type PlantPotFinish,
  type TemplateId,
  type WallFinish,
  type WallId,
} from '../features/gallery/types';
import type {
  GalleryRetention,
  GalleryLifecycleStatus,
  GalleryVisibility,
} from './galleryAccess';

type UnknownRecord = Record<string, unknown>;

const TEMPLATE_IDS = ['white-cube', 'nocturne', 'pavilion'] as const satisfies readonly TemplateId[];
const WALL_IDS = ['north', 'south', 'west', 'east', 'divider-front', 'divider-back', ...FORUM_INTERIOR_WALLS] as const satisfies readonly WallId[];
const WALL_FINISHES = ['chalk', 'warm', 'travertine', 'linen', 'charcoal', 'microcement', 'limestone', 'oak-slats', 'light-concrete', 'black-slats', 'marble-wall', 'dark-stone'] as const satisfies readonly WallFinish[];
const FLOOR_FINISHES = ['concrete', 'oak', 'terrazzo', 'marble', 'black-marble', 'walnut', 'dark-oak', 'microcement', 'slate', 'dark-concrete', 'travertine-floor'] as const satisfies readonly FloorFinish[];
const CEILING_FINISHES = ['gallery', 'warm', 'dark', 'skylight', 'vaulted'] as const satisfies readonly CeilingFinish[];
const LIGHTING_PRESETS = ['daylight', 'museum', 'evening'] as const satisfies readonly LightingPreset[];
const PLANT_POT_FINISHES = ['light', 'black'] as const satisfies readonly PlantPotFinish[];
const DECOR_IDS = ['olive', 'monstera', 'arc-lamp', 'pedestal', 'gallery-bench', 'stone-sculpture', 'floor-vase', 'ficus', 'snake-plant', 'leather-bench', 'wood-stool', 'rope-barrier'] as const satisfies readonly DecorId[];
const ARTWORK_FRAMES = ['black', 'white', 'oak', 'none'] as const satisfies readonly ArtworkFrame[];
const GALLERY_VISIBILITIES = ['public', 'unlisted', 'private'] as const satisfies readonly GalleryVisibility[];
const GALLERY_RETENTIONS = ['guest-10-days', 'account-preview'] as const satisfies readonly GalleryRetention[];
const GALLERY_LIFECYCLE_STATUSES = ['active', 'archived', 'trashed'] as const satisfies readonly GalleryLifecycleStatus[];

const MAX_ARTWORK_SOURCE_LENGTH = 779_999;
// New covers are uploaded to Storage rather than embedded in Firestore. The
// source is still bounded before upload so canvas captures cannot spike memory.
const MAX_COVER_SOURCE_LENGTH = 1_333_000;
// Existing MVP publications predate the cover limit. Firestore documents are
// already capped at 1 MiB, so accepting a bounded legacy cover keeps old share
// links working without weakening validation for new writes.
const MAX_LEGACY_COVER_SOURCE_LENGTH = 950_000;
const MAX_DECOR = 8;

export class GalleryRepositoryDataError extends Error {
  readonly code = 'invalid-gallery-data';
  readonly recordId: string;
  readonly field: string;

  constructor(recordId: string, field: string, message: string) {
    super(`Invalid gallery data in “${recordId}” at ${field}: ${message}`);
    this.name = 'GalleryRepositoryDataError';
    this.recordId = recordId;
    this.field = field;
  }
}

export interface ParsedGalleryDocument extends GalleryDraft {
  publishedAt: string;
  expiresAt: string;
  ownerId?: string;
  coverSrc?: string;
  coverPath?: string;
  visibility: GalleryVisibility;
  retention: GalleryRetention;
  accessVersion: number;
  revision: number;
  updatedAt: string;
  lifecycleStatus: GalleryLifecycleStatus;
  trashedAt?: string;
  purgeAt?: string;
}

export interface ParsedArtworkAsset {
  src: string;
  publishedAt: string;
  expiresAt: string;
}

interface DraftValidationOptions {
  recordId?: string;
  requireArtworkSources?: boolean;
}

const isRecord = (value: unknown): value is UnknownRecord => typeof value === 'object' && value !== null && !Array.isArray(value);

function invalid(recordId: string, field: string, message: string): never {
  throw new GalleryRepositoryDataError(recordId, field, message);
}

function recordValue(value: unknown, recordId: string, field: string): UnknownRecord {
  if (!isRecord(value)) invalid(recordId, field, 'expected an object');
  return value;
}

function stringValue(value: unknown, recordId: string, field: string, maximum: number, minimum = 0): string {
  if (typeof value !== 'string') invalid(recordId, field, 'expected a string');
  if (value.length < minimum || value.length > maximum) invalid(recordId, field, `expected ${minimum}–${maximum} characters`);
  return value;
}

function optionalString(value: unknown, recordId: string, field: string, maximum: number): string | undefined {
  return value === undefined ? undefined : stringValue(value, recordId, field, maximum);
}

function numberValue(value: unknown, recordId: string, field: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(recordId, field, 'expected a finite number');
  if (value < minimum || value > maximum) invalid(recordId, field, `expected a value between ${minimum} and ${maximum}`);
  return value;
}

function integerValue(value: unknown, recordId: string, field: string, minimum: number, maximum: number): number {
  const parsed = numberValue(value, recordId, field, minimum, maximum);
  if (!Number.isInteger(parsed)) invalid(recordId, field, 'expected an integer');
  return parsed;
}

function enumValue<T extends string>(value: unknown, values: readonly T[], recordId: string, field: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) invalid(recordId, field, `expected one of: ${values.join(', ')}`);
  return value as T;
}

function timestampValue(value: unknown, recordId: string, field: string): Date {
  let date: Date;
  if (value instanceof Timestamp) date = value.toDate();
  else if (value instanceof Date) date = value;
  else if (typeof value === 'string') date = new Date(value);
  else invalid(recordId, field, 'expected a Firestore timestamp');
  if (!Number.isFinite(date.getTime())) invalid(recordId, field, 'expected a valid timestamp');
  return date;
}

function imageSource(value: unknown, recordId: string, field: string, maximum: number, allowEmpty: boolean): string {
  const source = stringValue(value, recordId, field, maximum);
  if (!source && allowEmpty) return source;
  const match = /^data:image\/(?:avif|jpeg|png|webp);base64,/i.exec(source);
  if (!match || source.length === match[0].length || !/^[a-z0-9+/=]+$/i.test(source.slice(match[0].length))) {
    invalid(recordId, field, 'expected a supported embedded image');
  }
  return source;
}

function optionalImageSource(value: unknown, recordId: string, field: string, maximum: number): string | undefined {
  return value === undefined ? undefined : imageSource(value, recordId, field, maximum, true);
}

function validateSchemaVersion(value: unknown, recordId: string): 1 | 2 | 3 {
  if (value === undefined || value === 1) return 1;
  if (value === 2) return 2;
  if (value === 3) return 3;
  invalid(recordId, 'schemaVersion', 'expected schema version 1, 2, or 3');
}

function storagePath(value: unknown, recordId: string, field: string): string {
  const path = stringValue(value, recordId, field, 320, 1);
  if (!/^published\/[a-zA-Z0-9_-]{1,128}\/[a-zA-Z0-9_-]{1,128}\/(?:(?:cover[.]webp|artworks\/(?:[1-9]|1[0-4])[.]webp)|revisions\/[a-zA-Z0-9_-]{1,128}\/(?:cover[.]webp|artworks\/(?:[1-9]|1[0-4])[.]webp))$/.test(path))
    invalid(recordId, field, 'expected an owned gallery Storage path');
  return path;
}

function optionalStoragePath(value: unknown, recordId: string, field: string): string | undefined {
  return value === undefined ? undefined : storagePath(value, recordId, field);
}

function availableWalls(templateId: TemplateId): readonly WallId[] {
  return templateId === 'pavilion' ? WALL_IDS : WALL_IDS.slice(0, 4);
}

function ensureUnique(values: Array<string | undefined>, recordId: string, field: string): void {
  const present = values.filter((value): value is string => Boolean(value));
  if (new Set(present).size !== present.length) invalid(recordId, field, 'expected unique values');
}

function parseArtwork(value: unknown, index: number, templateId: TemplateId, recordId: string, requireSource: boolean): Artwork {
  const field = `artworks[${index}]`;
  const item = recordValue(value, recordId, field);
  const template = getTemplate(templateId);
  const wall = enumValue(item.wall, availableWalls(templateId), recordId, `${field}.wall`);
  const wallWidth = isShortGalleryWall(wall)
    ? wall.startsWith('divider') ? (template.dividerWidth ?? 6.2) : template.dimensions[0] / 4
    : wall === 'north' || wall === 'south' ? template.dimensions[0] : template.dimensions[1];
  const src = imageSource(item.src, recordId, `${field}.src`, MAX_ARTWORK_SOURCE_LENGTH, !requireSource);
  const assetId = optionalString(item.assetId, recordId, `${field}.assetId`, 100);
  const storagePathValue = optionalStoragePath(item.storagePath, recordId, `${field}.storagePath`);
  if (!src && !assetId && !storagePathValue) invalid(recordId, field, 'expected an embedded source or asset reference');

  return {
    id: stringValue(item.id, recordId, `${field}.id`, 100, 1),
    ...(assetId ? { assetId } : {}),
    ...(storagePathValue ? { storagePath: storagePathValue } : {}),
    title: stringValue(item.title, recordId, `${field}.title`, 80),
    ...(item.year !== undefined ? { year: stringValue(item.year, recordId, `${field}.year`, 12) } : {}),
    ...(item.description !== undefined ? { description: stringValue(item.description, recordId, `${field}.description`, 240) } : {}),
    src,
    aspect: numberValue(item.aspect, recordId, `${field}.aspect`, .08, 12),
    wall,
    x: numberValue(item.x, recordId, `${field}.x`, -wallWidth / 2, wallWidth / 2),
    y: numberValue(item.y, recordId, `${field}.y`, .2, template.height),
    scale: numberValue(item.scale, recordId, `${field}.scale`, .2, 3),
    ...(item.frame !== undefined
      ? { frame: enumValue(item.frame, ARTWORK_FRAMES, recordId, `${field}.frame`) }
      : {})
  };
}

function parseDecor(value: unknown, index: number, templateId: TemplateId, recordId: string): DecorPlacement {
  const field = `decor[${index}]`;
  const item = recordValue(value, recordId, field);
  const template = getTemplate(templateId);
  return {
    id: stringValue(item.id, recordId, `${field}.id`, 100, 1),
    type: enumValue(item.type, DECOR_IDS, recordId, `${field}.type`),
    x: numberValue(item.x, recordId, `${field}.x`, -template.dimensions[0] / 2, template.dimensions[0] / 2),
    z: numberValue(item.z, recordId, `${field}.z`, -template.dimensions[1] / 2, template.dimensions[1] / 2),
    rotation: numberValue(item.rotation, recordId, `${field}.rotation`, -7, 7),
    scale: numberValue(item.scale, recordId, `${field}.scale`, .2, 3),
    ...(item.potColor !== undefined
      ? { potColor: enumValue(item.potColor, PLANT_POT_FINISHES, recordId, `${field}.potColor`) }
      : {})
  };
}

export function validateGalleryDraft(value: unknown, options: DraftValidationOptions = {}): GalleryDraft {
  const recordId = options.recordId ?? 'draft';
  const data = recordValue(value, recordId, 'gallery');
  const templateId = enumValue(data.templateId, TEMPLATE_IDS, recordId, 'templateId');
  if (!Array.isArray(data.artworks)) invalid(recordId, 'artworks', 'expected a list');
  if (!Array.isArray(data.decor)) invalid(recordId, 'decor', 'expected a list');
  const maximumArtworks = getTemplate(templateId).maxArtworks;
  if (data.artworks.length > maximumArtworks) invalid(recordId, 'artworks', `expected no more than ${maximumArtworks} artworks`);
  if (options.requireArtworkSources && data.artworks.length === 0) invalid(recordId, 'artworks', 'expected at least one artwork');
  if (data.decor.length > MAX_DECOR) invalid(recordId, 'decor', `expected no more than ${MAX_DECOR} objects`);

  const ceiling = data.ceiling === undefined ? 'gallery' : enumValue(data.ceiling, CEILING_FINISHES, recordId, 'ceiling');
  const decor = data.decor.map((item, index) => parseDecor(item, index, templateId, recordId));
  const artworks = data.artworks.map((item, index) => parseArtwork(item, index, templateId, recordId, options.requireArtworkSources ?? false));
  ensureUnique(decor.map((item) => item.id), recordId, 'decor.id');
  ensureUnique(artworks.map((item) => item.id), recordId, 'artworks.id');
  ensureUnique(artworks.map((item) => item.assetId), recordId, 'artworks.assetId');
  return {
    title: stringValue(data.title, recordId, 'title', 100, 1),
    artist: stringValue(data.artist, recordId, 'artist', 100, 1),
    templateId,
    wall: enumValue(data.wall, WALL_FINISHES, recordId, 'wall'),
    floor: enumValue(data.floor, FLOOR_FINISHES, recordId, 'floor'),
    ceiling,
    lighting: enumValue(data.lighting, LIGHTING_PRESETS, recordId, 'lighting'),
    decor,
    artworks
  };
}

/**
 * Creates the immutable visitor-facing payload. Hidden and locked are editor
 * state, so hidden works are omitted and lock state never leaks into public
 * Firestore records. Frame choice remains part of the exhibition design.
 */
export function prepareGalleryDraftForPublication(value: unknown): GalleryDraft {
  const recordId = 'publication draft';
  const data = recordValue(value, recordId, 'gallery');
  if (!Array.isArray(data.artworks)) invalid(recordId, 'artworks', 'expected a list');
  const visibleArtworks = data.artworks.filter(
    (artwork) => !isRecord(artwork) || artwork.hidden !== true
  );
  return validateGalleryDraft(
    { ...data, artworks: visibleArtworks },
    { recordId, requireArtworkSources: true }
  );
}

export function validateGalleryCoverSource(value: unknown, recordId = 'publication draft'): string {
  return imageSource(value, recordId, 'coverSrc', MAX_COVER_SOURCE_LENGTH, false);
}

export function parseGalleryDocument(recordId: string, value: unknown): ParsedGalleryDocument {
  const data = recordValue(value, recordId, 'gallery');
  const schemaVersion = validateSchemaVersion(data.schemaVersion, recordId);
  const draft = validateGalleryDraft(data, { recordId });
  const published = timestampValue(data.publishedAt, recordId, 'publishedAt');
  const expires = timestampValue(data.expiresAt, recordId, 'expiresAt');
  if (expires.getTime() <= published.getTime()) invalid(recordId, 'expiresAt', 'expected expiration after publication');
  const visibility = schemaVersion === 3
    ? enumValue(data.visibility, GALLERY_VISIBILITIES, recordId, 'visibility')
    : 'public';
  const retention = schemaVersion === 3
    ? enumValue(data.retention, GALLERY_RETENTIONS, recordId, 'retention')
    : 'guest-10-days';
  const accessVersion = schemaVersion === 3
    ? integerValue(data.accessVersion, recordId, 'accessVersion', 1, 1)
    : 1;
  const revision = data.revision === undefined
    ? 1
    : integerValue(data.revision, recordId, 'revision', 1, 1_000_000);
  const updated = data.updatedAt === undefined
    ? published
    : timestampValue(data.updatedAt, recordId, 'updatedAt');
  if (updated.getTime() < published.getTime())
    invalid(recordId, 'updatedAt', 'expected a time at or after publication');
  const maximumDuration = retention === 'account-preview' ? 367 : 12;
  if (expires.getTime() - updated.getTime() > maximumDuration * 86_400_000)
    invalid(recordId, 'expiresAt', `expected a maximum ${maximumDuration}-day publication window`);
  if (retention === 'guest-10-days' && visibility !== 'public')
    invalid(recordId, 'visibility', 'guest publications must be public');
  const ownerId = optionalString(data.ownerId, recordId, 'ownerId', 128);
  const coverSrc = optionalImageSource(data.coverSrc, recordId, 'coverSrc', MAX_LEGACY_COVER_SOURCE_LENGTH);
  const coverPath = optionalStoragePath(data.coverPath, recordId, 'coverPath');
  const lifecycleStatus = data.lifecycleStatus === undefined
    ? 'active'
    : enumValue(data.lifecycleStatus, GALLERY_LIFECYCLE_STATUSES, recordId, 'lifecycleStatus');
  const trashedAt = data.trashedAt === undefined
    ? undefined
    : timestampValue(data.trashedAt, recordId, 'trashedAt').toISOString();
  const purgeAt = data.purgeAt === undefined
    ? undefined
    : timestampValue(data.purgeAt, recordId, 'purgeAt').toISOString();
  if (lifecycleStatus === 'trashed' && (!trashedAt || !purgeAt))
    invalid(recordId, 'lifecycleStatus', 'trashed rooms require trash and purge times');
  if (schemaVersion >= 2 && (!coverPath || !ownerId))
    invalid(recordId, 'coverPath', 'expected an owned Storage cover in schema version 2 or 3');
  return {
    ...draft,
    publishedAt: published.toISOString(),
    expiresAt: expires.toISOString(),
    ...(ownerId ? { ownerId } : {}),
    ...(coverSrc ? { coverSrc } : {}),
    ...(coverPath ? { coverPath } : {}),
    visibility,
    retention,
    accessVersion,
    revision,
    updatedAt: updated.toISOString(),
    lifecycleStatus,
    ...(trashedAt ? { trashedAt } : {}),
    ...(purgeAt ? { purgeAt } : {}),
  };
}

export function parseArtworkAsset(
  assetId: string,
  value: unknown,
  expected: { galleryId: string; ownerId?: string; index: number; expiresAt: string }
): ParsedArtworkAsset {
  const data = recordValue(value, assetId, 'asset');
  if (validateSchemaVersion(data.schemaVersion, assetId) !== 1)
    invalid(assetId, 'schemaVersion', 'expected legacy artwork schema version 1');
  const galleryId = stringValue(data.galleryId, assetId, 'galleryId', 100, 1);
  const ownerId = stringValue(data.ownerId, assetId, 'ownerId', 128, 1);
  const index = integerValue(data.index, assetId, 'index', 0, 13);
  if (galleryId !== expected.galleryId) invalid(assetId, 'galleryId', 'does not match the gallery document');
  if (expected.ownerId && ownerId !== expected.ownerId) invalid(assetId, 'ownerId', 'does not match the gallery owner');
  if (index !== expected.index) invalid(assetId, 'index', 'does not match the artwork position');
  const published = timestampValue(data.publishedAt, assetId, 'publishedAt');
  const expires = timestampValue(data.expiresAt, assetId, 'expiresAt');
  if (expires.getTime() <= published.getTime()) invalid(assetId, 'expiresAt', 'expected expiration after publication');
  if (Math.abs(expires.getTime() - new Date(expected.expiresAt).getTime()) > 1_000) invalid(assetId, 'expiresAt', 'does not match the gallery expiration');
  return {
    src: imageSource(data.src, assetId, 'src', MAX_ARTWORK_SOURCE_LENGTH, false),
    publishedAt: published.toISOString(),
    expiresAt: expires.toISOString()
  };
}
