import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VisitorEntryChoice } from "./ViewerExperience";

describe("VisitorEntryChoice", () => {
  it("offers equal 3D and direct artwork paths before the scene starts", () => {
    const markup = renderToStaticMarkup(
      <VisitorEntryChoice
        exhibitionTitle="Threshold"
        returnFocus={{ current: null }}
        onEnter3D={() => undefined}
        onViewWorks={() => undefined}
      />,
    );

    expect(markup).toContain("Choose how to explore.");
    expect(markup).toContain("Enter 3D");
    expect(markup).toContain("View works");
    expect(markup).toContain("Browse every work and its details");
    expect(markup).not.toContain("disabled");
  });

  it("explains an unavailable 3D view and keeps the works path enabled", () => {
    const markup = renderToStaticMarkup(
      <VisitorEntryChoice
        exhibitionTitle="Threshold"
        unavailable
        returnFocus={{ current: null }}
        onEnter3D={vi.fn()}
        onViewWorks={vi.fn()}
      />,
    );

    expect(markup).toContain("3D is unavailable in this browser.");
    expect(markup.match(/disabled=""/g)).toHaveLength(1);
    expect(markup).toContain("View works");
  });
});
