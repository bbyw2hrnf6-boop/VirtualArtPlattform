# LIEUVA compatibility-first rebrand implementation

**Work package:** WP4  
**Date:** 2026-08-23  
**Verdict:** **PASS WITH CONDITIONS**  
**Boundary:** visible product rebrand only; no deployment, data migration, route migration, dynamic metadata, pricing, analytics, or WP5 work.

## 1. Rebrand scope

WP4 replaces the current customer-facing AURA identity with **LIEUVA** while preserving the established AURA/gallery technical contracts. The implementation covers the global shell, landing page, Emil Scroll chrome, template picker, Studio, published visitor experience, Discover, account/access/data-rights UI, repository-controlled email templates, browser/PWA identity, global metadata, error/empty/loading text, accessibility names, and current operational documentation.

The product category and claim are unchanged from the frozen WP3 contract:

- **Immersive 3D presentation platform**
- **Give your work a place.**

WP4 deliberately does not implement clean URLs, per-Space server metadata, SSR/edge delivery, or dynamic social cards. Those remain WP5.

## 2. Brand source of truth

`src/config/brand.ts` is the single client source for the reusable visible product name, category, claim, description, supporting statement, exact hero copy, primary/secondary CTA, and preview label. `productTitle()` creates consistent browser titles.

Firebase Functions remain a separate TypeScript build boundary, so `functions/src/index.ts` supplies the same visible name to the existing email-template abstraction without importing client code across package boundaries. The internal `AuraMailBrand` type name was intentionally retained.

The exact approved homepage copy from `audit/LIEUVA-BRAND-CONTRACT.md` is used; no new positioning decision was introduced.

## 3. Customer-facing surfaces changed

### Global shell and landing

- LIEUVA wordmark, `L` monogram, home/help labels, loading/errors, header, footer, copyright, Light Preview status, navigation, and CTA labels.
- New first-viewport positioning block with the approved category, H1, two-sentence hero copy, `Create a Space`, and `Explore the demo` hierarchy.
- Emil Scroll visible chrome and completion copy use LIEUVA/Space language; its sequence and architecture were not redesigned.
- Product proof, templates, DannyHirschArts case, use cases, preview-plan copy, FAQ, Discover, and closing CTA now use the frozen terminology.

### Studio and publishing

- Template picker and browser title use `Create a Space | LIEUVA`.
- Header and project identity use Project/Creator where editable work is meant; published outcomes use Space.
- Studio, Walk Preview, review/publish/update states, publish success, share copy, validation, repository errors, local recovery, and empty states no longer expose AURA branding.
- The customer-facing account-export filename is now `lieuva-account-data-YYYY-MM-DD.json`; its embedded legacy schema identifier remains unchanged.

### Published visitor and Discover

- Visitor page titles, LIEUVA home label, Space controls, Focus view, Guided tour sentence case, intro/error/access copy, directory states, and permanent demo attribution are rebranded.
- Discover says Spaces and Creators where generic product terminology is intended. Contextual art/exhibition wording remains in the art beachhead and DannyHirschArts reference case.

### Account and data rights

- Account identity, sign-up/sign-in, LIEUVA Preview Letter consent, owned/shared Spaces, invitations, roles, visibility/lifecycle, access management, export, deletion, auth action pages, and data-rights copy use LIEUVA terminology.
- WP2 authorization, export contents, deletion flow, reauthentication, and cleanup behavior were not changed.

## 4. Terminology changes

The implementation follows the WP3 language contract:

| Old visible term | Current visible term | Scope |
|---|---|---|
| AURA | LIEUVA | customer-facing brand |
| Builder | Studio | product creation environment |
| Room/gallery as generic product object | Space | published or visitable outcome |
| Draft room | Project | editable work/state |
| Artist as generic account role | Creator | generic identity/attribution |
| Smart View | Focus view | visitor control |
| Guided Tour | Guided tour | sentence case |
| Your/My rooms | Your/owned/shared Spaces | account management |

Gallery, room, exhibition, artwork, and artist remain where they describe a real architectural/art context, the DannyHirschArts case, or internal domain contracts.

## 5. Brand assets changed

- `public/favicon.svg` now uses an `L` monogram.
- `src/components/Logo.tsx` and the existing CSS wordmark system render LIEUVA with the same established premium visual language.
- `public/site.webmanifest` uses LIEUVA name, short name, and description.
- Current licensing/provenance documents use LIEUVA while explicitly retaining legacy asset filenames.

