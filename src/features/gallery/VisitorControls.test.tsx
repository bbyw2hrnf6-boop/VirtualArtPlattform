import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VisitorControls } from "./VisitorControls";
import { IDLE_VISITOR_TOUR } from "./visitorTourState";

describe("VisitorControls", () => {
  it("keeps the shared visitor actions and truthful E look-down hint", () => {
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
    expect(markup).toContain("Q/E");
    expect(markup).not.toContain("Q/R");
    expect(markup).toContain("Tap the floor to walk");
    vi.unstubAllGlobals();
  });
});
