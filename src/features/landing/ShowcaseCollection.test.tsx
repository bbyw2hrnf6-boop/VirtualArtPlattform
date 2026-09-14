import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShowcaseCollection } from "./ShowcaseCollection";

describe("LIEUVA showcase collection", () => {
  it("keeps future showcase routes separate from the existing Studio templates", () => {
    const html = renderToStaticMarkup(createElement(ShowcaseCollection, { onOpenStudio: () => undefined }));
    expect(html).toContain("See what’s possible.");
    expect(html.match(/class="showcase-card"/g)).toHaveLength(3);
    expect(html.match(/class="showcase-card__status"/g)).toHaveLength(3);
    expect(html).toContain('href="#/create"');
    expect(html.match(/href="#bespoke-projects"/g)).toHaveLength(2);
    expect(html).not.toMatch(/href="#\/create\/(?:white-cube|nocturne|pavilion)/);
    expect(html).toContain("Your space. Reimagined in 3D.");
    expect(html).toContain("Contact route coming soon");
  });
});
