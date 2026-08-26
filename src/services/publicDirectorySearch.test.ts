import { describe, expect, it } from "vitest";
import type { GalleryRecord } from "./galleryRepository";
import type { PublicCreatorDirectoryEntry } from "./creatorProfile";
import { searchPublicDirectory } from "./publicDirectorySearch";

const spaces = [
  { id: "s1", title: "Material Futures", artist: "Studio North" },
  { id: "s2", title: "Über Räume", artist: "Lina" },
] as GalleryRecord[];
const creators: PublicCreatorDirectoryEntry[] = [
  { handle: "studio-north", displayName: "Studio North", bio: "Material studies", imagePresent: false },
  { handle: "lina", displayName: "Lina", bio: "Spatial artist", imagePresent: true },
];

describe("public Space and Creator search", () => {
  it("matches Space titles and Creator identities", () => {
    expect(searchPublicDirectory(spaces, creators, "material").spaces.map(({ id }) => id)).toEqual(["s1"]);
    expect(searchPublicDirectory(spaces, creators, "studio-north").creators.map(({ handle }) => handle)).toEqual(["studio-north"]);
  });

  it("is case and accent insensitive and keeps Creator results hidden before search", () => {
    expect(searchPublicDirectory(spaces, creators, "uber").spaces.map(({ id }) => id)).toEqual(["s2"]);
    expect(searchPublicDirectory(spaces, creators, "").creators).toEqual([]);
  });
});
