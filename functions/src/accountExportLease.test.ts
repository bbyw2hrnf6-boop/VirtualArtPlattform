import { describe, expect, it } from "vitest";
import {
  ACCOUNT_EXPORT_CALLABLE_TIMEOUT_SECONDS,
  ACCOUNT_EXPORT_LEASE_MILLISECONDS,
  claimAccountExportLease,
  ownsAccountExportLease,
} from "./accountExportLease.js";

const now = 1_800_000_000_000;
const base = {
  id: "a".repeat(32),
  jobId: "job_0123456789abcdef012345",
  revision: 7,
  nowEpochMilliseconds: now,
};

describe("account export work lease", () => {
  it("outlives the callable deadline so one slow query cannot admit a second worker", () => {
    expect(ACCOUNT_EXPORT_LEASE_MILLISECONDS)
      .toBeGreaterThan(ACCOUNT_EXPORT_CALLABLE_TIMEOUT_SECONDS * 1_000);
  });

  it("admits one worker and bounds parallel amplification", () => {
    const first = claimAccountExportLease({ ...base, current: undefined });
    expect(first.acquired).toBe(true);
    if (!first.acquired) throw new Error("lease missing");
    const second = claimAccountExportLease({ ...base, id: "b".repeat(32), current: first.lease });
    expect(second).toEqual({
      acquired: false,
      retryAfterMilliseconds: ACCOUNT_EXPORT_LEASE_MILLISECONDS,
    });
    expect(ownsAccountExportLease(first.lease, base)).toBe(true);
    expect(ownsAccountExportLease(first.lease, { ...base, id: "b".repeat(32) })).toBe(false);
    expect(claimAccountExportLease({ ...base, current: first.lease })).toEqual(first);
  });

  it("allows bounded takeover after expiry or a new checkpoint revision", () => {
    const first = claimAccountExportLease({ ...base, current: undefined });
    if (!first.acquired) throw new Error("lease missing");
    expect(claimAccountExportLease({
      ...base,
      id: "b".repeat(32),
      current: first.lease,
      nowEpochMilliseconds: now + ACCOUNT_EXPORT_LEASE_MILLISECONDS,
    }).acquired).toBe(true);
    expect(claimAccountExportLease({
      ...base,
      id: "c".repeat(32),
      current: first.lease,
      revision: base.revision + 1,
    }).acquired).toBe(true);
  });

  it("rejects caller-shaped lease identifiers", () => {
    expect(() => claimAccountExportLease({ ...base, id: "../../forged", current: undefined }))
      .toThrow("export-lease-invalid");
  });
});
