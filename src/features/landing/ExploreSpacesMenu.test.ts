import { describe, expect, it } from "vitest";
import appSource from "../../App.tsx?raw";
import menuSource from "./ExploreSpacesMenu.tsx?raw";

describe("landing Space discovery contract", () => {
  it("opens a dedicated Space dialog instead of scrolling to Discover", () => {
    expect(appSource).toContain("<BrandHero onExplore={openSpaces}");
    expect(appSource).toContain("<ExploreSpacesMenu");
    expect(appSource).toContain("open={spacesOpen}");
    expect(appSource).toContain("focusSpaceId={focusedSpaceId}");
    expect(appSource).not.toContain("function DiscoverGalleries");
    expect(appSource).not.toContain("#discover-spaces");
  });

  it("keeps the Danny Hirsch reference Space pinned ahead of live rooms", () => {
    const pinnedIndex = menuSource.indexOf("space-menu-card--pinned");
    const liveRoomsIndex = menuSource.indexOf("orderedSpaces.slice(0, 8).map");

    expect(menuSource).toContain("Danny Hirsch Arts · Reference Space");
    expect(menuSource).toContain("Threshold");
    expect(menuSource).toContain("./assets/demo/danny-cover.webp");
    expect(pinnedIndex).toBeGreaterThan(-1);
    expect(pinnedIndex).toBeLessThan(liveRoomsIndex);
  });

  it("loads real published rooms with searchable room imagery", () => {
    expect(menuSource).toContain("galleryRepository");
    expect(menuSource).toContain(".discover()");
    expect(menuSource).toContain("space.coverSrc ?? fallback");
    expect(menuSource).toContain('type="search"');
  });

  it("merges the room chooser into the product-proof section", () => {
    expect(appSource).toContain("<RoomShowcase embedded />");
    expect(appSource.match(/<RoomShowcase/g)).toHaveLength(1);
    expect(appSource).toContain("room-showcase--embedded");
  });
});
