import { describe, expect, it } from "vitest";
import {
  GALLERY_INSPECTION_LEASE_MS,
  claimGalleryInspectionLease,
  ownsGalleryInspectionLease,
  releasableGalleryInspectionLease,
} from "./galleryInspectionLease.js";

const id = "inspection_0123456789abcdef";

describe("gallery inspection leases", () => {
  it("issues a bounded lease and treats the same invocation idempotently", () => {
    const first = claimGalleryInspectionLease({}, id, 1_000_000);
    expect(first).toEqual({
      inspectionAttempts: 1,
      inspectionId: id,
      inspectionLeaseUntil: new Date(1_000_000 + GALLERY_INSPECTION_LEASE_MS),
      inspectionStartedAt: new Date(1_000_000),
    });
    expect(claimGalleryInspectionLease(first, id, 1_000_500)).toEqual(first);
    expect(ownsGalleryInspectionLease(first, id, 1_000_500)).toBe(true);
    expect(releasableGalleryInspectionLease(first, id)).toBe(true);
  });

  it("blocks concurrent work, backs off retries, then permits takeover", () => {
    const first = claimGalleryInspectionLease({}, id, 1_000_000);
    expect(() => claimGalleryInspectionLease(first, "inspection_abcdef0123456789", 1_001_000))
      .toThrow("inspection-busy");
    const expired = { ...first, inspectionLeaseUntil: new Date(1_000_001) };
    expect(() => claimGalleryInspectionLease(expired, "inspection_abcdef0123456789", 1_003_000))
      .toThrow("inspection-backoff");
    expect(claimGalleryInspectionLease(expired, "inspection_abcdef0123456789", 1_006_000).inspectionAttempts)
      .toBe(2);
  });

  it("does not inspect while a server-owned asset upload lease is active", () => {
    expect(() => claimGalleryInspectionLease({
      assetUploadId: "asset-upload-abcdefghijklmnop",
      assetUploadLeaseUntil: new Date(1_100_000),
    }, id, 1_000_000)).toThrow("inspection-busy");
    expect(claimGalleryInspectionLease({
      assetUploadId: "asset-upload-abcdefghijklmnop",
      assetUploadLeaseUntil: new Date(999_999),
    }, id, 1_000_000).inspectionAttempts).toBe(1);
  });

  it("caps repeated expensive attempts and fails malformed state closed", () => {
    expect(() => claimGalleryInspectionLease({ inspectionAttempts: 5 }, id, 1_000_000))
      .toThrow("inspection-attempt-limit");
    expect(() => claimGalleryInspectionLease({ inspectionAttempts: -1 }, id, 1_000_000))
      .toThrow("inspection-state-invalid");
    expect(() => claimGalleryInspectionLease({}, "short", 1_000_000))
      .toThrow("inspection-state-invalid");
  });
});
