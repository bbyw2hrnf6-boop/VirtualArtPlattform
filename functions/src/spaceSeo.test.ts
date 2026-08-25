import { createServer } from "node:http";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import {
  cacheControlForSpace,
  classifySpaceForDelivery,
  metadataForSpace,
  renderPublicSitemap,
  renderSpaceDocument,
  spaceCanonicalUrl,
  type PublicSpaceDelivery,
} from "./spaceSeo.js";

const NOW = Date.parse("2026-08-24T00:00:00.000Z");
const SHELL = `<!doctype html><html><head>
<title>LIEUVA home</title>
<meta name="description" content="home description">
<meta name="robots" content="index,follow">
<link rel="canonical" href="https://lieuva.com/">
<meta property="og:title" content="home">
<meta property="og:image" content="https://lieuva.com/home.webp">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@type":"WebApplication"}</script>
</head><body><div id="root"></div><script src="/assets/app.js"></script></body></html>`;

function record(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 3,
    title: "Material Futures",
    artist: "Studio North",
    visibility: "public",
    lifecycleStatus: "active",
    expiresAt: new Date(NOW + 86_400_000),
    publishedAt: new Date(NOW - 86_400_000),
    updatedAt: new Date(NOW - 3_600_000),
    revision: 4,
    ownerId: "owner-safe",
    coverPath: "published/owner-safe/material-futures-abc123/revisions/r4-safe/cover.webp",
    artworks: [{ storagePath: "published/owner-safe/material-futures-abc123/revisions/r4-safe/artwork-1.webp" }],
    ...overrides,
  };
}

