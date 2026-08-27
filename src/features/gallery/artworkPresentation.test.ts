import { describe, expect, it } from "vitest";
import { artworkPresentationMetrics } from "./artworkPresentation";

describe("artwork presentation metrics", () => {
  it("preserves the uploaded image aspect without cropping", () => {
    const metrics = artworkPresentationMetrics({
      aspect: 1.6,
      scale: 1,
      frame: "black",
      mat: "none",
    });
    expect(metrics.imageWidth / metrics.imageHeight).toBeCloseTo(1.6, 8);
  });

  it("adds an adaptive mat outside the image surface", () => {
    const bare = artworkPresentationMetrics({
      aspect: 0.75,
      scale: 0.8,
      frame: "black",
      mat: "none",
    });
    const mounted = artworkPresentationMetrics({
      aspect: 0.75,
      scale: 0.8,
      frame: "black",
      mat: "warm-white",
    });
    expect(mounted.imageWidth).toBe(bare.imageWidth);
    expect(mounted.imageHeight).toBe(bare.imageHeight);
    expect(mounted.outerWidth).toBeGreaterThan(bare.outerWidth);
    expect(mounted.outerHeight).toBeGreaterThan(bare.outerHeight);
  });

  it("gives wood frames physical depth and keeps frameless mounts thin", () => {
    const wood = artworkPresentationMetrics({
      aspect: 1,
      scale: 1,
      frame: "dark-wood",
      mat: "none",
    });
    const frameless = artworkPresentationMetrics({
      aspect: 1,
      scale: 1,
      frame: "none",
      mat: "none",
    });
    expect(wood.frameBorder).toBeGreaterThan(frameless.frameBorder);
    expect(wood.depth).toBeGreaterThan(frameless.depth);
  });
});
