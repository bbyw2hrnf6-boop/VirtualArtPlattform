import { describe, expect, it } from "vitest";
import { premiumQualityForTier } from "./premiumQuality";

describe("premium 3D quality profile", () => {
  it("keeps artwork filtering ahead of surface filtering at every tier", () => {
    (["low", "balanced", "high"] as const).forEach((tier) => {
      const profile = premiumQualityForTier(tier);
      expect(profile.artworkAnisotropy).toBeGreaterThanOrEqual(profile.surfaceAnisotropy);
    });
  });

  it("reserves the largest reflection probe and texture filtering for capable devices", () => {
    expect(premiumQualityForTier("low")).toMatchObject({
      artworkAnisotropy: 8,
      reflectionProbeSize: 64,
    });
    expect(premiumQualityForTier("high")).toMatchObject({
      artworkAnisotropy: 16,
      reflectionProbeSize: 256,
    });
  });
});
