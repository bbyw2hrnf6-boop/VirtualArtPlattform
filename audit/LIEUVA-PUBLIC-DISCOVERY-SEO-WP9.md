# LIEUVA Public, Discover, Sharing & SEO — WP9

Date: 2026-08-25  
Verdict: **PASS WITH DEPLOYMENT CONDITIONS**  
Scope: public Space delivery, Discover, sharing, visitor presentation, metadata and crawler policy. No deploy, data migration, DNS change, commit or push was performed.

## 1. Pre-WP9 public architecture

Clean Space documents, social cards and sitemap were already delivered by `spaceDocument`, `spaceCard` and `spaceSitemap` in `functions/src/index.ts`, with Hosting rewrites in `firebase.json`. The SPA continued to support legacy hash links through `src/services/spaceRoutes.ts` and `src/services/galleryShareUrl.ts`.

## 2. Public journey audit

The checked journey was Discover → public Space → shared controls → artwork directory → Share → Create a Space. The public viewer remained 3D-dominant. A confirmed production-data issue was that unfinished placeholder publications appeared in Discover; a deterministic eligibility gate now removes them without changing their direct public URLs.

## 3. SEO architecture

Server delivery remains authoritative for crawlers. `functions/src/spaceSeo.ts` classifies visibility and lifecycle before emitting HTML, metadata or cards. `src/services/pageMetadata.ts` now provides one client-side metadata policy for SPA navigation and hydration. No parallel router or publication system was added.

## 4. LIEUVA metadata migration

User-facing page titles, descriptions, Open Graph and Twitter metadata resolve to LIEUVA. Compatibility-sensitive AURA identifiers remain untouched. The production origin is `https://lieuva.com`.

## 5. Title policy

- Homepage: product title from `src/config/brand.ts`.
- Public eligible Space: `{Space} — {Creator} | LIEUVA`.
- Public ineligible Space: still Space-specific for direct sharing, but noindex.
- Private/unlisted: generic protected/shared title.
- Builder, account, auth, data, not-found: route-specific LIEUVA title, noindex.
- Danny reference: `Threshold — Danny Hirsch Arts | LIEUVA`, noindex because it has no persisted canonical Space identity.

## 6. Description policy

Public eligible Spaces receive a specific visitor description. Private and unlisted Spaces receive a generic protected description that does not disclose title or creator. Non-public application surfaces use the general LIEUVA product description.

## 7. Canonical policy

Homepage canonical is `https://lieuva.com/`. Persisted public Spaces canonicalize to `https://lieuva.com/spaces/{id}`. Legacy `#/g/{id}` links remain readable but are not canonical. Danny remains a reference route canonicalized to the homepage; inventing a fake persisted Space ID was deliberately avoided.

## 8. Visibility/indexing matrix

| State | Direct access | Discover | Robots | Sitemap | Specific metadata before authorization |
|---|---|---|---|---|---|
| Public + eligible | yes | yes | index/follow | yes | yes |
| Public + ineligible | yes | no | noindex/follow/noarchive | no | yes |
| Unlisted | link-based | no | noindex/nofollow | no | no |
| Private | authorized only | no | noindex/nofollow | no | no |
| Missing/expired/inactive | unavailable | no | noindex/nofollow | no | no |

## 9. Sitemap

`renderPublicSitemap()` now includes only unique public Spaces whose `indexEligible` flag is true. Homepage remains present. Hash routes, private, unlisted, expired, moderated, placeholder and content-empty records are excluded.

## 10. Robots

Existing `robots.txt` delivery remains unchanged. Page-level robots policy is now centralized in `src/services/pageMetadata.ts`; server-rendered Space policy remains in `functions/src/spaceSeo.ts`.

## 11. Structured data

Structured `WebPage` data is emitted only for eligible public Spaces. It is omitted for public-but-ineligible, unlisted, private, missing and inactive delivery states.

## 12. Open Graph and Twitter

Eligible public Spaces use specific title, creator, canonical URL and large-image card metadata. Protected Spaces use generic non-leaking values. SPA navigation now updates title, description, canonical, Open Graph and Twitter tags consistently.

## 13. Share cards

The existing `/space-cards/{id}` Function remains the authoritative Space-specific social image endpoint. Approved Storage-backed covers are used when safe; the LIEUVA homepage asset remains the fallback. No new image-generation pipeline was introduced.

## 14. Share UX

`src/components/SpaceShareMenu.tsx` is shared by publish success, the normal published viewer and Danny. It supports copy, native share when available, a lazily loaded QR code and an always-readable URL. Escape and outside click close the menu.

## 15. Viewer changes

The visitor header now groups creator identity, Share and Create a Space consistently. Caption terminology changed from “Virtual exhibition” to “Immersive Space”. Existing shared Walk, Overview, Guided Tour, Focus/Smart View, Reset and Artworks systems were preserved.

## 16. Creator attribution

The viewer displays only the publication's existing public creator name. No email, UID, ACL data or private profile field was exposed.

## 17. Creator page decision

Deferred. The repository has no stable public handle, slug-ownership or privacy contract. A creator-page route would therefore create identity and migration risk. Attribution and public Space links are sufficient for WP9.

## 18. Discover architecture

Discover continues to use `GalleryRepository.discover()` and the existing restrained three-card pagination. The repository now fetches a bounded candidate pool, runs one shared eligibility policy before cover downloads, sorts deterministically and returns at most twelve eligible Spaces.

## 19. Eligibility

