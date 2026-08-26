import { describe, expect, it } from "vitest";
import { publicAssetUrl } from "./publicAssetUrl";

describe("publicAssetUrl", () => {
  it("resolves bundled assets from a clean Space route at the app root", () => {
    expect(
      publicAssetUrl(
        "./assets/materials/stone.webp",
        "https://lieuva.com/spaces/space-123",
      ),
    ).toBe("https://lieuva.com/assets/materials/stone.webp");
  });

  it("retains the repository base for the legacy Pages fallback", () => {
    expect(
      publicAssetUrl(
        "./assets/demo/room.glb",
        "https://example.github.io/VirtualArtPlattform/spaces/space-123",
      ),
    ).toBe("https://example.github.io/VirtualArtPlattform/assets/demo/room.glb");
  });

  it("does not rewrite Storage, blob, or data sources", () => {
    for (const source of [
      "https://firebasestorage.googleapis.com/v0/b/example",
      "blob:https://lieuva.com/example",
      "data:image/webp;base64,abc",
    ]) {
      expect(publicAssetUrl(source, "https://lieuva.com/spaces/x")).toBe(source);
    }
  });
});
