import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShowcaseCollection } from "./ShowcaseCollection";

describe("LIEUVA showcase collection", () => {
  it("opens all three independent showcases without promising Studio templates", () => {
    const html = renderToStaticMarkup(createElement(ShowcaseCollection));
    expect(html).toContain("Enter Obsidian, Sculpture Pavilion and Forest Fold House.");
    expect(html.match(/class="showcase-card"/g)).toHaveLength(3);
    expect(html.match(/class="showcase-card__status"/g)).toHaveLength(3);
    expect(html).not.toContain('href="#/create"');
    expect(html.match(/href="#\/showcase\/obsidian"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Explore Obsidian: Art exhibitions"');
    expect(html.match(/href="#\/showcase\/sculpture-pavilion"/g)).toHaveLength(2);
    expect(html).not.toContain("Showcase coming soon");
    expect(html.match(/href="#\/showcase\/forest-fold-house"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Explore Forest Fold House: Architecture"');
    expect(html).not.toMatch(/href="#\/create\/(?:white-cube|nocturne|pavilion)/);
    expect(html).toContain("From real rooms to digital worlds.");
    expect(html).toContain("From a room scan, photographs or plans");
    expect(html).toContain("Contact route coming soon");
  });
});
