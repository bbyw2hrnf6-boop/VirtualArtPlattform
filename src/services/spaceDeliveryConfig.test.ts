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

type HostingHeader = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

describe("WP5 delivery configuration", () => {
  const firebase = JSON.parse(firebaseSource) as {
    functions: { ignore: string[]; predeploy: string[] };
    hosting: { predeploy: string[]; public: string; rewrites: HostingRewrite[]; headers: HostingHeader[] };
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
    expect(firebase.functions.predeploy).toEqual([
      'node "$PROJECT_DIR/scripts/firebase-predeploy.mjs" build',
      'node "$PROJECT_DIR/scripts/firebase-predeploy.mjs" functions-check',
    ]);
    expect(firebase.hosting.predeploy).toEqual([
      'node "$PROJECT_DIR/scripts/firebase-predeploy.mjs" build',
    ]);
    expect(JSON.parse(packageSource).scripts.build).toContain("prepare-space-delivery.mjs");
  });

  it("excludes source, tests, maps, and build tooling from the Functions upload", () => {
    expect(firebase.functions.ignore).toEqual(expect.arrayContaining([
      "node_modules",
      "scripts",
      "src",
      ".gitkeep",
      "**/*.test.*",
      "**/*.spec.*",
      "**/*.map",
      "vitest.config.*",
      "tsconfig*.json",
    ]));
  });

  it("keeps root PWA navigation and one canonical sitemap declaration", () => {
    const manifest = JSON.parse(manifestSource) as { start_url: string; scope: string };
    expect(manifest).toMatchObject({ start_url: "/", scope: "/" });
    expect(robotsSource.trim()).toContain("Sitemap: https://lieuva.com/sitemap.xml");
    expect(indexSource).toContain('<link rel="canonical" href="https://lieuva.com/"');
    expect(indexSource).toContain('href="/site.webmanifest"');
  });

  it("always revalidates the unhashed application shell", () => {
    for (const source of ["/", "/index.html"]) {
      const cacheControl = firebase.hosting.headers
        .find((rule) => rule.source === source)
        ?.headers.find((header) => header.key === "Cache-Control")
        ?.value;
      expect(cacheControl).toContain("no-cache");
      expect(cacheControl).toContain("max-age=0");
      expect(cacheControl).toContain("s-maxage=0");
      expect(cacheControl).toContain("must-revalidate");
    }
  });
});
