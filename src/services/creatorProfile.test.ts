import { describe, expect, it } from "vitest";
import { creatorProfileSaveLabel, creatorProfileUrl } from "./creatorProfile";

describe("Creator profile URLs", () => {
  it("uses the canonical clean public route", () => {
    expect(creatorProfileUrl("studio-north")).toBe("https://lieuva.com/creators/studio-north");
  });
});

describe("Creator profile lifecycle labels", () => {
  it.each([
    [false, false, "Save private draft"],
    [false, true, "Save and publish profile"],
    [true, true, "Save profile changes"],
    [true, false, "Save and make private"],
  ])("distinguishes persisted and edited visibility", (published, nextPublic, label) => {
    expect(creatorProfileSaveLabel(published, nextPublic)).toBe(label);
  });
});
