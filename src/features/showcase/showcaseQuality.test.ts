import { describe, expect, it } from 'vitest';
import { createShowcaseQuality } from './showcaseQuality';

function calibrated(full = true) {
  const policy = createShowcaseQuality();
  policy.sample(0, 400, 200, 16);
  policy.sample(16, 20, 1, 16);
  policy.sample(32, full ? 20 : 200, full ? 1 : 100, 16);
  return policy;
}

describe('showcase raster quality', () => {
  it('excludes first-draw preparation and calibrates before declaring readiness', () => {
    const policy = createShowcaseQuality();
    expect(policy.warming()).toBe(true);
    expect(policy.sample(0, 800, 800, 16)).toBeUndefined();
    expect(policy.sample(16, 20, 1, 16)).toBeUndefined();
    expect(policy.warming()).toBe(true);
    expect(policy.sample(32, 20, 1, 16)).toBe(true);
    expect(policy.warming()).toBe(false);
  });

  it('ignores an isolated stall and downgrades after sustained slow draws', () => {
    const policy = calibrated();
    expect(policy.sample(200, 180, 120, 16)).toBeUndefined();
    expect(policy.sample(216, 20, 1, 16)).toBeUndefined();
    expect(policy.sample(400, 180, 120, 16)).toBeUndefined();
    expect(policy.full()).toBe(true);
    expect(policy.sample(600, 180, 120, 16)).toBe(false);
  });

  it('recovers from transient overload only after cooldown and a sustained fast run', () => {
    const policy = calibrated(false);
    for (let t = 48; t < 5000; t += 16) expect(policy.sample(t, 20, 1, 16)).toBeUndefined();
    expect(policy.full()).toBe(false);
    for (let t = 11_000; t < 11_752; t += 16) expect(policy.sample(t, 20, 1, 16)).toBeUndefined();
    expect(policy.sample(11_752, 20, 1, 16)).toBe(true);
    expect(policy.full()).toBe(true);
  });

  it('requires draw-cost headroom for the larger canvas and reflection', () => {
    const policy = calibrated(false);
    for (let t = 11_000; t < 13_000; t += 16) policy.sample(t, 25, 6, 16);
    expect(policy.full()).toBe(false);
    for (let t = 13_000; t <= 13_768; t += 16) policy.sample(t, 20, 1, 16);
    expect(policy.full()).toBe(true);
  });

  it('does not count idle gaps or isolated input events as fast-render recovery', () => {
    const policy = calibrated(false);
    for (let t = 11_000; t < 11_700; t += 16) policy.sample(t, 20, 1, 16);
    expect(policy.full()).toBe(false);
    for (let t = 20_000; t < 40_000; t += 1000) policy.sample(t, 20, 1, 16);
    expect(policy.full()).toBe(false);
    expect(policy.warming()).toBe(false);
  });
});
