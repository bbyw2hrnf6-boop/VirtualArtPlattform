# WP5 — Clean Space URL & SEO implementation evidence

**Date:** 2026-08-24  
**Verdict:** **PASS WITH CONDITIONS**  
**Deployment:** none  
**Production data/rules/DNS:** untouched

## 1. Architecture chosen

WP5 uses Firebase Hosting plus three public, privacy-aware HTTP Functions on the existing `europe-west1` Firebase runtime:

- `spaceDocument` returns the generated Vite application shell with current route-specific metadata and correct Space status semantics;
- `spaceCard` revalidates current public eligibility before proxying the approved Storage cover;
- `spaceSitemap` emits the homepage and eligible public Spaces only.

The React application keeps its existing lightweight router. Only published-Space delivery gains a clean pathname. Studio, Account, Auth, DannyHirschArts and the other hash routes are preserved.

The complete pre-implementation decision is in `audit/SPACE-URL-SEO-ARCHITECTURE.md`.

## 2. Alternatives rejected

- **GitHub Pages only:** cannot emit Firestore-aware initial HTML, dynamic social cards, privacy-aware metadata or correct Space HTTP statuses.
- **Pre-generated Space files:** couples every publication/visibility change to a deploy and creates stale privacy/deletion risk.
- **New SSR/edge platform or framework-router migration:** introduces a second trust/deployment system and broad migration with no identity benefit.

Firebase Hosting + Functions is the smallest coherent addition to infrastructure already used by the product.

## 3. Hosting implications

- Default builds now use root-relative asset URLs and generate `functions/generated/app-shell.html` from the final hashed `dist/index.html`.
- `firebase.json` rewrites clean Space documents, card images and sitemap requests to Functions, with all other paths falling back to the SPA shell.
- The existing GitHub Pages workflow sets `LEGACY_GITHUB_PAGES=true`, retaining a relative-base rollback build.
- `public/404.html` gives GitHub Pages a noindex clean-path-to-legacy bridge during rollback. Its marker prevents a clean/hash redirect loop.
- Firebase Hosting must be externally configured and deployed before DNS moves from the current delivery.

## 4. Canonical URL contract

`https://lieuva.com/spaces/{existing-galleryId}`

The clean URL is the only canonical for an eligible public Space. Hash URLs are compatibility entry points. Static/global pages retain the homepage canonical.

## 5. Identifier strategy

The identifier is the existing Firestore `galleries/{galleryId}` document ID. It is already the publication, Storage-parent, ACL-parent and update identity. New IDs include a random 16-hex suffix; existing URL-safe legacy IDs remain accepted.

No slug/alias collection was created. Title, Creator, content and revision changes leave the ID and URL unchanged.

## 6. Legacy compatibility

- `#/g/{id}` remains parsed.
- A valid legacy ID navigates with `location.replace()` to the same clean Space identity.
- Local development stays on the local origin.
- The Pages rollback bridge resolves `/spaces/{id}` to `?legacy=1#/g/{id}` without making a new Space.
- Other existing hash routes and Firebase Auth query callbacks remain unchanged.

## 7. Metadata architecture

The build copies the exact hashed application shell to the Functions package. `spaceDocument` retrieves a field-projected current manifest and runs one shared server classifier used by the document, card and sitemap surfaces.

Eligible public HTML includes:

- unique title and description;
- self canonical;
- Open Graph title, description, URL and image;
- Twitter large-card metadata;
- truthful minimal `WebPage` JSON-LD;
- `index,follow,max-image-preview:large`.

The server removes the shell's global route metadata before injecting the Space block, preventing duplicate canonicals/titles. A non-sensitive `lieuva:space-state` marker preserves the server's not-found decision after React boot. Public titles remain consistent after hydration; protected client hydration does not replace generic metadata with private content.

## 8. Share-card architecture

Public cards use:

`https://lieuva.com/space-cards/{galleryId}?v={revision}`

The Function re-reads current visibility/lifecycle/expiry, validates that `coverPath` belongs to the same owner and publication, accepts only bounded image formats/sizes, and streams the binary without emitting a Storage URL. Missing public covers redirect to the existing LIEUVA fallback image.

Private/unlisted/missing requests return 404 and `no-store`; they cannot retrieve a cover. The `v` value changes with revisions for cache busting but grants no access.

## 9. Visibility and indexing matrix

| Space state | Initial metadata | Robots | Sitemap | Card |
| --- | --- | --- | --- | --- |
| Public + active + unexpired | Current approved public metadata | index/follow | yes | current cover/fallback |
| Unlisted + active + unexpired | Generic Shared Space only | noindex/nofollow/noarchive | no | no protected media |
| Private + active + unexpired | Generic Private Space only | noindex/nofollow/noarchive | no | no protected media |
| Missing/malformed/archived/trashed/expired | Generic unavailable | noindex/nofollow/noarchive | no | 404 |
| Backend/shell failure | Generic temporary error | noindex/nofollow/noarchive | no | 404/no-store |

