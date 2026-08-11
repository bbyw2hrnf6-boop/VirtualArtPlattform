import { describe, expect, it } from "vitest";
import { publishStatusReducer, type PublishStatus } from "./publishState";

const transition = (status: PublishStatus, type: "PREPARE" | "WRITE" | "SUCCEED" | "FAIL" | "RESET") =>
  publishStatusReducer(status, { type });

describe("publishStatusReducer", () => {
  it("follows the successful publish path", () => {
    expect(transition("idle", "PREPARE")).toBe("preparing");
    expect(transition("preparing", "WRITE")).toBe("publishing");
    expect(transition("publishing", "SUCCEED")).toBe("published");
  });

  it("keeps invalid transitions from creating contradictory state", () => {
    expect(transition("idle", "SUCCEED")).toBe("idle");
    expect(transition("preparing", "SUCCEED")).toBe("preparing");
    expect(transition("published", "FAIL")).toBe("published");
  });

  it("supports retry after capture or Firebase errors", () => {
    expect(transition("preparing", "FAIL")).toBe("error");
    expect(transition("publishing", "FAIL")).toBe("error");
    expect(transition("error", "PREPARE")).toBe("preparing");
  });

  it("resets only from stable, non-writing states", () => {
    expect(transition("error", "RESET")).toBe("idle");
    expect(transition("published", "RESET")).toBe("idle");
    expect(transition("publishing", "RESET")).toBe("publishing");
  });
});
