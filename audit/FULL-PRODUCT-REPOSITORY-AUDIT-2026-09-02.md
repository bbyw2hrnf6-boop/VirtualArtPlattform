# LIEUVA — Full Product & Repository Audit

**Audit date:** 2026-09-02<br>
**Repository state:** `main` at `24c021a`<br>
**Public surface:** [lieuva.com](https://lieuva.com/)<br>
**Mode:** diagnosis only; no product, data, or infrastructure fixes were applied

## Post-audit WP1 update — 2026-09-02

The numbered findings below remain the immutable diagnosis snapshot. After that
audit, WP1 engineering containment was executed: known fixtures were backed up
and removed from discovery without deletion; explicit reviewed-content gates,
strict Firestore rules, three required indexes, separated editorial previews,
Creator-post report intake, and bounded operator tools were implemented. Hosting
and 20 scoped Functions are live; production smoke checks show zero live
Creators/Spaces and a sitemap containing only `/` and `/creators`.

This closes the engineering containment portion of L02/SEO02 and repairs the
calendar failure in R01, but it does **not** complete WP1. Real controller/contact,
retention, governing-law/age, named moderation ownership, coverage, and accepted
response targets still require owner input and qualified legal review. Durable
full-Space holds, external notice/appeal delivery, automated alerts, and trusted
upload scanning remain no-go gates for unrestricted public uploads. Current
evidence and the precise input checklist are in
`audit/WP1-LEGAL-MODERATION-OPERATIONS-DESIGN.md`.

## 1. Executive assessment

LIEUVA has a strong product core. The visual identity is coherent, the Studio is materially more complete than a prototype, the visitor experience has a useful accessible alternative to the 3D canvas, and the Firebase boundaries show deliberate security work. The project is credible for a controlled, founder-supported pilot.

It is **not ready for an unrestricted public beta**. The main blockers are operational rather than a single catastrophic code defect:

1. The live product explicitly says that its controller identity, rights contact, retention policy, privacy policy, and terms are unfinished.
2. Production discovery and the XML sitemap currently expose test/demo content and a test creator. Reporting exists, but no moderation processing or operator workflow was found.
3. The release gate is broken today because a test fixture expired on 2026-09-01.
4. Performance budgets are exceeded but are warning-only, so the deployment pipeline still accepts the regression.
5. The repository's supposed operational context is stale, contradictory, and in one case corrupted by a 686-line pasted prompt.

No critical exploitable vulnerability was proven in this read-only audit. That is not a penetration-test result. The principal risk is opening a user-upload/community product before its legal, moderation, release, rules-testing, and data-lifecycle controls are demonstrably operable.

| Area | Current assessment | Production implication |
| --- | --- | --- |
| Product concept and visual quality | Strong | Preserve; this is the clearest asset. |
| Studio and visitor experience | Good controlled-pilot quality | Complete real-device, account, and adverse-state validation. |
| Open public launch | Not ready | P0 legal, content, moderation, and release blockers remain. |
| Security architecture | Deliberate but incompletely proven | Good boundaries; add rules tests, trusted schema enforcement, and scalable lifecycle jobs. |
| Performance | Over current budgets | The entry path is too heavy and the gate does not enforce its own limits. |
| SEO foundation | Technically good, operationally unsafe | Metadata is strong; the live indexed corpus is test data and no search footprint was observed. |
| Maintainability | Fragile at current module sizes | Split along existing domain boundaries after stronger gates exist. |
| Repository/AI context | Poor | Historical evidence dominates the checkout and current instructions contradict reality. |

### Launch recommendation

- **Controlled pilot:** conditionally continue with named operators, known participants, manual content review, and no claim of production/legal completeness.
- **Unrestricted public beta:** no-go until P0 is closed and the P1 release/security gates pass in staging and production.

## 2. Method and evidence limits

The audit combined:

- full repository inventory and targeted source tracing;
- a clean production build, client lint/tests, Functions tests/build, and production dependency audits;
- desktop and responsive mobile product inspection through Chrome using Computer Use, against the local production preview;
- current public HTTP, metadata, robots, sitemap, directory, headers, and search-footprint checks;
- review of Firebase Hosting, Functions, Firestore, Storage, CI, cleanup, account rights, and SEO delivery paths.

Evidence labels used below:

- **Verified:** reproduced in the build/product/public site or directly established in source/configuration.
- **Likely risk:** the code/configuration creates a credible failure mode, but the failure was not induced against production.
- **Opportunity:** quality improvement rather than a current defect.
- **Intentional trade-off:** a reasonable choice whose consequences should remain explicit.

Important limits: no live data was mutated; destructive account flows were not executed; signed-in collaboration/auth-provider journeys were not fully re-run; no real iOS/Android hardware, screen reader, hostile-client, load, or penetration test was performed. Warm Gallery and Grand Forum were inspected in the picker and source but were not each given a fresh end-to-end build/publish pass. Archived Lighthouse reports are historical evidence, not a current quality gate.

## 3. Strengths to preserve

- The LIEUVA editorial identity, typography, motion, room language, and restrained interaction patterns feel like one product.
- Studio covers the real workflow: template choice, draft recovery, autosave state, artwork editing, placement, undo, pre-publish validation, cover preview, access/distribution controls, and a separate Walk Preview.
- Responsive Studio tooling works at 390×844 with peek/half/full tool-sheet states; the visitor gets touch navigation rather than a desktop-only canvas.
- Danny's visitor experience combines a cinematic room with a crawlable, keyboard-accessible artwork directory containing full metadata.
- Dialog focus recovery was observed working; the publish review returned focus to its trigger after Escape.
- Firebase callables enforce App Check; trusted collections deny direct client access; Storage rules bound ownership, ACL, MIME, and size; publication uses transactions; client reads validate strictly.
- Renderer lifecycle cleanup, persistence, adaptive quality, and reduced-motion intent are substantial rather than cosmetic.
- Account deletion keeps Firebase Auth deletion last, reducing partial-deletion lockout risk.
- Public clean URLs, canonicals, Open Graph/Twitter metadata, structured data, robots handling, noindex behavior for non-public placeholders, HSTS, and baseline security headers are already present.
- Runtime assets in `public/assets` are referenced, asset provenance documentation is unusually explicit, the Git worktree started clean, and no secrets/build outputs/dependency trees are tracked.
- Root production dependency audit reported zero vulnerabilities; the standalone client build and all 52 Functions tests passed.
- Preserve the compatibility firewall in `AGENTS.md:3-5`: legacy `AURA` collection names, IDs, Storage paths, callable names, local keys, `.aura.json`, routes, and GLB metadata are contracts, not cosmetic naming debt.

## 4. Findings

### A. Launch, legal, trust, and public content

| ID | Finding and evidence | Why it matters | Priority / direction |
| --- | --- | --- | --- |
| L01 | **Verified:** the live Data & Rights copy admits that complete terms, controller details, rights inbox, postal address, retention decision, privacy policy, and guarantees are unfinished (`src/App.tsx:704-709,803-810`). | This is a user-upload, account, newsletter, and public-publishing service. Its own product copy says the production governance layer is absent. | **P0, M, owner/legal dependency.** Keep pilot-only; name controller/operator, rights channel, retention/backups, terms, privacy policy, subprocessors, incident and deletion commitments before open registration. |
| L02 | **Verified:** on 2026-09-02 the live sitemap advertised `admin-newlighttest`, `admin-test-iphone-test`, three `aura-sample-collection-field-studies` Spaces, and `skippertestadmin`; `/creator-directory.json` returned only “SkipperAdmin” with bio “test Bio admin 001”. The public `/creators` UI also showed junk-like live Spaces beside five hard-coded editorial demo creators. | Search engines and first visitors see internal fixtures as the public catalogue. This damages trust and makes launch metrics/content claims meaningless. | **P0, M, production-data access.** Quarantine/delete fixtures after backup, separate a clearly labelled sample showcase from live community data, and require an explicit production publication/moderation state. |
| L03 | **Verified:** report submission only creates an open `creatorReports` document (`functions/src/index.ts:689-702`); no processor, review queue, SLA, escalation, takedown, or operator workflow was found. Upload trust is primarily client re-encoding plus declared MIME/size rules (`storage.rules:16-36,112-151`). | A report button is not a moderation system. Unrestricted public uploads create abuse, illegal-content, malware/provenance, and response-time obligations. | **P0 for open beta, L.** Define policy and operators; build an auditable queue, content state transitions, takedown/appeal path, trusted image decode/inspection, rate limits, and incident runbook. A curated pilot can use a documented manual version first. |
| L04 | **Verified:** five editorial creator fixtures with synthetic follower/reaction counts are intentionally merged into the creator experience (`src/features/creator/demoCreators.ts:39-80`), while the directory says “Public profiles only” (`CreatorDirectoryPage.tsx:240`). | The fixtures are useful to demonstrate the product, but mixing them with real public accounts obscures what is live and distorts perceived community activity. | **P1, S.** Put samples in a distinct “Editorial preview” section/mode, exclude them from live counts/search claims, and make the empty real-community state honest. |

### B. Product and UX: desktop, mobile, accessibility

| ID | Finding and evidence | Why it matters | Priority / direction |
| --- | --- | --- | --- |
| UX01 | **Verified observation:** the mobile landing story at 390×844 opens with a very large dark/empty vertical interval before the first strong headline; the compact header's Create action carries most of the conversion load. | A first-time mobile visitor can interpret the opening as unfinished or fail to reach the value proposition. | **P1, M.** Recompose the first mobile viewport, provide an immediate product/value cue, and test completion/CTA engagement without weakening the desktop story. |
| UX02 | **Verified observation:** mobile Walk Preview works, but bottom toolbar labels truncate (`Guided t…`, `Focus vi…`, `Reset vi…`) and the directional pad competes with artwork/content. | Core controls become harder to identify on the most constrained viewport. | **P2, S.** Use icon-plus-accessible-name controls or a compact overflow, respect safe areas, and dynamically reserve canvas space for navigation. |
| UX03 | **Verified observation:** Chrome reported 13 form fields without `id`/`name` and three lazy images without explicit dimensions/aspect ratio. No console errors appeared in the inspected flows. | Missing field identity weakens autofill/automation and can affect accessible form relationships; missing dimensions invite layout shift. | **P1, S.** Give every input stable identity/autocomplete semantics and reserve image geometry. Add automated axe/form and CLS assertions. |
| UX04 | **Verified:** the runtime product calls technical template `nocturne` “Warm Gallery” (`src/features/gallery/templates.ts:66`), but README and status context still call it Nocturne (`README.md:19`, `audit/IMPLEMENTATION-STATUS.md:85`). | Creator-facing language and agent instructions disagree, causing support, copy, and implementation drift. | **P1, S.** Standardize user-facing copy as Warm Gallery while explicitly retaining the technical ID `nocturne`. |
| UX05 | **Evidence gap:** account creation/provider failures, invite acceptance/revocation across real accounts, private/unlisted access, permanent deletion, low-memory recovery, all three templates, reduced motion, and screen-reader behavior were not all revalidated end-to-end in this audit. | These are high-risk journeys hidden by a good happy-path experience. Existing source tests and old screenshots do not replace current user-level proof. | **P1, M.** Create a browser/device matrix with seeded accounts and test create → recover → publish → share/access → edit/revoke → export/delete. Include keyboard, screen reader, reduced motion, slow network, WebGL failure, and real iOS/Android. |
| UX06 | **Opportunity:** undo after a field edit also cleared the selected-artwork context in the observed Studio flow. | The state change is not destructive, but it interrupts rapid editing and makes undo feel broader than the user's last action. | **P3, S.** Define whether selection is history or view state; normally preserve selection across content undo when the entity still exists. |
| UX07 | **Verified:** several mobile hit areas are below the project's own 44×44 minimum: 36×36 movement buttons (`scrollGalleryStory.css:505-518,654-677`), an approximately 44×18 Search control, 12 px-high “Open full room” link area, and 31 px-high “Enter now” in the inspected 390×844 runtime. | Small targets cause missed input and fail the intended WCAG 2.5.8/mobile ergonomics baseline. | **P1, S.** Give every actionable control at least a 44×44 CSS hit box without visually inflating the composition; test portrait and landscape. |
| UX08 | **Verified:** mobile Walk movement buttons handle pointer down/up/cancel but no keyboard activation (`src/features/gallery/VisitorControls.tsx:169-183`). The visible “Artworks” control has accessible name “Open artwork list, 7 works” (`:142-155`), so the visible label is absent from its accessible name. | Keyboard/switch users cannot operate equivalent movement; the label-in-name mismatch can break voice control. | **P1, S.** Share pointer/keyboard movement semantics and make the accessible name begin with “Artworks”. Add keyboard and speech-label assertions. |
| UX09 | **Verified:** landing story H2 chapters precede the page's only H1 in DOM order (`src/App.tsx:570-595`; `ScrollGalleryStory.tsx:1007-1047,1120-1124`). Small editor text measured 3.63:1 and 3.99:1 contrast at 12 px and 8 px respectively (`src/styles/global.css:7,146`). | The heading outline is confusing to assistive navigation, and normal-sized text falls below the 4.5:1 AA target and the project's 12 px minimum. | **P2, S.** Put the route H1 first, normalize heading levels, and raise size/contrast tokens; verify at 200% zoom and high contrast. |

### C. Release, testing, deployment, and developer experience

| ID | Finding and evidence | Why it matters | Priority / direction |
| --- | --- | --- | --- |
| R01 | **Verified:** `npm run check` ran 377 tests: 375 passed and 2 failed at `firebaseGalleryRepository.releaseGate.test.ts:424,486`. The mock creates invites expiring at fixed `2026-09-01T10:00:00Z` (`:200-207`), while setup uses real `Date.now()` (`:343`) and production correctly filters expired invites (`firebaseGalleryRepository.ts:995-1006`). CI deploy calls this gate (`.github/workflows/deploy.yml:29`). | The deploy gate fails because of calendar time, not a proven production invite defect. A deterministic test suite that breaks the day after release cannot protect production. | **P0, S.** Freeze/inject the clock and express expiry relative to it; keep the production filter. Add a regression test that advances the fake clock intentionally. |
| R02 | **Verified:** the only CI gate runs on `main` push/manual dispatch (`deploy.yml:3-6`), coupled to production deployment. There is no pull-request workflow. | Defects land on main before the first automated gate; a red test then blocks deployment rather than preventing merge. | **P1, S.** Add PR CI for lint, unit/integration tests, Functions build/tests, strict budgets, and rules tests; deploy only a previously green immutable revision. |
| R03 | **Verified:** root `vitest run` has unrestricted discovery (`package.json:11`). Locally it picked up 48 client files, six `functions/src` files, and six generated ignored `functions/lib` files, then Functions tests ran again. `functions/tsconfig.json:12-14` emits source maps and compiles tests into deploy output; no `.firebaseignore` exists. | Local/CI discovery can differ, stale generated tests can run, and test files/maps can enter the upload package. | **P1, S.** Define explicit client/Functions Vitest roots and exclusions; use a production Functions tsconfig that excludes tests; add an upload ignore file and inspect a dry-run manifest. |
| R04 | **Verified:** 68 of 273 client tests in 11 files assert raw source strings through `?raw`; no coverage provider/threshold or component/browser suite is in CI. Ten audit browser scripts are not wired into package scripts and assume local ports; one hard-codes a user Playwright cache path (`audit/final/scroll-story-pipe-qa.mjs:8`). | The suite is broad, but many tests prove text presence rather than behavior. The highest-value user journeys remain manually evidenced. | **P1, M.** Keep useful domain tests, replace brittle source assertions with rendered/integration behavior, establish risk-based coverage, and turn a small portable browser suite into a real release gate. |
| R05 | **Verified:** missing mail variables are written as empty strings (`deploy.yml:33-39`); server validation rejects placeholders but not empties (`functions/src/index.ts:136-139`). Missing `VITE_FIREBASE_APPCHECK_SITE_KEY` silently disables client App Check (`src/services/firebase.ts:24-35`) while callables require it. The deploy uses `firebase-tools@latest` and static service-account JSON (`deploy.yml:40-56`). | A syntactically successful deploy can ship broken email/callable behavior; unpinned tools and long-lived credentials reduce reproducibility and supply-chain assurance. | **P1, S-M.** Fail preflight on all required values, smoke-test callables, pin the CLI/action revisions, and migrate to short-lived Workload Identity Federation. |
| R06 | **Intentional trade-off with unproven parity:** production deploys Hosting and Functions only (`deploy.yml:45-56`); Firestore/Storage rules and indexes are manual. There are no emulator rules tests. | Manual approval can be sensible, but current code, deployed rules, and indexes can drift without executable proof. | **P1, M.** Add emulator tests and version/parity checks; promote reviewed rules/indexes through a separately approved job. |
| R07 | **Verified:** CI runs root and Functions gates, then Firebase predeploy repeats the root build and Functions check; combined deploy invokes the root build twice (`firebase.json:5-8,19-21`). | Releases are slower and harder to reason about, encouraging bypasses. | **P2, S.** Retain safe direct-CLI predeploy behavior, but make CI call one canonical build/gate path and deploy its artifacts. |

### D. Security, backend integrity, privacy lifecycle, and scale

| ID | Finding and evidence | Why it matters | Priority / direction |
| --- | --- | --- | --- |
| S01 | **Verified:** Firestore rules explicitly defer artwork geometry to the client (`firestore.rules:72-75`) and validate only bounded list/count envelopes (`:110-115,139-159`). | A permitted custom client can publish malformed artwork/decor maps that strict readers later reject. Authorization is present; schema integrity is incomplete. | **P1, L.** Move final publication manifest creation through a trusted Function, or enforce a bounded item schema server-side/rules-side while preserving legacy readers. |
| S02 | **Likely risk:** account export/deletion loads unbounded histories (`functions/src/index.ts:965-1017,1088-1120`), places all owned Spaces in one Firestore batch (`:1163-1172`), then deletes cross-service resources sequentially (`functions/src/accountDataRights.ts:192-219`) within a finite function run. | Larger/older accounts can exceed Firestore's 500-operation batch limit, memory/response limits, or timeout, leaving partial rights fulfillment. | **P1, L.** Paginate exports, chunk batches, use resumable/idempotent jobs with checkpoints, expose status, and verify retries/partial failures. |
| S03 | **Verified:** expired-gallery cleanup reads/deletes at most 100 invites, then deletes the gallery (`scripts/cleanup-expired.mjs:202-210`). | Galleries with more invites can leave orphaned top-level invite PII after the parent disappears. | **P1, S.** Page until empty, make cleanup idempotent, and test over-limit and interrupted runs. |
| S04 | **Verified:** newsletter unsubscribe changes state on GET and its token has no expiry (`functions/src/index.ts:1604-1661`). | Email security scanners and link prefetchers can unsubscribe users; leaked old links remain usable indefinitely. | **P1, M.** Use a non-mutating confirmation GET plus explicit POST, or carefully implement one-click semantics with expiry, rotation, and scanner-safe behavior. |
| S05 | **Verified:** following/reactions can repeatedly generate alerts (`functions/src/index.ts:556-588,747-770`); no dedupe/rate-control layer was found. | Toggle abuse can create notification spam and write/cost amplification. | **P2, M.** Add idempotency/dedupe windows, per-actor rate limits, notification aggregation, and abuse telemetry. |
| S06 | **Verified:** Creator Hub home can fan out across up to 50 creators and then fetch up to 100 galleries and 12 posts for each (`functions/src/index.ts:222-291,831-860`); directory and sitemap cap silently at 500 (`:1799-1822,1980-2027`). | Latency, timeout, and Firebase read cost scale poorly; content eventually disappears beyond hard caps. | **P2, L.** Materialize/paginate feeds, add cursors and bounded fan-out, and monitor read/latency budgets. |
| S07 | **Verified:** Functions production audit reports seven moderate transitive advisories around `uuid@9.0.1`; root production audit reports zero. | The current exploitability was not proven, but knowingly stale transitive dependencies enlarge supply-chain risk. | **P2, S-M.** Upgrade supported Firebase/Google packages, re-audit and regression-test; do not accept the audit tool's breaking downgrade-style force fix blindly. |
| S08 | **Opportunity:** Hosting supplies HSTS and useful baseline headers but no Content Security Policy (`firebase.json:108-137` and current live headers). | CSP would limit the impact of a future injection bug in an account/public-content product. | **P2, M.** Start with report-only CSP and telemetry, enumerate Firebase/asset requirements, then enforce without unsafe broad allowances. |
| S09 | **Verified, low impact:** public image/card HEAD handlers fetch full Storage bodies before omitting the response body (`functions/src/index.ts:1832-1883,1929-1969`). | Health checks/crawlers can cause unnecessary bandwidth and function work. | **P3, S.** Use object metadata/range-aware handling for HEAD. |

### E. Performance and asset delivery

| ID | Finding and evidence | Why it matters | Priority / direction |
| --- | --- | --- | --- |
| P01 | **Verified:** the fresh production build passed, but entry JS was 295,799 B gzip against a 115,000 B budget; total JS 567,364 against 560,000; CSS 52,837 against 43,000. The checker only exits non-zero when `LIEUVA_STRICT_PERFORMANCE_BUDGET=1` (`scripts/check-performance-budgets.mjs:31-46`), which CI does not set. | The landing route pays for too much application/editor code, especially on mobile, and the declared guardrail does not guard releases. | **P1, L.** Split landing, directory/profile, Studio, account, and visitor route shells; defer editor/account/Firebase work; set route-level budgets and enforce them in PR/staging. |
| P02 | **Likely production defect:** all `/assets/**` get `max-age=31536000,immutable` (`firebase.json:139-146`), including stable non-hashed GLB/WebP URLs used by `GalleryScene.tsx:208-228,6964-6965`. Current live Danny GLB headers confirmed the one-year immutable cache. | Replacing bytes at a stable URL can leave repeat visitors with an old room/model for a year. | **P1, M.** Fingerprint versioned assets and update references, or apply shorter revalidation caching to stable paths. Keep long immutable caching only for content-addressed URLs. |
| P03 | **Verified:** the largest built entry chunk was about 997 kB raw/299 kB gzip and another lazy chunk was about 681 kB raw/174 kB gzip; the Danny desktop GLB is about 3.0 MB. Adaptive/mobile assets exist. | The product is graphically ambitious, but low-end devices and first visits remain sensitive to parse, GPU, and network cost. | **P1, M-L.** Measure current LCP/INP/CLS and scene-ready time on low-end profiles; prefetch only after intent; preserve adaptive asset/quality selection and add failure fallbacks. |
| P04 | **Opportunity:** archived August Lighthouse JSON reports good scores, but they are not generated by current CI and predate this code/data state. | Old scores can create false confidence while budgets currently fail. | **P2, S-M.** Generate current repeatable lab evidence for home, directory, Studio shell, and a public Space; complement it with privacy-aware production Web Vitals. |
| P05 | **Verified:** anonymous landing imports creator/account utilities eagerly (`src/App.tsx:91-97`); public profile helpers share a module with Firebase callable imports (`src/services/creatorProfile.ts:1-2,136-186`), triggering Firebase/App Check initialization (`src/services/firebase.ts:1-35`). A cold 390×844 trace transferred about 2.0 MB in six seconds, including roughly 353 kB reCAPTCHA and a 1.0 MB mobile GLB. | Anonymous visitors pay authentication/abuse-prevention cost before protected intent, worsening mobile first load. | **P1, M.** Separate public fetch/types from authenticated callables; initialize Firebase/App Check only at a protected action/route and verify that abuse protection remains enforced there. |
| P06 | **Verified:** reduced-motion is detected (`ScrollGalleryStory.tsx:197-231`) but the landing model load is unconditional (`:415-418`); a reduced-motion cold run still transferred the roughly 1.44 MB mobile GLB despite a static fallback. | Reduced motion changes animation but not network/GPU work, so users asking for less motion still pay the largest visual cost. | **P2, S-M.** Skip the 3D/model path for reduced/static/data-saver modes and render the accessible sequence directly. |

### F. SEO and discoverability

| ID | Finding and evidence | Why it matters | Priority / direction |
| --- | --- | --- | --- |
| SEO01 | **Strength:** current home, creator directory, creator, and eligible Space responses provide server-visible titles/descriptions, canonicals, Open Graph/Twitter data, and structured data. `robots.txt` allows crawl and names a functioning sitemap; placeholder/private/unlisted delivery uses noindex/privacy-aware responses. | The technical foundation is materially stronger than a client-only SPA. Preserve server-rendered metadata and privacy decisions. | Preserve; add regression tests for every visibility state. |
| SEO02 | **Verified:** sitemap eligibility relies partly on narrow title/creator regexes (`functions/src/spaceSeo.ts:17-35`). They miss strings such as `NEWLIGHTTEST`, admin/test handles, and sample collections that were in the live sitemap. | Heuristics cannot replace a trusted editorial/publication state, so internal content becomes canonical and crawlable. | **P0 with L02, M.** Make index eligibility an explicit reviewed production field/state, use heuristics only as a defensive fallback, and purge/request removal of fixtures. |
| SEO03 | **Observed signal, not proof:** a current `site:lieuva.com` search through the available search provider returned no results despite the functioning sitemap. | The site may be new, unsubmitted, low-authority, or excluded; search operators are incomplete and cannot establish exact index coverage. | **P1, S-M after content cleanup.** Verify ownership in Search Console/Bing, submit the clean sitemap, inspect coverage/canonicals/manual actions, request key URLs, and build real creator/exhibition content and internal links. |
| SEO04 | **Likely scaling issue:** creator directory and sitemap queries stop at 500 without pagination (`functions/src/index.ts:1809-1822,1992-2027`). | At scale, valid creators/Spaces can silently vanish from discovery and search. | **P2, M.** Page sitemap indexes and directory APIs deterministically; monitor counts against canonical public records. |
| SEO05 | **Verified:** server policy rejects placeholder starters, while client Discover explicitly accepts “Untitled exhibition”/“Your name” when length/media gates pass (`src/services/discoverEligibility.ts:18-36,50-84`; test `:37-39`). Hydration can rewrite robots (`src/App.tsx:4104-4113`) after the server has already sent a different `X-Robots-Tag` decision (`functions/src/index.ts:1688-1691`). | The same Space can be discoverable/indexable under one layer and excluded under another; crawlers and users can receive conflicting policy. | **P1, M.** Centralize a pure shared eligibility contract, but make a trusted server/editorial state authoritative. Test server header, HTML meta, client state, directory, and sitemap together. |
| SEO06 | **Verified:** indexable responses inject head metadata but leave first-response body as `<div id="root"></div>` (`index.html:43-45`; `functions/src/spaceSeo.ts:226-267`; `creatorIdentity.ts:261-381`). Current live home and Space HTML confirmed the empty body. | Google can render JavaScript, but slower/non-JS crawlers receive no visible H1, description, artwork, creator, or internal links; this weakens discovery and resilience. | **P1, L.** Server-render or prerender concise crawlable route bodies for home, directory, profiles, and public Spaces, then hydrate progressively. Preserve the current privacy/noindex boundaries. |
| SEO07 | **Verified:** default Firebase hosts return indexable 200 HTML; canonical tags mitigate duplication, but host normalization occurs only in client JS (`src/services/spaceRoutes.ts:4-7,62-69`; `src/main.tsx:15-19`). Dynamic Space social cards are about 640×386 and omit explicit OG dimensions. | Duplicate hosts waste crawl signals, and nonstandard/small social cards can render inconsistently. | **P2, S-M.** Add host-level permanent redirects if Firebase permits; otherwise noindex the default hosts at the edge. Generate 1200×630 cards with width/height/type metadata. |

### G. Architecture and maintainability

| ID | Finding and evidence | Why it matters | Priority / direction |
| --- | --- | --- | --- |
| A01 | **Verified:** `src/App.tsx` is 4,398 lines, `GalleryScene.tsx` 7,769, `functions/src/index.ts` 2,036, `AccountDialog.tsx` 1,136, and `firebaseGalleryRepository.ts` 1,079. | Unrelated concerns share change surfaces, increasing regression risk, merge conflict, review load, and AI context cost. | **P1, L-XL after R01-R06.** Extract existing route shells/use cases and renderer systems incrementally behind characterization tests; do not rewrite the 3D engine or rename compatibility contracts. |
| A02 | **Verified:** `src/styles/global.css` is about 92 kB in only 180 physical lines because many rules are densely minified. | Diffs and ownership are hard to review; global cascade risk grows with every feature. | **P2, M.** Format first, split by route/component/theme layers, preserve shared tokens, and add visual regression coverage before changing semantics. |
| A03 | **Opportunity:** creator feed, profile, publishing, account rights, mail, SEO documents, and media proxies share one Functions entry module. | Backend boundaries exist conceptually but not structurally; deployment/testing and cold-path reasoning become coupled. | **P2, L.** Extract pure domain modules/handlers while keeping exported callable and HTTP names stable. |

## 5. Repository cleanup assessment

The checkout is clean in Git terms but not in information architecture:

- 364 tracked files total about **69.2 MB**.
- `audit/` is 133 files/about **33.6 MB**.
- `GPT generated example pictures/` is five files/about **22.9 MB**.
- Those two historical/evidence areas are **81.5% of tracked bytes**; product source is comparatively small.
- There are 36 Markdown files and 7,941 lines of Markdown; audit Markdown alone is 27 files/about 470 kB.

| Action | Candidates | Conditions |
| --- | --- | --- |
| Delete from repository | Five unreferenced files in `GPT generated example pictures/`; the corrupt injected WP16 prompt; ignored/generated `dist`, `functions/lib`, `.firebase`, local `artifacts`, and dependency trees when local space cleanup is desired. | Optionally archive the five images externally first; generated/local items are already ignored. Restore WP16's damaged row from history only if the document is retained. |
| Archive outside default coding context | Superseded WP reports, most historical audit screenshots/JSON, and ad-hoc browser scripts. At least 35 audit images (about 12.7 MB) have no basename reference in tracked text. | Establish an evidence-retention policy; verify legal/provenance and unique decision records before deletion. Release artifacts or a separate archive repository are better homes. |
| Consolidate | Repeated launch/readiness/status reports, duplicate deployment guidance, historical test totals, and old audit backlogs. | Keep one current audit/master backlog and one short current-state document; mark snapshots immutable with date/commit if retained. |
| Retain | `public/assets`, lockfiles, `ASSET_LICENSES.md`, Firebase rules/indexes, Blender export contract/sources with unique provenance, and compatibility guidance in `AGENTS.md`. | All public asset basenames are referenced; legacy AURA identifiers are active contracts. |
| Make portable or remove | Ten audit browser scripts, most tied to CDP 9333/Vite 5174; one contains a user-specific Playwright path. | Promote only a small cross-platform subset into the real test toolchain; archive the rest. |

There were no exact duplicate tracked blobs, no tracked environment secrets, no product-code TODO/FIXME pile, and no broken local Markdown links. Cleanup should therefore focus on stale meaning and evidence volume, not blind deduplication.

## 6. Documentation and AI-context assessment

The current context layer is actively unsafe for future work:

- `README.md:9` points to `audit/LIEUVA-LAUNCH-READINESS-WP16.md`, whose lines 141-826 contain an unrelated 686-line pasted redesign prompt inside a table. The same report describes an older baseline and test count.
- `AGENTS.md:8` calls `UI-UX-3D-AUDIT.md` current, while that file calls itself a before snapshot and carries unfinished AURA-era acceptance boxes. It points to `audit/IMPLEMENTATION-STATUS.md`, which still reports 106 tests.
- README both claims a GitHub Pages workflow exists (`:82`) and later says none exists; only cleanup and Firebase deploy workflows are present. Its material-choice counts are also stale (5/5/3 documented versus 10/10/5 implemented at `src/App.tsx:2604-2717`).
- `audit/FULL-PRODUCT-EXPERIENCE-AUDIT.md:1009,1131-1132` names WP4/WP5 as next even though WP4-WP16 material exists.
- Old reports repeatedly assert point-in-time test totals and “ready” states without binding them to a commit, so they become misinformation.

Recommended minimum operational context:

1. `README.md`: product purpose, five-minute setup, current architecture map, test/build commands, deploy overview, and links to authoritative detail.
2. `AGENTS.md`: compatibility firewall, safety/deploy constraints, source-of-truth map, and concise domain invariants.
3. `FIREBASE_SETUP.md`: environment, emulator, rules/index promotion, deploy and rollback operations.
4. `ASSET_LICENSES.md` and `blender/EXPORT_CONTRACT.md`: provenance and renderer/export contracts.
5. This audit plus one live backlog/status file whose claims are updated by CI or explicitly dated and commit-bound.

Everything else should be either a clearly dated historical snapshot outside default context or removed. “Nocturne” may remain only where it identifies the technical `nocturne` contract; creator-facing documentation should say Warm Gallery.

The repository has asset licensing documentation but no general code license. If the GitHub repository is public or contributions/reuse are expected, the owner should make an explicit license decision; do not infer one from visibility.

## 7. Master backlog

Effort: **S** ≤ a few focused days, **M** roughly one sprint, **L** multiple sprints, **XL** staged architectural program. Estimates assume one engineer with product/owner support and exclude legal review time.

| Priority | Item | Effort | Dependencies | Work Package |
| --- | --- | --- | --- | --- |
| P0 | Fix the expired invite fixture and make all time tests deterministic (R01). | S | None | WP2 |
| P0 | Quarantine/remove production test content; stop fixtures entering directory/sitemap (L02, SEO02). | M | Production backup/access; owner content decision | WP1 |
| P0 | Complete controller, privacy, terms, retention, rights, and operator commitments (L01). | M | Owner + qualified legal/privacy review | WP1 |
| P0 | Establish an operational moderation/upload-safety loop before unrestricted uploads (L03). | L | Product policy, named operators | WP1/WP3 |
| P1 | Separate editorial demos from the real public community and metrics (L04). | S | WP1 content model | WP1 |
| P1 | Add PR CI, deterministic test roots, production Functions output, and portable browser smoke (R02-R04). | M | R01 | WP2 |
| P1 | Enforce required environment values, pin deploy tools, use short-lived auth, smoke production interfaces (R05). | M | CI environment ownership | WP2 |
| P1 | Add Firestore/Storage emulator tests and approved rules/index promotion/parity (R06). | M | WP2 CI | WP3 |
| P1 | Make publication manifest validation trusted, bounded, and legacy-compatible (S01). | L | Rules tests; schema decision | WP3 |
| P1 | Make export, deletion, and expiry cleanup paginated, chunked, resumable, and observable (S02-S03). | L | Job/status design | WP3 |
| P1 | Make newsletter unsubscribe scanner-safe and expiring (S04). | M | Email/product decision | WP3 |
| P1 | Split route entry paths and enforce route-level performance budgets (P01). | L | WP2 gates | WP4 |
| P1 | Defer Firebase/App Check/reCAPTCHA until protected intent; separate public data helpers (P05). | M | WP2 gates | WP4 |
| P1 | Fingerprint immutable assets or correct caching policy (P02). | M | Asset release/version plan | WP4 |
| P1 | Measure low-end scene performance and current Web Vitals; keep adaptive fallbacks (P03-P04). | M | WP4 instrumentation | WP4 |
| P1 | Repair mobile landing conversion, form/image semantics, hit targets, keyboard movement, and label-in-name (UX01, UX03, UX07-UX08). | M | Product copy/design | WP5 |
| P1 | Run seeded account/access/delete and real-device accessibility/3D matrices (UX05). | M-L | WP2 staging fixtures | WP5 |
| P1 | Standardize Warm Gallery user copy without renaming `nocturne` (UX04). | S | None | WP5/WP7 |
| P1 | Unify server/client index eligibility and render crawlable first-response route bodies (SEO05-SEO06). | L | WP1 content state; WP2 tests | WP7 |
| P1 | Split oversized ownership units incrementally behind behavior tests (A01). | L-XL | WP2-WP5 contracts/gates | WP6 |
| P1 | Reset README/AGENTS/status truth and archive historical evidence (Section 5-6). | M | Retention decision | WP7; begin after WP1 |
| P1 | Clean sitemap, verify Search Console/Bing coverage, and launch real content/internal links (SEO03). | M | WP1 content cleanup | WP7 |
| P2 | Fix mobile Walk Preview control density (UX02). | S | WP5 design | WP5 |
| P2 | Fix heading/contrast baseline and skip the landing GLB for reduced/static modes (UX09, P06). | S-M | WP5/WP4 | WP4/WP5 |
| P2 | Add notification rate/dedupe controls and paginate/materialize social discovery (S05-S06, SEO04). | L | Usage model; WP3 | WP6 |
| P2 | Upgrade affected Functions dependencies and re-audit (S07). | S-M | Supported Firebase matrix | WP3 |
| P2 | Roll out report-only then enforced CSP (S08). | M | Endpoint inventory | WP3 |
| P2 | De-duplicate build work and lint operational scripts (R07). | S | WP2 | WP2 |
| P2 | Format/split global CSS with visual regression protection (A02). | M | WP2/WP5 visual tests | WP6 |
| P2 | Decide code license and archive/provenance retention policy. | S | Owner/legal | WP7 |
| P2 | Redirect/noindex default Firebase hosts and standardize 1200×630 OG cards (SEO07). | S-M | Hosting capability | WP7 |
| P3 | Preserve selection across undo where valid (UX06). | S | UX decision | WP5 |
| P3 | Make HEAD media handlers metadata-only (S09). | S | None | WP6 |

## 8. Ordered Work Packages

### WP1 — Public trust and launch containment

**Objective:** make the visible product truthful and safely operable before growth.<br>
**Why:** legal incompleteness, test content, mixed demo/live data, and an unprocessed report channel are the immediate public risks.

Major tasks:

- freeze or narrowly gate open discovery/registration while the work is in progress;
- back up, quarantine, then remove production test creators/Spaces from public discovery and the sitemap;
- replace heuristic-only indexing with an explicit reviewed production/content state;
- separate editorial samples from live community content and metrics;
- complete legal/privacy/retention/rights/operator material;
- define moderation policy, queue, ownership, takedown/appeal, trusted upload checks, and incident response.

**Dependencies:** none; owner/legal decisions and production-data authority are external inputs.<br>
**Complete when:** no fixture is publicly discoverable/indexable; policies name real accountable parties; every report has an auditable operator path and SLA; unrestricted publishing has an explicit go/no-go approval.

### WP2 — Deterministic context and release gate

**Objective:** prevent broken or unknown revisions from reaching main/production.<br>
**Why:** the current test gate fails by calendar date and only runs after merge, while test/build discovery differs by local generated state.

Major tasks:

- fix the invite clock fixture and audit all absolute-date tests;
- add PR CI and separate verification from production deployment;
- define explicit client/Functions test roots and production build outputs;
- fail on required environment/App Check/mail configuration;
- pin CLI/actions, move to short-lived deploy identity, and add post-deploy smoke;
- enforce performance budgets and de-duplicate build/predeploy execution;
- promote a portable minimal browser smoke suite; lint operational scripts.

**Dependencies:** none; can run in parallel with WP1.<br>
**Complete when:** a clean checkout produces the same green gate locally and in CI; main receives only verified revisions; a missing parameter or exceeded budget fails before deployment; deployed revision/artifacts are traceable.

### WP3 — Data, rules, and security lifecycle assurance

**Objective:** prove authorization/schema behavior and make privacy/community operations safe at real scale.<br>
**Why:** strong boundaries exist, but rules are untested, published item shape is client-trusted, and long-lived account operations are not bounded.

Major tasks:

- add Firestore/Storage emulator matrices and reviewed rules/index promotion;
- move publication validation to a trusted boundary while preserving legacy contracts;
- make export/deletion/expiry cleanup paginated, chunked, resumable, and idempotent;
- make unsubscribe scanner-safe with expiry/rotation;
- add notification abuse controls and trusted upload decode/inspection hooks;
- update affected dependencies and introduce report-only CSP before enforcement.

**Dependencies:** WP2; moderation policy from WP1.<br>
**Complete when:** rules, schema, lifecycle, retry, over-limit, and hostile-client cases pass automatically; jobs resume after failure; production parity is recorded; CSP is enforceable without breaking Firebase/product flows.

### WP4 — First-load and 3D delivery performance

**Objective:** make the editorial landing and public viewer fast on ordinary mobile hardware without weakening the visual product.<br>
**Why:** the entry bundle is 2.57× its declared gzip budget and stable asset URLs are cached as immutable for a year.

Major tasks:

- split landing, directory/profile, Studio, account, and visitor route entry paths;
- defer editor/Firebase/App Check/reCAPTCHA/3D work until route or protected user intent requires it;
- fingerprint immutable GLB/WebP assets or correct their cache rules;
- bypass the GLB/3D path entirely for reduced-motion/static/data-saver modes;
- reserve image dimensions and control prefetch/preload behavior;
- set and enforce route/scene-ready budgets;
- capture lab and privacy-aware field LCP/INP/CLS, failure, memory, and low-end GPU evidence.

**Dependencies:** WP2.<br>
**Complete when:** all route budgets pass strictly; updated assets cannot remain stale; low-end mobile acceptance thresholds are defined and met; failure/reduced-motion paths remain usable.

### WP5 — Product, mobile, and accessibility completion

**Objective:** close the remaining user-facing friction and prove critical journeys, not just screens.<br>
**Why:** the core experience is good, but mobile conversion/control density and untested account/access/adverse states are launch risks.

Major tasks:

- recompose the mobile landing first viewport;
- fix Walk Preview labels/pad/safe-area behavior;
- add stable form identity/autocomplete, image geometry, 44×44 hit boxes, keyboard movement, and label-in-name compliance;
- correct heading order and small-text contrast/size;
- keep Warm Gallery language consistent while retaining `nocturne` internally;
- decide selection behavior across undo;
- automate and manually verify all templates, recovery, publish/update, private/unlisted access, invite/revoke, export/delete, empty/error/offline/WebGL failure, keyboard, screen reader, reduced motion, and real-device cases.

**Dependencies:** WP2; integrate WP4 changes before final device sign-off.<br>
**Complete when:** the seeded end-to-end matrix passes on supported desktop, iOS, and Android profiles with no critical accessibility or content-loss defect.

### WP6 — Modular ownership, test depth, and backend scale

**Objective:** let humans and coding agents change one domain without loading or destabilizing the whole product.<br>
**Why:** three giant modules and dense global CSS concentrate unrelated responsibilities; social queries will not scale linearly.

Major tasks:

- extract route shells/use cases from `App.tsx`;
- split `GalleryScene.tsx` by lifecycle, asset loading, room construction, controls/collision, quality, and overlays while keeping one renderer/runtime contract;
- extract backend domain handlers while keeping exported endpoint/callable names stable;
- format/layer CSS and add visual regression coverage;
- replace high-value raw-source assertions with behavior/integration tests and coverage thresholds;
- paginate/materialize Creator feed, directory, and sitemap; add notification aggregation;
- optimize HEAD media handling.

**Dependencies:** WP2; begin risky extraction only after WP3-WP5 establish contracts and behavioral coverage.<br>
**Complete when:** ownership boundaries are documented and independently testable, main modules no longer mix unrelated domains, compatibility tests stay green, and social/public queries have cursor/cost/latency limits.

### WP7 — Repository/context reset and production evidence

**Objective:** leave one truthful, compact source of operational context and prove the cleaned product is discoverable.<br>
**Why:** current documentation misdirects agents, while historical evidence consumes most tracked bytes and the public site has no observed search footprint.

Major tasks:

- repair/remove the corrupted WP16 report and stop linking stale readiness snapshots as current;
- reduce README/AGENTS/status files to the authoritative set in Section 6;
- remove or externally archive unreferenced GPT images, superseded audit media/scripts/reports, preserving provenance and compatibility decisions;
- bind any retained snapshots to date/commit and avoid hard-coded live test totals;
- decide code license and evidence retention;
- submit the clean sitemap, verify Search Console/Bing index coverage and canonical/noindex behavior, and launch real creator/exhibition content with internal links;
- centralize server/client eligibility, render useful crawlable first-response bodies, normalize default Firebase hosts, and standardize social-card dimensions;
- run the final staging/production release matrix and record only current evidence.

**Dependencies:** cleanup can start after WP1's retention/content decisions; final evidence depends on WP1-WP6.<br>
**Complete when:** a new human or coding agent can orient from the root documents without contradiction; historical files no longer dominate default context; production contains real approved content; release, security, accessibility, performance, and index-coverage evidence all refer to the shipped commit.

## 9. Final decision rule

Do not declare LIEUVA production-ready because the interface looks finished or because a historical audit says “pass.” Declare it ready when:

1. every P0 is closed by evidence;
2. the deterministic release/rules/security gates are green on the exact deployed revision;
3. legal and moderation operators accept their responsibilities;
4. the real-device critical-journey matrix passes;
5. strict performance budgets pass;
6. the public sitemap/directory contain only approved real or unambiguously labelled sample content;
7. the repository's live context accurately describes that same revision.

Until then, the right posture is **strong product, controlled pilot, production hardening in progress**.