`src/services/discoverEligibility.ts` requires public visibility, active lifecycle, future expiry, non-placeholder title/creator and at least one visible backed artwork. Optional `discoverEligible: false` is a backwards-compatible moderation override; missing legacy values are evaluated by the deterministic gate.

## 20. Moderation and deindexing

The optional Firestore field `discoverEligible` is parsed without changing the schema contract. `false` suppresses Discover, sitemap and structured data while preserving the existing public identity and direct URL. No rules or indexes are required by this change.

## 21. Internal linking

Discover cards use the existing route helper and public Spaces link back to Create a Space. Share URLs continue to be generated by `galleryShareUrl()`/`spaceCanonicalUrl()`; no hardcoded GitHub Pages public route was introduced.

## 22. DannyHirschArts

Danny remains the authored quality reference and keeps its existing rendering, intro, camera and tour architecture. It now reuses the common share component. Browser QA confirmed a stable final scene, LIEUVA header, controls and mobile layout.

## 23. Mobile

At 390×844 and 360×800, public viewing remained 3D-dominant, the header exposed Share without crowding, the share sheet stayed inside safe viewport bounds, and bottom controls remained usable. Discover remained readable with a large visual card.

## 24. Accessibility

Share has an expanded state and controlled panel, labeled URL field, labeled close control, status text and keyboard Escape support. Interactive targets are at least 44px in the mobile rules. Existing viewer focus and reduced-motion behavior was preserved.

## 25. Telemetry

The existing consent-aware `trackTelemetry()` boundary records `share_action` using only `source`, `visibility` and `operation`. No raw Space ID, title, creator or URL is sent.

## 26. Performance before/after

Before final WP9: total JS gzip 532,450 B; entry 107,755 B; largest lazy JS 180,264 B; CSS 32,412 B. Final: total JS gzip 532,503 B; entry 108,129 B; largest lazy JS 180,266 B; CSS 32,412 B. All warning budgets pass.

## 27. Bundle before/after

QR generation is isolated in a lazy 7.29 kB gzip chunk and loads only after a QR request. The final production build contains 110 transformed modules. No renderer or scene bundle was added to the entry path.

## 28. Visual refinement

The shared panel uses the existing dark LIEUVA surface, acid primary action, restrained borders, compact typography and responsive full-width mobile placement. Viewer hierarchy remains scene first, controls second, sharing tertiary.

## 29. Browser QA

Verified locally in the connected browser at 1440×1000, 1920×1080, 390×844 and 360×800: homepage, Discover, public viewer, protected private route, Danny, share panel, QR generation and responsive controls. Discover no longer showed the confirmed placeholder publications. One old malformed public fixture remained directly reachable with incomplete artwork media; it is correctly excluded from Discover. Local Vite cannot reproduce server-injected clean-route metadata/404 behavior, so those cases are covered deterministically by Functions tests and require deployed verification.

## 30. Tests

- `npm run check`: PASS — lint, 35 test files / 233 tests, production build.
- `npm run check:functions`: PASS — 5 files / 37 tests and TypeScript build.
- `npm run test:release-gate`: PASS — 8 files / 71 tests.
- `npm run check:performance`: PASS.
- New regression coverage: Discover eligibility, SPA metadata privacy/indexing, server moderation/placeholder/content-empty noindex and sitemap exclusion.

## 31. Files changed

`functions/src/index.ts`, `functions/src/spaceSeo.ts`, `functions/src/spaceSeo.test.ts`, `package.json`, `package-lock.json`, `src/App.tsx`, `src/components/SpaceShareMenu.tsx`, `src/services/discoverEligibility.ts`, `src/services/discoverEligibility.test.ts`, `src/services/firebaseGalleryRepository.ts`, `src/services/galleryRepository.ts`, `src/services/galleryValidation.ts`, `src/services/pageMetadata.ts`, `src/services/pageMetadata.test.ts`, `src/styles/global.css`, and this evidence file.

## 32. Intentional AURA/legacy references

Final source and built searches were performed. Remaining references are compatibility-sensitive Firebase project IDs, callable names, environment names, IndexedDB/local-draft prefixes, `.aura.json` export format, GLB metadata keys, internal CSS selectors, historical audit evidence, and asset filenames. The public legal-license link still points to the repository source document. Built user-facing metadata and rendered brand labels are LIEUVA; `aura-*` built occurrences are internal selectors or asset paths, not visible copy. No blind rename was performed.

## 33. Remaining risks

- Existing malformed public fixtures require owner cleanup or a later moderation operation; WP9 hides them from curation but does not alter user data.
- Client and Function eligibility rules intentionally mirror each other and should be changed together.
- Social networks cache cards; post-deploy validation must use fresh crawler requests.
- Native Share requires secure-context/browser support; copy and QR remain fallbacks.

## 34. Deployment requirements

Deploy Hosting plus `spaceDocument`, `spaceCard` and `spaceSitemap` through the existing workflow. No Firestore rules, Storage rules, indexes, data migration, DNS change or new secret is required. After deploy, verify clean Space HTML, sitemap, private/unlisted leakage prevention and share cards against `https://lieuva.com`.

## 35. Crawler and social validation

Classification: implementation and deterministic policy are **IMPLEMENTED**; local browser and automated behavior are **VERIFIED LOCALLY**; Firebase Hosting/Functions HTML is **REQUIRES DEPLOYMENT**; canonical discovery and sitemap ingestion are **REQUIRES SEARCH ENGINE**; Open Graph card refresh is **REQUIRES SOCIAL CRAWLER**; native share and physical touch ergonomics are **REQUIRES REAL DEVICE**.