describe("Space SEO delivery policy", () => {
  it("returns unique raw public metadata without client JavaScript", () => {
    const delivery = classifySpaceForDelivery(
      "material-futures-abc123",
      record(),
      NOW,
    );
    expect(delivery.kind).toBe("public");
    const html = renderSpaceDocument(SHELL, delivery);
    expect(html).toContain("<title>Material Futures — Studio North | LIEUVA</title>");
    expect(html).toContain(
      '<link rel="canonical" href="https://lieuva.com/spaces/material-futures-abc123">',
    );
    expect(html).toContain(
      '<meta property="og:url" content="https://lieuva.com/spaces/material-futures-abc123">',
    );
    expect(html).toContain(
      '<meta property="og:image" content="https://lieuva.com/space-cards/material-futures-abc123?v=4">',
    );
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).toContain('<meta name="lieuva:space-state" content="public">');
    expect(html).toContain('"@type":"WebPage"');
    expect(html).not.toContain("home description");
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
  });

  it("uses privacy-safe generic raw metadata for an unlisted Space", () => {
    const delivery = classifySpaceForDelivery(
      "material-futures-abc123",
      record({ visibility: "unlisted", title: "Secret Launch", artist: "Hidden Studio" }),
      NOW,
    );
    const html = renderSpaceDocument(SHELL, delivery);
    expect(delivery.kind).toBe("unlisted");
    expect(html).toContain("LIEUVA — Shared Space");
    expect(html).toContain("noindex,nofollow,noarchive");
    expect(html).toContain('<meta name="lieuva:space-state" content="protected">');
    expect(html).not.toContain("Secret Launch");
    expect(html).not.toContain("Hidden Studio");
    expect(cacheControlForSpace(delivery)).toContain("no-store");
  });

  it("never leaks private title, creator, artwork, Storage path or invitation", () => {
    const invitationToken = "invite-super-secret-token";
    const privateRecord = record({
      visibility: "private",
      title: "Acquisition Room",
      artist: "Private Collector",
      artworks: [{ src: "https://storage.example/private-art.webp", description: "Private note" }],
      invitationToken,
    });
    const delivery = classifySpaceForDelivery("material-futures-abc123", privateRecord, NOW);
    const html = renderSpaceDocument(SHELL, delivery);
    expect(delivery.kind).toBe("private");
    expect(metadataForSpace(delivery).status).toBe(200);
    for (const secret of [
      "Acquisition Room",
      "Private Collector",
      "private-art.webp",
      "Private note",
      invitationToken,
      String(privateRecord.coverPath),
    ]) {
      expect(html).not.toContain(secret);
    }
    expect(html).toContain("LIEUVA — Private Space");
    expect(html).toContain("noindex,nofollow,noarchive");
    expect(html).toContain('<meta name="lieuva:space-state" content="protected">');
  });

  it("returns deterministic 404 policy for malformed, missing, archived and expired Spaces", () => {
    const states = [
      classifySpaceForDelivery("bad/id", record(), NOW),
      classifySpaceForDelivery("valid-id", undefined, NOW),
      classifySpaceForDelivery("valid-id", record({ lifecycleStatus: "archived" }), NOW),
      classifySpaceForDelivery("valid-id", record({ expiresAt: new Date(NOW - 1) }), NOW),
    ];
    for (const delivery of states) {
      expect(delivery.kind).toBe("not-found");
      expect(metadataForSpace(delivery).status).toBe(404);
      expect(metadataForSpace(delivery).robots).toContain("noindex");
      expect(renderSpaceDocument(SHELL, delivery)).toContain(
        '<meta name="lieuva:space-state" content="not-found">',
      );
    }
  });

  it("keeps the canonical stable across title and revision changes while refreshing metadata", () => {
    const before = classifySpaceForDelivery("stable-space-123", record({ revision: 1 }), NOW);
    const after = classifySpaceForDelivery(
      "stable-space-123",
      record({ title: "Final Exhibition", revision: 2 }),
      NOW,
    );
    const beforeMetadata = metadataForSpace(before);
    const afterMetadata = metadataForSpace(after);
    expect(beforeMetadata.canonical).toBe(afterMetadata.canonical);
    expect(afterMetadata.canonical).toBe("https://lieuva.com/spaces/stable-space-123");
    expect(afterMetadata.title).toContain("Final Exhibition");
    expect(beforeMetadata.ogImage).toContain("?v=1");
    expect(afterMetadata.ogImage).toContain("?v=2");
  });

  it("changes metadata eligibility safely when visibility changes", () => {
    const publicDelivery = classifySpaceForDelivery("stable-space-123", record(), NOW);
    const privateDelivery = classifySpaceForDelivery(
      "stable-space-123",
      record({ visibility: "private" }),
      NOW,
    );
    const publicAgain = classifySpaceForDelivery("stable-space-123", record({ revision: 5 }), NOW);
    expect(publicDelivery.kind).toBe("public");
    expect(privateDelivery.kind).toBe("private");
    expect(cacheControlForSpace(privateDelivery)).toContain("no-store");
    expect(metadataForSpace(privateDelivery).title).not.toContain("Material Futures");
    expect(publicAgain.kind).toBe("public");
    expect(metadataForSpace(publicAgain).canonical).toBe(metadataForSpace(publicDelivery).canonical);
  });

  it("preserves legacy schema public reads without exposing malformed modern records", () => {
    expect(
      classifySpaceForDelivery(
        "legacy-space-123",
        record({ schemaVersion: 2, visibility: undefined }),
        NOW,
      ).kind,
    ).toBe("public");
    expect(
      classifySpaceForDelivery(
        "modern-space-123",
        record({ schemaVersion: 3, visibility: undefined }),
        NOW,
      ).kind,
    ).toBe("not-found");
  });

  it("only emits canonical public URLs in the sitemap", () => {
    const deliveries = [
      classifySpaceForDelivery("public-space-123", record(), NOW),
      classifySpaceForDelivery("private-space-123", record({ visibility: "private" }), NOW),
      classifySpaceForDelivery("unlisted-space-123", record({ visibility: "unlisted" }), NOW),
    ];
    const sitemap = renderPublicSitemap(
      deliveries.filter((item): item is PublicSpaceDelivery => item.kind === "public"),
    );
    expect(sitemap).toContain("https://lieuva.com/");
    expect(sitemap).toContain("https://lieuva.com/spaces/public-space-123");
    expect(sitemap).not.toContain("private-space-123");
    expect(sitemap).not.toContain("unlisted-space-123");
    expect(sitemap).not.toContain("#/g/");
  });

  it("keeps ineligible public Spaces shareable but out of indexing and sitemap", () => {
    const moderated = classifySpaceForDelivery(
      "moderated-space-123",
      record({ discoverEligible: false }),
      NOW,
    );
    const incomplete = classifySpaceForDelivery(
      "incomplete-space-123",
      record({ artworks: [] }),
      NOW,
    );
    const placeholder = classifySpaceForDelivery(
      "placeholder-space-123",
      record({ title: "Untitled Space" }),
      NOW,
    );
    for (const delivery of [moderated, incomplete, placeholder]) {
      expect(delivery.kind).toBe("public");
      expect(metadataForSpace(delivery).status).toBe(200);
      expect(metadataForSpace(delivery).robots).toContain("noindex");
    }
    const sitemap = renderPublicSitemap(
      [moderated, incomplete, placeholder].filter(
        (item): item is PublicSpaceDelivery => item.kind === "public",
      ),
    );
    expect(sitemap).not.toContain("moderated-space-123");
    expect(sitemap).not.toContain("incomplete-space-123");
    expect(sitemap).not.toContain("placeholder-space-123");
  });

  it("does not approve a cover path owned by another publication", () => {
    const delivery = classifySpaceForDelivery(
      "material-futures-abc123",
      record({ coverPath: "published/other-owner/other-space/cover.webp" }),
      NOW,
    );
    expect(delivery.kind).toBe("public");
    if (delivery.kind === "public") expect(delivery.coverPath).toBeUndefined();
  });

  it("escapes user-controlled public text in the returned head", () => {
    const delivery = classifySpaceForDelivery(
      "escaped-space-123",
      record({ title: '<script>alert("x")</script>', artist: "Studio & Co" }),
      NOW,
    );
    const html = renderSpaceDocument(SHELL, delivery);
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("Studio &amp; Co");
  });
});

describe("raw HTTP Space document", () => {
  const servers: ReturnType<typeof createServer>[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  });

  it("returns route-specific HTML and status before any app script executes", async () => {
    const delivery = classifySpaceForDelivery("material-futures-abc123", record(), NOW);
    const metadata = metadataForSpace(delivery);
    const server = createServer((_request, response) => {
      response.writeHead(metadata.status, { "content-type": "text/html; charset=utf-8" });
      response.end(renderSpaceDocument(SHELL, delivery));
    });
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("HTTP test server did not start.");
    const response = await fetch(`http://127.0.0.1:${address.port}/spaces/material-futures-abc123`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("Material Futures — Studio North | LIEUVA");
    expect(html).toContain(spaceCanonicalUrl("material-futures-abc123"));
    expect(html).toContain('<script src="/assets/app.js"></script>');
  });
});