No unsupported logo system was invented. The typographic `L` monogram is the approved fallback until final external logo/app-icon/social-card assets are supplied. `public/assets/demo/aura-hero-gallery.webp` remains at its compatibility-sensitive path and is still the global social image.

## 6. Metadata and PWA changes

`index.html` now contains LIEUVA title, description, canonical brand wording, Open Graph site/title/description/image alt text, Twitter metadata, and WebApplication JSON-LD. The canonical root is `https://lieuva.com/`.

The manifest install identity is **LIEUVA — Immersive 3D presentation platform**. Runtime titles use `productTitle()` for landing, picker, Studio, demo, published Space, account, data-rights, auth-action, and not-found states.

The existing hash/static architecture remains. Per-Space metadata and clean URLs are not claimed and remain WP5 work.

## 7. Email changes

Repository-controlled verification, welcome/Preview Letter, and unsubscribe responses now use:

- LIEUVA wordmark and `L` monogram;
- LIEUVA subjects, preheaders, body language, CTAs, footer identity, and data-rights references;
- Project/Space/Studio terminology;
- the existing trusted Functions and consent flow.

No separate invitation or lifecycle email-template system exists in the current repository; therefore none was fabricated in WP4. Existing callable names, mail collection behavior, and Function parameters remain unchanged.

## 8. Accessibility changes

- Logo/home accessible names are LIEUVA.
- Browser/document titles expose LIEUVA.
- Space controls, Focus view, Guided tour, Creator fields, account dialog labels, access states, error text, and image alt text match the visible terminology.
- The new hero has a labelled H1 section and preserves the existing skip-link/focus system.
- Browser accessibility-tree inspection found the expected heading order and button names on landing, Studio, account, and the DannyHirschArts visitor route.

## 9. Technical legacy identifiers intentionally preserved

The compatibility firewall remains intact. Confirmed preserved contracts include:

- Firebase project `virtualartplattform`;
- Firestore collections such as `galleries`, `galleryArtworks`, `galleryInvites`, and their document/subcollection shapes;
- Storage paths under `published/` and existing asset URLs;
- callable names including `beginAuraGalleryPublication`, `abortAuraGalleryPublication`, `manageAuraGalleryLifecycle`, invitation endpoints, `exportAuraAccountData`, and `deleteAuraAccount`;
- Function parameter names `AURA_PUBLIC_APP_URL`, `AURA_REPLY_TO`, and `AURA_LEGAL_FOOTER`;
- IndexedDB `aura-gallery-editor`;
- localStorage prefixes `aura-gallery-project-v2:` and `aura-gallery-draft-v1:`;
- `.aura.json`, `aura-gallery-export`, and `aura-account-export` schema compatibility;
- existing IDs, hash routes, share URLs, ACL/invitation contracts, and legacy readers;
- GLB/Blender `aura_*` metadata and export contracts;
- internal Gallery types, function/type names, package names, CSS class names, and compatibility-sensitive asset filenames.

No database, Storage, URL, ID, schema, or deployment migration was performed.

## 10. Compatibility tests

`src/config/brand.test.ts` adds three deterministic gates:

1. the frozen LIEUVA positioning is exported from one client source;
2. the enumerated customer-visible source set contains no `AURA`, `Aura`, `Virtual Art Platform`, `Smart view`, `Create a gallery`, `Your rooms`, or `My rooms` regressions;
3. required AURA-era persistence, export, callable, collection, Function-parameter, and Storage contracts are still present.

Existing persistence, legacy localStorage/IndexedDB recovery, publication/update, share URL, ACL/invitation, account export/deletion, media, Danny lighting, visitor keyboard, runtime quality, and Emil Scroll model tests all remain green.

## 11. Visible legacy-brand scan results

**Result: zero unintended customer-visible AURA occurrences in the current scanned runtime/email/PWA/metadata sources.**

The automated scan covers the app shell, logo/error boundary, account/auth/access, Visitor controls, Gallery scene, demo data, landing/Emil copy, repository/action/publishing errors, Functions email/output copy, global HTML metadata, manifest, and favicon.

A repository-wide `AURA|Aura|aura` scan still returns intentional matches. They fall into the protected/internal or historical categories listed in section 14; none is an unintended current UI label.

## 12. Test and build results

Final verification on 2026-08-23:

| Command/check | Result |
|---|---|
| `npm run lint` | PASS |
| `npm test -- --run` | PASS — 26 files, 174 tests |
| `npm run test:release-gate` | PASS — 8 files, 71 tests (subset re-run) |
| `npm run build` | PASS — TypeScript + Vite production build |
| `npm run check:functions` | PASS — 3 files, 20 tests + Functions TypeScript build |
| `git diff --check` | PASS |

