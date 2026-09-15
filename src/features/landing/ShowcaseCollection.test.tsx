import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShowcaseCollection } from "./ShowcaseCollection";

describe("LIEUVA showcase collection", () => {
  it("opens Obsidian separately from Studio and Sculpture Pavilion separately from Studio; Architecture remains pending", () => {
    const html = renderToStaticMarkup(createElement(ShowcaseCollection));
    expect(html).toContain("Enter Obsidian and Sculpture Pavilion, our bespoke exhibitions.");
    expect(html.match(/class="showcase-card"/g)).toHaveLength(3);
    expect(html.match(/class="showcase-card__status"/g)).toHaveLength(3);
    expect(html).not.toContain('href="#/create"');
    expect(html.match(/href="#\/showcase\/obsidian"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Explore Obsidian: Art exhibitions"');
    expect(html.match(/href="#\/showcase\/sculpture-pavilion"/g)).toHaveLength(2);
    expect(html.match(/Showcase coming soon/g)).toHaveLength(1);
    expect(html.match(/href="#bespoke-projects"/g)).toHaveLength(1);
    expect(html).not.toMatch(/href="#\/create\/(?:white-cube|nocturne|pavilion)/);
    expect(html).toContain("From real rooms to digital worlds.");
    expect(html).toContain("From a room scan, photographs or plans");
    expect(html).toContain("Contact route coming soon");
  });
});
