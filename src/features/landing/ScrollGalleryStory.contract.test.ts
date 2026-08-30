import { describe, expect, it } from "vitest";
import appSource from "../../App.tsx?raw";
import storySource from "./ScrollGalleryStory.tsx?raw";

describe("Emil scroll-story integration contract", () => {
  it("does not force reduced-motion visitors into the interactive finale", () => {
    expect(storySource).toContain("targetProgress = storyScrollProgress(");
    expect(storySource).not.toContain("reducedMotion ? 1");
  });

  it("renumbers the condensed five-chapter sequence", () => {
    expect(storySource).toContain("visibleStoryEyebrow(chapter.eyebrow, visibleIndex)");
    expect(storySource).toContain("CONDENSED_CHAPTER_INDEXES");
  });

  it("does not flash the completed room while a mobile story is loading", () => {
    expect(appSource).toContain("01 / 05 · Preparing the blueprint…");
    expect(appSource).not.toContain("danny-emil-finale-mobile-v2.webp");
    expect(storySource).toContain('section.dataset.roomState = "loading"');
    expect(storySource).toContain('section.dataset.roomState = "error"');
  });
});
