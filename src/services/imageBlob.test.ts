import { describe, expect, it } from "vitest";
import { normalizedImageBlob } from "./imageBlob";

describe("normalizedImageBlob", () => {
  it("keeps a supported declared image type", async () => {
    const result = await normalizedImageBlob(
      new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
    );
    expect(result.contentType).toBe("image/png");
  });

  it("recovers JPEG images stored as generic binary data", async () => {
    const result = await normalizedImageBlob(
      new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])], {
        type: "application/octet-stream",
      }),
    );
    expect(result.contentType).toBe("image/jpeg");
    expect(result.blob.type).toBe("image/jpeg");
  });

  it("rejects content that is not a supported image", async () => {
    await expect(normalizedImageBlob(new Blob(["not an image"]))).rejects.toThrow(
      "unsupported format",
    );
  });
});