Discover eligibility was not changed. Sitemap eligibility does not add items to Discover.

## 10. Sitemap behavior

`spaceSitemap` uses the already-defined `visibility + expiresAt` and `schemaVersion + expiresAt` indexes. Modern public and legacy schema-v1/v2 results are projected to metadata-only fields, merged by ID and passed through the shared classifier.

Output contains:

- `https://lieuva.com/`;
- active, unexpired public `/spaces/{id}` URLs.

It excludes private, unlisted, archived, trashed, expired, Account, Studio, invitations, tokens, revisions and all hash URLs. Backend failure returns 503 and only the homepage fallback XML.

## 11. Robots behavior

`public/robots.txt` stays deliberately simple and points to `https://lieuva.com/sitemap.xml`. Privacy is enforced by Firebase access rules, the server classifier, generic protected metadata, card rejection and sitemap exclusion—not by robots.txt.

## 12. Structured-data behavior

The homepage retains truthful `WebApplication` JSON-LD. An eligible public Space receives minimal `WebPage` JSON-LD with name, description, canonical URL, current modification date when valid, and LIEUVA `WebSite` membership. No ratings, offers, reviews, events or unverified creator entity type were invented.

Protected and unavailable documents emit no structured data.

## 13. Error and status behavior

- malformed/missing/deleted/archived/trashed/expired: HTTP 404 + noindex app shell;
- private/unlisted: HTTP 200 generic noindex shell so existing direct/auth access can boot;
- backend/shell failure: HTTP 503 generic noindex document;
- unsupported method: 405 with `Allow: GET, HEAD`;
- protected/missing card: 404, no-store;
- sitemap backend failure: 503.

Browser QA exposed that a missing client read can be indistinguishable from a protected Firestore read. The server-state marker now prevents a known 404 from later rendering as a private-account prompt.

## 14. Cache and invalidation strategy

- Public Space HTML: shared cache up to 60 seconds, immediate browser revalidation.
- Public card: shared/browser cache up to 60 seconds with revalidation.
- Sitemap: shared cache up to 60 seconds.
- Protected/error responses: `private, no-store, max-age=0`.
- Revision is present in the card URL.

Public-to-private state may remain in an already-populated shared cache for at most 60 seconds, not indefinitely. The card endpoint independently rechecks current state. A later production system can add explicit CDN purge hooks without changing the URL/data contract.

## 15. Auth, invitation and PWA compatibility

- Firebase action query parameters are still parsed before product routes.
- Existing verification/reset URLs and invitation/callable contracts are unchanged.
- Private visitor Auth and owner/editor/viewer behavior still use the existing repository/rules.
- No invitation token appears in a canonical, metadata block or sitemap.
- PWA `start_url` and `scope` are `/`; icons/manifests are root-relative, so an installed app and direct Space deep links remain inside Hosting.
- Non-Space navigation from a clean document reloads the root shell, preventing stale Space canonical/OG tags from remaining in a different SPA view.

## 16. Security and privacy tests

Deterministic coverage confirms:

- private title, Creator, artwork URL, artwork description, Storage path and invitation token are absent from raw metadata;
- unlisted content uses generic noindex metadata;
- protected cards cannot resolve;
- malformed modern visibility fails closed;
- legacy public schema remains readable;
- cover paths belonging to another owner/Space are rejected;
- user-controlled public text is HTML-escaped and JSON-LD `<` characters are neutralized;
- public → private → public eligibility changes safely;
- private/unlisted records cannot enter generated sitemap output.

No secret, account credential or production test fixture was created.

## 17. Performance implications

- Router utilities and metadata do not import Three.js.
- Metadata/Card lookup projects only 11 required manifest fields; it does not retrieve artwork arrays or binary assets.
- Sitemap queries project the same fields and are capped at 500 modern + 500 legacy candidates before deduplication.
- Card image retrieval occurs only on the dedicated crawler/card endpoint.
- Existing GalleryScene lazy loading remains unchanged.
- Root bundle size remained within the existing build threshold.

## 18. Test and build results

Final local verification:

