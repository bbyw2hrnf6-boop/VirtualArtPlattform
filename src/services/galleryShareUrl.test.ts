import { describe, expect, it } from "vitest";
import { galleryShareUrl } from "./galleryShareUrl";

describe("galleryShareUrl", () => {
  it("keeps the deployed GitHub Pages base path", () => {
    expect(
      galleryShareUrl(
        "room-123",
        "https://example.github.io/VirtualArtPlattform/#/create/nocturne/demo",
      ),
    ).toBe("https://example.github.io/VirtualArtPlattform/#/g/room-123");
  });

  it("removes temporary query parameters and safely encodes the id", () => {
    expect(
      galleryShareUrl(
        "room / 123",
        "http://localhost:5173/?preview=true#/create/white-cube",
      ),
    ).toBe("http://localhost:5173/#/g/room%20%2F%20123");
  });
});
