import { describe, expect, it } from "vitest";
import { firebaseActionErrorMessage } from "./firebaseActionError";

describe("firebaseActionErrorMessage", () => {
  it("does not expose the opaque callable internal error", () => {
    expect(firebaseActionErrorMessage(
      { code: "functions/internal", message: "internal" },
      "Fallback",
    )).toMatch(/temporarily unavailable/i);
  });

  it("keeps actionable precondition messages", () => {
    expect(firebaseActionErrorMessage(
      { code: "functions/failed-precondition", message: "Restore this room first." },
      "Fallback",
    )).toBe("Restore this room first.");
  });
});
