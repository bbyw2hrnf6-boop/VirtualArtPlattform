import { describe, expect, it } from "vitest";
import profileSource from "./CreatorProfilePage.tsx?raw";

describe("public Creator profile visual contract", () => {
  it("keeps the public portfolio ahead of community notes", () => {
    const portfolio = profileSource.indexOf('className="creator-profile__portfolio"');
    const notes = profileSource.indexOf('className="creator-profile__posts"');

    expect(portfolio).toBeGreaterThan(-1);
    expect(notes).toBeGreaterThan(portfolio);
  });

  it("builds the feature and portfolio from real public Space data", () => {
    expect(profileSource).toContain("const featuredSpace = spaces[0]");
    expect(profileSource).toContain("featuredSpace.coverUrl");
    expect(profileSource).toContain("spaces.map((space, index)");
    expect(profileSource).toContain("spaceCanonicalUrl(featuredSpace.id)");
  });

  it("preserves public sharing, following and Hub navigation", () => {
    expect(profileSource).toContain("<SpaceShareMenu");
    expect(profileSource).toContain("manageCreatorFollow(profile.handle");
    expect(profileSource).toContain('href="/creators"');
    expect(profileSource).toContain('aria-pressed={Boolean(followState?.following)}');
  });
});
