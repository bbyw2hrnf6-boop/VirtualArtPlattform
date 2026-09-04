import { describe, expect, it } from "vitest";
import {
  creatorActionRateId,
  creatorNotificationAggregateId,
  nextCreatorActionRate,
} from "./notificationPolicy.js";

describe("Creator abuse and notification policy", () => {
  it("applies bounded fixed windows and resets them deterministically", () => {
    let state: { count?: unknown; windowStartedAtMs?: unknown } | undefined;
    for (let count = 1; count <= 20; count += 1) {
      const result = nextCreatorActionRate("follow", 1_000 + count, state);
      expect(result.allowed).toBe(true);
      state = result;
    }
    const blocked = nextCreatorActionRate("follow", 2_000, state);
    expect(blocked).toMatchObject({ allowed: false, count: 21, maximum: 20 });
    expect(nextCreatorActionRate("follow", 1_001 + 60 * 60_000, state))
      .toMatchObject({ allowed: true, count: 1 });
  });

  it("fails safely when persisted counters are malformed or clocks move backward", () => {
    expect(nextCreatorActionRate("report", 5_000, {
      count: -100,
      windowStartedAtMs: "bad",
    })).toMatchObject({ allowed: true, count: 1, windowStartedAtMs: 5_000 });
    expect(nextCreatorActionRate("comment", 4_000, {
      count: 20,
      windowStartedAtMs: 5_000,
    })).toMatchObject({ allowed: true, count: 1, windowStartedAtMs: 4_000 });
  });

  it("uses deterministic private IDs and rotates notification buckets", () => {
    expect(creatorActionRateId("actor-1", "reaction")).toHaveLength(64);
    expect(creatorActionRateId("account:firebase-uid", "report")).toHaveLength(64);
    const first = creatorNotificationAggregateId({
      kind: "reaction",
      actorCreatorId: "actor-1",
      targetCreatorId: "target-1",
      resourceId: "post-1",
      now: 1_000,
    });
    expect(first).toBe(creatorNotificationAggregateId({
      kind: "reaction",
      actorCreatorId: "actor-1",
      targetCreatorId: "target-1",
      resourceId: "post-1",
      now: 3_000,
    }));
    expect(first).not.toBe(creatorNotificationAggregateId({
      kind: "reaction",
      actorCreatorId: "actor-1",
      targetCreatorId: "target-1",
      resourceId: "post-1",
      now: 60 * 60_000,
    }));
  });

  it("rejects runtime-invalid kinds and identifiers and saturates corrupt large counters", () => {
    expect(() => creatorActionRateId(null as never, "reaction")).toThrow(/principal/);
    expect(() => creatorActionRateId("actor-1", "unknown" as never)).toThrow(/action kind/);
    expect(() => creatorNotificationAggregateId({
      kind: "unknown" as never,
      actorCreatorId: "actor-1",
      targetCreatorId: "target-1",
      now: 1_000,
    })).toThrow(/notification kind/);
    expect(() => creatorNotificationAggregateId({
      kind: "comment",
      actorCreatorId: "actor-1",
      targetCreatorId: "target-1",
      resourceId: "",
      now: 1_000,
    })).toThrow(/resource ID/);
    expect(nextCreatorActionRate("reaction", 2_000, {
      count: Number.MAX_SAFE_INTEGER,
      windowStartedAtMs: 1_000,
    })).toMatchObject({ allowed: false, count: Number.MAX_SAFE_INTEGER });
  });
});
