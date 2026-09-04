import { describe, expect, it, vi } from "vitest";
import { continueAccountDeletion } from "./accountDeletionClient";

describe("account deletion client", () => {
  it("continues a resumable job until the completion tombstone is observed", async () => {
    const responses = [
      { status: "running" as const, phase: "owned-galleries" },
      { status: "running" as const, phase: "creator-comments", retryAfterMs: 500 },
      { status: "complete" as const, summary: { ownedSpacesDeleted: 5_201 } },
    ];
    const delay = vi.fn(async () => undefined);
    const summary = await continueAccountDeletion(async () => responses.shift()!, delay);
    expect(summary).toEqual({ ownedSpacesDeleted: 5_201 });
    expect(delay).toHaveBeenNthCalledWith(1, 75);
    expect(delay).toHaveBeenNthCalledWith(2, 500);
  });

  it("accepts the previous one-shot response during a staged rollout", async () => {
    await expect(continueAccountDeletion(async () => ({
      status: "deleted",
      summary: { authenticationDeleted: true },
    }))).resolves.toEqual({ authenticationDeleted: true });
  });

  it("bounds server-directed retry delays", async () => {
    const delay = vi.fn(async () => undefined);
    let calls = 0;
    await continueAccountDeletion(async () => {
      calls += 1;
      return calls === 1
        ? { status: "running", retryAfterMs: 999_999 }
        : { status: "complete" };
    }, delay);
    expect(delay).toHaveBeenCalledWith(2_000);
  });
});
