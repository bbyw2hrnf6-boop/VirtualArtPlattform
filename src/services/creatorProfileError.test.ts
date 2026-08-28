import { describe, expect, it } from "vitest";
import {
  creatorActionErrorMessage,
  isTransientCreatorActionError,
} from "./creatorProfile";

describe("Creator Hub action errors", () => {
  it.each([
    "functions/internal",
    "functions/unavailable",
    "functions/deadline-exceeded",
    "functions/network-request-failed",
  ])("classifies %s as safely retryable", (code) => {
    expect(isTransientCreatorActionError({ code })).toBe(true);
  });

  it("never exposes the opaque callable internal message", () => {
    expect(creatorActionErrorMessage({ code: "functions/internal", message: "internal" }))
      .toBe("The Creator Hub is temporarily unavailable. Nothing was changed; retry shortly.");
  });

  it("keeps actionable account guidance", () => {
    expect(creatorActionErrorMessage({ code: "functions/unauthenticated" }))
      .toContain("Sign in again");
    expect(creatorActionErrorMessage({ code: "functions/already-exists" }))
      .toContain("already taken");
  });
});
