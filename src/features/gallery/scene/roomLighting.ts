import type { LightingPreset, TemplateId } from "../types";
import type { RenderQuality } from "./runtimeQuality";

type QualityTier = RenderQuality["tier"];

export type RoomLightingProfile = {
  ambient: number;
  hemi: number;
  key: number;
  spot: number;
  bounce: number;
  color: string;
  toneMappingExposure: number;
  environmentIntensity: number;
};

const PRESET_LIGHTS: Record<
  LightingPreset,
  Pick<RoomLightingProfile, "ambient" | "hemi" | "key" | "spot" | "bounce" | "color">
> = {
  daylight: {
    hemi: 0.65,
    ambient: 0.22,
    key: 3.15,
    spot: 46,
    bounce: 2.4,
    color: "#fff8e9",
  },
  museum: {
    hemi: 0.44,
    ambient: 0.18,
    key: 2.7,
    spot: 72,
    bounce: 1.65,
    color: "#ffe6bd",
  },
  evening: {
    hemi: 0.32,
    ambient: 0.14,
    key: 2.25,
    spot: 64,
    bounce: 1.2,
    color: "#ffc987",
  },
};

const TEMPLATE_LIGHTS: Record<
  TemplateId,
  {
    ambient: number;
    hemi: number;
    key: number;
    spot: number;
    bounce: number;
    toneMappingExposure: number;
    environmentIntensity: Record<QualityTier, number>;
  }
> = {
  "white-cube": {
    ambient: 1.48,
    hemi: 1.18,
    key: 1.12,
    spot: 1,
    bounce: 1.16,
    toneMappingExposure: 0.98,
    environmentIntensity: { low: 0.74, balanced: 0.82, high: 0.88 },
  },
  nocturne: {
    ambient: 1.6,
    hemi: 1.05,
    key: 0.78,
    spot: 1.18,
    bounce: 0.72,
    toneMappingExposure: 0.94,
    environmentIntensity: { low: 0.68, balanced: 0.74, high: 0.78 },
  },
  pavilion: {
    ambient: 3.6,
    hemi: 1.9,
    key: 0.96,
    spot: 1,
    bounce: 0.72,
    toneMappingExposure: 0.98,
    environmentIntensity: { low: 0.75, balanced: 0.82, high: 0.86 },
  },
};

/**
 * One shared calibration for Studio Walk Preview and the published Viewer.
 * Fill light remains room-owned and neutral so closed ceilings and dark floor
 * finishes cannot crush visitor-visible surfaces while artwork spots stay
 * independent and preserve their authored contrast.
 */
export function roomLightingProfile(
  templateId: TemplateId,
  lighting: LightingPreset,
  qualityTier: QualityTier,
): RoomLightingProfile {
  const preset = PRESET_LIGHTS[lighting];
  const template = TEMPLATE_LIGHTS[templateId];
  return {
    ambient: preset.ambient * template.ambient,
    hemi: preset.hemi * template.hemi,
    key: preset.key * template.key,
    spot: preset.spot * template.spot,
    bounce: preset.bounce * template.bounce,
    color: preset.color,
    toneMappingExposure: template.toneMappingExposure,
    environmentIntensity: template.environmentIntensity[qualityTier],
  };
}
