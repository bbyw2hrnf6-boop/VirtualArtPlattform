import { describe, expect, it } from "vitest";
import {
  creatorHubSectionAtViewportAnchor,
  creatorHubSectionFromHash,
  creatorHubTargetFromHash,
} from "./creatorHubNavigation";

describe("Creator Hub navigation", () => {
  it("maps social anchors to the correct mobile navigation item", () => {
    expect(creatorHubSectionFromHash("#creator-home")).toBe("home");
    expect(creatorHubSectionFromHash("#creator-feed")).toBe("feed");
    expect(creatorHubSectionFromHash("#creator-activity")).toBe("feed");
    expect(creatorHubSectionFromHash("#creator-directory")).toBe("creators");
    expect(creatorHubSectionFromHash("#creator-spaces")).toBe("spaces");
    expect(creatorHubSectionFromHash("#creator-profile")).toBe("profile");
  });

  it("accepts mounted-page URLs and safely ignores unknown or malformed anchors", () => {
    expect(creatorHubTargetFromHash("https://lieuva.com/creators#creator-spaces")).toBe("creator-spaces");
    expect(creatorHubTargetFromHash("#CREATOR-PROFILE?source=account")).toBe("creator-profile");
    expect(creatorHubTargetFromHash("#creator-activity")).toBe("creator-activity");
    expect(creatorHubTargetFromHash("#missing")).toBeNull();
    expect(creatorHubTargetFromHash("#%E0%A4%A")).toBeNull();
    expect(creatorHubSectionFromHash("#missing")).toBe("home");
  });

  it("selects the most recently passed section while the page is manually scrolled", () => {
    const positions = [
      { section: "home" as const, top: -720 },
      { section: "spaces" as const, top: -170 },
      { section: "profile" as const, top: 76 },
      { section: "feed" as const, top: 610 },
      { section: "creators" as const, top: 1480 },
    ];

    expect(creatorHubSectionAtViewportAnchor(positions, 76)).toBe("profile");
    expect(creatorHubSectionAtViewportAnchor([
      { section: "profile", top: -120 },
      { section: "feed", top: 79 },
    ], 76)).toBe("feed");
    expect(creatorHubSectionAtViewportAnchor(positions.map((target) => ({ ...target, top: target.top + 600 })), 76)).toBe("home");
    expect(creatorHubSectionAtViewportAnchor([], 76)).toBe("home");
  });
});
