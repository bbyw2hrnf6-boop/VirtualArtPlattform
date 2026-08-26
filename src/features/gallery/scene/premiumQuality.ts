import type { RenderQuality } from "./runtimeQuality";

type QualityTier = RenderQuality["tier"];

export type PremiumQualityProfile = {
  artworkAnisotropy: number;
  reflectionProbeSize: 64 | 128 | 256;
  surfaceAnisotropy: number;
};

const PROFILES: Record<QualityTier, PremiumQualityProfile> = {
  low: {
    artworkAnisotropy: 8,
    reflectionProbeSize: 64,
    surfaceAnisotropy: 4,
  },
  balanced: {
    artworkAnisotropy: 12,
    reflectionProbeSize: 128,
    surfaceAnisotropy: 8,
  },
  high: {
    artworkAnisotropy: 16,
    reflectionProbeSize: 256,
    surfaceAnisotropy: 12,
  },
};

/**
 * Visual features follow the existing adaptive tier instead of maintaining a
 * second quality switch. The expensive room probe grows only on high-end
 * desktop, while artwork filtering stays deliberately stronger than surfaces.
 */
export function premiumQualityForTier(tier: QualityTier): PremiumQualityProfile {
  return PROFILES[tier];
}
