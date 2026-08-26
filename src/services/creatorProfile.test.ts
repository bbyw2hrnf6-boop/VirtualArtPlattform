import { describe, expect, it } from "vitest";
import { creatorProfileUrl } from "./creatorProfile";

describe("Creator profile URLs", () => {
  it("uses the canonical clean public route", () => {
    expect(creatorProfileUrl("studio-north")).toBe("https://lieuva.com/creators/studio-north");
  });
});
