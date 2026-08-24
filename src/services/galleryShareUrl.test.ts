import { describe, expect, it } from "vitest";
import { galleryShareUrl } from "./galleryShareUrl";

describe("galleryShareUrl", () => {
  it("uses the canonical LIEUVA origin outside local development", () => {
    expect(
      galleryShareUrl(
        "room-123",
        "https://example.github.io/VirtualArtPlattform/#/create/nocturne/demo",
      ),
    ).toBe("https://lieuva.com/spaces/room-123");
  });

  it("uses a clean same-origin URL during local development", () => {
    expect(
      galleryShareUrl(
        "room-123",
        "http://localhost:5173/?preview=true#/create/white-cube",
      ),
    ).toBe("http://localhost:5173/spaces/room-123");
  });
});
