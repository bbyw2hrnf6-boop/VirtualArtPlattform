import { describe, expect, it } from "vitest";
import legacyFallbackSource from "../../public/404.html?raw";
import {
  applicationRootUrl,
  canonicalHostRedirectUrl,
  matchSpaceRoute,
  spaceCanonicalUrl,
  spacePath,
} from "./spaceRoutes";

describe("Space route contract", () => {
  it("builds the durable production canonical from the existing publication ID", () => {
    expect(spaceCanonicalUrl("threshold-a1b2c3d4e5f60708")).toBe(
      "https://lieuva.com/spaces/threshold-a1b2c3d4e5f60708",
    );
  });

  it("keeps clean routes on the local origin during development", () => {
    expect(spaceCanonicalUrl("room-123", "http://localhost:5173/#/g/room-123")).toBe(
      "http://localhost:5173/spaces/room-123",
    );
  });

  it("moves Firebase default-host sessions to the canonical production origin", () => {
    expect(
      canonicalHostRedirectUrl(
        "https://virtualartplattform.web.app/#/account",
      ),
    ).toBe("https://lieuva.com/#/account");
    expect(
      canonicalHostRedirectUrl(
        "https://virtualartplattform.firebaseapp.com/spaces/room-123?preview=1#details",
      ),
    ).toBe("https://lieuva.com/spaces/room-123?preview=1#details");
  });

  it("does not redirect the canonical or local development origins", () => {
    expect(canonicalHostRedirectUrl("https://lieuva.com/#/account")).toBeNull();
    expect(canonicalHostRedirectUrl("http://localhost:5173/#/account")).toBeNull();
  });

  it("matches direct and refreshed clean Space routes", () => {
    expect(matchSpaceRoute("/spaces/room-123", "")).toEqual({
      kind: "space",
      id: "room-123",
      legacy: false,
    });
    expect(matchSpaceRoute("/spaces/room-123/", "")).toEqual({
      kind: "space",
      id: "room-123",
      legacy: false,
    });
  });

  it("resolves a legacy hash to the same publication ID", () => {
    expect(matchSpaceRoute("/", "#/g/room-123")).toEqual({
      kind: "space",
      id: "room-123",
      legacy: true,
    });
  });

  it("rejects malformed, nested and undecodable identifiers", () => {
    expect(matchSpaceRoute("/spaces/room/extra", "")).toEqual({ kind: "malformed" });
    expect(matchSpaceRoute("/spaces/%E0%A4%A", "")).toEqual({ kind: "malformed" });
    expect(() => spacePath("room / 123")).toThrow("Invalid Space ID");
  });

  it("preserves the legacy GitHub project root for non-Space hash navigation", () => {
    expect(
      applicationRootUrl("https://example.github.io/VirtualArtPlattform/spaces/room-123"),
    ).toBe("https://example.github.io/VirtualArtPlattform/");
  });

  it("keeps a noindex GitHub Pages fallback for clean Space links during rollback", () => {
    expect(legacyFallbackSource).toContain('content="noindex,nofollow"');
    expect(legacyFallbackSource).toContain("#/g/");
    expect(legacyFallbackSource).toContain("?legacy=1");
  });
});