Unique automated tests in the full root and Functions suites: **194/194 passed**. The 71 release-gate tests are already part of the 174 root tests and are reported separately only because WP4 required an explicit WP1 re-run.

Browser QA:

- normal Chrome/Computer inspection: landing, Studio, account dialog, and DannyHirschArts visitor experience rendered with LIEUVA identity and working 3D on the local dev server;
- 1440×1000: landing and template picker visual captures checked;
- 390×844 using an exact CDP device-metrics override: landing, picker, account dialog, Studio/fallback, and Danny visitor fallback checked; rebrand-related overflow/clipping was corrected;
- the headless browser intentionally had WebGL disabled and logged expected Three.js context errors; the product displayed its text-first fallback. Normal Chrome rendered the 3D demo successfully. No unrelated runtime exception was observed in the normal Chrome pass.

## 13. External configuration still required

WP4 changed repository code only. Before calling the production rebrand externally complete:

1. deploy the site and the changed Functions through the existing approved workflow;
2. set legacy-named `AURA_PUBLIC_APP_URL` to `https://lieuva.com`, `AURA_REPLY_TO` to a monitored LIEUVA address, and `AURA_LEGAL_FOOTER` to final legal sender details;
3. verify the LIEUVA sender/domain with the email provider and confirm SPF, DKIM, DMARC, reply-to, delivery, unsubscribe, Gmail, and a second provider;
4. confirm Firebase authorized domains, verification/action URLs, fallback Auth sender/name, and Google OAuth consent branding for `lieuva.com` and `www.lieuva.com` while retaining the GitHub Pages origin;
5. confirm reCAPTCHA Enterprise/App Check domain coverage for LIEUVA and the retained origin;
6. replace placeholder operator/privacy/imprint/terms information after legal approval;
7. provide final production logo/app-icon/social-card assets if the typographic fallback and current social image are not final;
8. clear/refresh deployment and social-card/PWA caches after release.

`FIREBASE_SETUP.md` records the current LIEUVA values while warning that the AURA-named Function parameters remain contracts.

## 14. Remaining known AURA occurrences and why each is legitimate

| Category | Examples | Why retained |
|---|---|---|
| Persistence/export | `aura-gallery-editor`, localStorage prefixes, `.aura.json`, embedded export formats | Renaming would strand drafts or break imports |
| Firebase/API | callable/type names, `AURA_*` parameters, gallery collections | Deployed API/data contract |
| 3D pipeline | `aura_role`, `aura_surface_id`, Blender names | Existing GLB metadata contract |
| Internal implementation | Gallery types, `AuraMailBrand`, package names, CSS classes | Not customer-visible; renaming adds risk without product value |
| Asset paths | `aura-hero-gallery.webp`, `aura-*-v*.webp` | Existing references, caches, checksums, and provenance |
| Current compatibility documentation | `AGENTS.md`, `README.md`, `FIREBASE_SETUP.md`, asset/license notices | Explicitly explains why legacy identifiers remain |
| Historical evidence | previous audits and captured QA JSON | Must not rewrite history to erase the old brand |
| Existing stored content | old creator/project text may contain “AURA” | User/data content is not destructively rewritten during a visible rebrand |

The currently deployed production build will continue to show its old branding until a later authorized deploy; this is an external release condition, not a source-code exception.

## 15. Remaining risks

- Production has not been deployed or externally retested in this work package.
- Final logo/app-icon/social-card art and legal sender/operator details may still change.
- Static hash-route metadata is globally correct for LIEUVA but cannot identify individual public Spaces; WP5 is still required.
- Existing stored free-text/sample data can retain historical AURA values until deliberately edited or migrated under a separate safe plan.
- Headless WebGL was unavailable, so exact 390×844 3D rendering was verified through the existing fallback; normal Chrome verified the live 3D route at desktop size.
- External email/Auth/App Check/OAuth branding requires console/provider verification after deployment.

## 16. Verdict

**PASS WITH CONDITIONS.** WP4 is complete locally: the current product surfaces, controlled emails, metadata/PWA identity, accessible names, and current guidance use LIEUVA; the visible-brand scan and complete automated suite pass; and migration-sensitive AURA/gallery contracts remain intact.

The conditions are deployment plus external email/Auth/App Check/legal/asset verification. The repository is ready for WP5, but WP5 must not start automatically and must preserve the compatibility firewall documented here.
