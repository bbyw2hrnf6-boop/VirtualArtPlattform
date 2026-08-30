import { describe, expect, it } from "vitest";
import firebaseSource from "../../firebase.json?raw";
import manifestSource from "../../public/site.webmanifest?raw";
import robotsSource from "../../public/robots.txt?raw";
import indexSource from "../../index.html?raw";
import packageSource from "../../package.json?raw";

type HostingRewrite = {
  source: string;
  destination?: string;
  function?: { functionId: string; region: string };
};

describe("WP5 delivery configuration", () => {
  const firebase = JSON.parse(firebaseSource) as {
    functions: { predeploy: string[] };
    hosting: { public: string; rewrites: HostingRewrite[] };
  };

  it("routes clean documents, cards and sitemap through the intended Functions", () => {
    expect(firebase.hosting.public).toBe("dist");
    expect(firebase.hosting.rewrites).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "/creator-hub{,/**}", function: expect.objectContaining({ functionId: "creatorDocument", region: "europe-west1" }) }),
      expect.objectContaining({ source: "/creators{,/**}", function: expect.objectContaining({ functionId: "creatorDocument", region: "europe-west1" }) }),
      expect.objectContaining({ source: "/spaces{,/**}", function: expect.objectContaining({ functionId: "spaceDocument", region: "europe-west1" }) }),
      expect.objectContaining({ source: "/space-cards/**", function: expect.objectContaining({ functionId: "spaceCard", region: "europe-west1" }) }),
      expect.objectContaining({ source: "/sitemap.xml", function: expect.objectContaining({ functionId: "spaceSitemap", region: "europe-west1" }) }),
    ]));
    expect(firebase.hosting.rewrites).not.toContainEqual(expect.objectContaining({ source: "**", destination: "/index.html" }));
  });

  it("builds the matching hashed app shell before a Functions deployment", () => {
    expect(firebase.functions.predeploy[0]).toContain('run build');
    expect(JSON.parse(packageSource).scripts.build).toContain("prepare-space-delivery.mjs");
  });

  it("keeps root PWA navigation and one canonical sitemap declaration", () => {
    const manifest = JSON.parse(manifestSource) as { start_url: string; scope: string };
    expect(manifest).toMatchObject({ start_url: "/", scope: "/" });
    expect(robotsSource.trim()).toContain("Sitemap: https://lieuva.com/sitemap.xml");
    expect(indexSource).toContain('<link rel="canonical" href="https://lieuva.com/"');
    expect(indexSource).toContain('href="/site.webmanifest"');
  });
});
