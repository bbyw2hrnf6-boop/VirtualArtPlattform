import { describe, expect, it } from "vitest";
import directorySource from "./CreatorDirectoryPage.tsx?raw";

describe("public Creator directory contract", () => {
  it("loads both public resources and keeps their failure states independent", () => {
    expect(directorySource).toContain("loadPublicCreatorDirectory(controller.signal)");
    expect(directorySource).toContain("galleryRepository.discover()");
    expect(directorySource).toContain('creators: { status: "error", data: [] }');
    expect(directorySource).toContain('spaces: { status: "error", data: [] }');
  });

  it("keeps editorial previews outside live totals and search results", () => {
    expect(directorySource).toContain('import { DEMO_CREATORS } from "./demoCreators"');
    expect(directorySource).toContain("Editorial previews are separate.");
    expect(directorySource).toContain("never included in live community totals or search results");
    expect(directorySource).toContain("{!isSearching ? (");
    expect(directorySource).toContain('state.creators.status === "ready" ? state.creators.data.length : "—"');
    expect(directorySource).toContain("Part of the live directory is unavailable.");
    expect(directorySource).not.toContain('creator.demo ? "Editorial preview"');
  });

  it("uses crawlable public links for Creator profiles and Spaces", () => {
    expect(directorySource).toContain("href={creatorCanonicalUrl(creator.handle, window.location.href)}");
    expect(directorySource).toContain("href={spaceCanonicalUrl(space.id, location.href)}");
    expect(directorySource).toContain('href="/creator-hub"');
    expect(directorySource).toContain('href="/"');
  });

  it("keeps search, loading, empty and retry language visible", () => {
    expect(directorySource).toContain('type="search"');
    expect(directorySource).toContain("Loading the public directory…");
    expect(directorySource).toContain("Try a broader search.");
    expect(directorySource).toContain("Try again");
  });

  it("loads dedicated presentation without depending on Hub styles", () => {
    expect(directorySource).toContain('import "./creatorDirectory.css"');
    expect(directorySource).not.toContain('import "./creatorHub.css"');
    expect(directorySource).not.toContain('import "./creatorHubMobile.css"');
  });

  it("can remove duplicate navigation when rendered inside the Hub shell", () => {
    expect(directorySource).toContain('const Root = embedded ? "section" : "main"');
    expect(directorySource).toContain("creator-directory--embedded");
    expect(directorySource).toContain("{!embedded ? <header");
    expect(directorySource).toContain("{!embedded ? <footer");
  });
});
