import { describe, expect, it } from "vitest";
import { discoverCoverSource } from "./galleryRepository";

describe("discoverCoverSource", () => {
  it("keeps a legacy embedded cover", () => {
    expect(discoverCoverSource({ id: "legacy-space", coverSrc: "data:image/webp;base64,abc" }))
      .toBe("data:image/webp;base64,abc");
  });

  it("routes modern Storage covers through the public cover proxy", () => {
    expect(discoverCoverSource({
      id: "field studies",
      coverPath: "published/owner/field-studies/cover.webp",
    })).toBe("/space-cards/field%20studies");
  });

  it("leaves Spaces without a cover on the designed fallback", () => {
    expect(discoverCoverSource({ id: "no-cover" })).toBeUndefined();
  });
});
