import { describe, expect, it } from "vitest";
import { roomLightingProfile } from "./roomLighting";

describe("roomLightingProfile", () => {
  it("keeps the Forum museum preset readable on the low tier", () => {
    const profile = roomLightingProfile("pavilion", "museum", "low");

    expect(profile.ambient).toBeGreaterThanOrEqual(0.64);
    expect(profile.ambient).toBeLessThan(0.8);
    expect(profile.hemi).toBeGreaterThanOrEqual(0.83);
    expect(profile.hemi).toBeLessThan(1);
    expect(profile.environmentIntensity).toBeGreaterThanOrEqual(0.75);
    expect(profile.toneMappingExposure).toBeGreaterThanOrEqual(0.98);
  });

  it("keeps evening atmospheric without crushing neutral fill", () => {
    const nocturne = roomLightingProfile("nocturne", "evening", "low");
    const pavilion = roomLightingProfile("pavilion", "evening", "low");

    expect(nocturne.ambient).toBeGreaterThanOrEqual(0.1);
    expect(nocturne.hemi).toBeGreaterThanOrEqual(0.21);
    expect(pavilion.ambient).toBeGreaterThan(nocturne.ambient);
    expect(pavilion.hemi).toBeGreaterThan(nocturne.hemi);
  });

  it("does not reduce environment light on stronger render tiers", () => {
    for (const template of ["white-cube", "nocturne", "pavilion"] as const) {
      const low = roomLightingProfile(template, "museum", "low");
      const balanced = roomLightingProfile(template, "museum", "balanced");
      const high = roomLightingProfile(template, "museum", "high");

      expect(balanced.environmentIntensity).toBeGreaterThanOrEqual(
        low.environmentIntensity,
      );
      expect(high.environmentIntensity).toBeGreaterThanOrEqual(
        balanced.environmentIntensity,
      );
    }
  });
});
