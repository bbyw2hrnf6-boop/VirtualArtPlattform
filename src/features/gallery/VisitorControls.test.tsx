import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VisitorControls } from "./VisitorControls";
import { IDLE_VISITOR_TOUR } from "./visitorTourState";

describe("VisitorControls", () => {
  it("keeps the shared visitor actions and truthful E look-up hint", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => undefined,
    });
    const markup = renderToStaticMarkup(
      <VisitorControls
        mode="walk"
        modeOptions={[{ value: "walk", label: "Walk", icon: "↟" }]}
        onModeChange={() => undefined}
        tour={IDLE_VISITOR_TOUR}
        tourAvailable
        onStartOrSkipTour={() => undefined}
        onPauseOrResumeTour={() => undefined}
        onStepTour={() => undefined}
        onSmartView={() => undefined}
        smartViewLabel="Artwork views"
        onResetView={() => undefined}
        onTouchMove={() => undefined}
        artworkCount={3}
        onOpenArtworkDirectory={() => undefined}
        firstEntryHint
      />,
    );

    expect(markup).toContain("Guided tour");
    expect(markup).toContain("Focus view");
    expect(markup).toContain("Reset view");
    expect(markup).toContain("Artworks");
    expect(markup).toContain("Controls");
    expect(markup).toContain("E/↑ look up");
    expect(markup).not.toContain("Q/R");
    expect(markup).toContain("Tap the floor to walk");
    expect(markup).toContain("Walk controls");
    expect(markup).toContain("Move forward");
    vi.unstubAllGlobals();
  });

  it("supports a showcase without instructions or unavailable tour actions", () => {
    const markup = renderToStaticMarkup(<VisitorControls mode="walk"
      modeOptions={[{ value: "walk", label: "Walk", icon: "↟" }, { value: "overview", label: "Overview", icon: "◇" }]}
      onModeChange={() => undefined} onResetView={() => undefined}
      onOpenArtworkDirectory={() => undefined} artworkCount={11}
      artworkDirectoryId="obsidian-collection" artworkDirectoryDialog={false} showHelp={false} firstEntryHint />);
    expect(markup).toContain("Overview");
    expect(markup).toContain("Reset view");
    expect(markup).toContain('aria-controls="obsidian-collection"');
    expect(markup).not.toContain('aria-haspopup="dialog"');
    for (const absent of ["Controls", "Tap the floor", "Guided tour", "Focus view", "Move forward"]) expect(markup).not.toContain(absent);
  });
});