| Check | Result |
| --- | --- |
| `npm run check` | PASS — lint, **30 files / 206 tests**, TypeScript and Vite production build |
| `npm run check:functions` | PASS — **4 files / 31 tests**, Functions TypeScript build |
| `npm run test:release-gate` | PASS — **8 files / 71 tests** (WP1 subset already included in root total) |
| WP2 account-data-rights coverage | PASS — included in 31-Function suite |
| WP4 brand/compatibility + WP5 config/routes targeted | PASS — 3 files / 13 tests (already included in root total) |
| Raw HTTP document test | PASS — initial returned HTML verified before app script execution |
| `git diff --check` | PASS |
| Generated hashed Function shell | PASS — root `/assets/...` application script confirmed |

Unique automated total: **237/237 tests passed** across root and Functions packages.

Browser/production-preview QA:

- root direct load and canonical: PASS;
- malformed clean deep link + refresh: PASS;
- legacy hash replaced by same clean ID: PASS;
- back/forward between tested routes: PASS;
- final tested browser console: no errors/warnings;
- Firebase Hosting/Firestore Functions emulator: not run because this Mac has no Java runtime;
- production Hosting/Functions/raw-live metadata/card: not run because WP5 prohibits deployment.

Post-approval production cutover verification (2026-08-24):

- Firebase Hosting and `spaceDocument`, `spaceCard`, and `spaceSitemap` deployed successfully through the GitHub Actions Firebase workflow;
- `https://lieuva.com/`: HTTP 200 with HTTPS/HSTS;
- `https://www.lieuva.com/`: HTTP 301 to `https://lieuva.com/`;
- `https://lieuva.com/robots.txt`: HTTP 200;
- `https://lieuva.com/sitemap.xml`: HTTP 200, XML, canonical LIEUVA URLs;
- sampled clean public Space documents: HTTP 200 with route-specific title, canonical, Open Graph metadata, and card URL;
- Wix DNS now targets Firebase (`lieuva.com` A → `199.36.158.100`; `www` CNAME → `virtualartplattform.web.app`);
- Firebase reports both custom domains connected and certificates provisioned;
- the obsolete GitHub Pages custom-domain binding was removed after successful cutover;
- downloaded local service-account JSON files were moved to Trash after CI deployment succeeded.

## 19. External deployment steps

The owner-approved Hosting/Functions deployment, DNS cutover, certificates, canonical-domain checks, and GitHub Pages detachment were completed on 2026-08-24. Remaining operational follow-up:

1. Run the remaining authenticated browser matrix on production: Auth verification/reset, Google OAuth, invitations, private owner/editor/viewer access, publication/update, and visibility transitions.
2. Verify real social previews in the target crawler tools and refresh their caches where necessary.
3. Submit `https://lieuva.com/sitemap.xml` to Google Search Console.

Commands and detailed checks are also recorded in `FIREBASE_SETUP.md`. Firestore rules, Storage rules and existing indexes need no WP5 change.

## 20. Rollback plan

1. Stop the custom-domain cutover or repoint Wix DNS to the previous GitHub Pages records.
2. Restore/run the known-good Pages deployment with its relative-base build.
3. The noindex Pages `404.html` bridge converts clean Space paths to the same legacy `#/g/{id}` identity; older copied hash links continue directly.
4. After traffic is confirmed on the previous host, remove/disable the Hosting rewrites or leave the unused Functions in place for investigation.
5. Restore a static homepage-only sitemap if the dynamic endpoint is no longer served.

Do not delete Functions first, and never delete/migrate Firestore records, Storage assets, IDs, revisions, ACL, drafts or exports during rollback.

## 21. Remaining risks

- Firebase Hosting and the three HTTP Functions have not been deployed or exercised against a safe external Firebase test fixture.
- The exact Hosting custom-domain/DNS records and certificate timing are external state.
- Actual crawler previews (Facebook, LinkedIn, X, Slack) need post-preview verification and cache refresh.
- A public cover may remain in shared cache for up to 60 seconds after a visibility change; this is bounded and documented but not instant invalidation.
- Sitemap output is capped at 1,000 pre-deduplicated candidates. Pagination/index partitioning is required before that scale.
- DannyHirschArts has no persisted `galleries/{id}` publication identity, so it intentionally remains the reference demo route rather than receiving a fabricated one-off canonical Space.
- Java is absent locally, preventing full Firebase emulator integration. Pure policy, raw HTTP output, build and browser route tests passed.

## 22. Verdict

**PASS.** WP5 implementation and production delivery are complete. Clean canonical Space URLs, initial server metadata, privacy-safe cards, public-only sitemap, deterministic status behavior, legacy compatibility, root PWA delivery, Firebase Hosting, custom-domain HTTPS, `www` redirect, CI deployment, and rollback support are in place without changing persistent identity or access contracts.

Authenticated lifecycle QA, real crawler preview refreshes, and Search Console submission remain operational follow-up rather than WP5 implementation blockers. The repository is ready for WP6.
