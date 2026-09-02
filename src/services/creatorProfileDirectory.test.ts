import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPublicCreatorDirectory } from "./creatorProfile";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public Creator directory data boundary", () => {
  it("returns only creators supplied by the live public directory", async () => {
    const creators = [{
      handle: "studio-north",
      displayName: "Studio North",
      bio: "Material studies.",
      imagePresent: false,
      followerCount: 3,
    }];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ schemaVersion: 1, creators }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadPublicCreatorDirectory()).resolves.toEqual({ schemaVersion: 1, creators });
    expect(fetchMock).toHaveBeenCalledWith("/creator-directory.json", {
      headers: { Accept: "application/json" },
      signal: undefined,
    });
  });

  it("reports a live-directory outage instead of substituting editorial fixtures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await expect(loadPublicCreatorDirectory()).rejects.toThrow(
      "Creator search is temporarily unavailable.",
    );
  });
});
