# LIEUVA — Full Product Experience Audit

**Audit date:** 23 August 2026  
**Scope:** Product, UX, UI, 3D, technical product experience, brand, SEO, competition and go-to-market  
**Decision in force:** the customer-facing brand is **LIEUVA**; AURA is the legacy implementation name  
**Implementation status:** audit only. No product code, Firebase data/rules, deployment or production configuration was changed.

## 0. Method, evidence and limits

This is a new audit of the current repository and product, not a restatement of `UI-UX-3D-AUDIT.md`. It uses the verified Step 1 baseline in `audit/REPOSITORY-PRODUCT-BASELINE.md` and checks it against the current implementation. I read `AGENTS.md`, `README.md`, the previous audits, implementation/status/access reviews and the relevant landing, Studio, Viewer, Discover, Account, sharing, persistence, Firebase, rules, Functions, email, metadata, manifest and 3D code. Repository-wide searches covered `AURA/Aura/aura`, legacy claims, titles, descriptions, JSON-LD, Open Graph, email copy, URLs, storage keys, exports, Blender metadata and brand assets.

Evidence used:

- Canonical production host: `https://lieuva.com/`. On 23 August it returned HTTP 200 from GitHub Pages. `robots.txt` permits crawling and points to `https://lieuva.com/sitemap.xml`; that sitemap currently contains only the homepage.
- Interactive Chrome QA was requested, but no connected browser was available during this pass. Therefore visual claims below are either current code findings or clearly identified earlier evidence; they are not presented as a fresh production-browser result.
- The unchanged Step 1 snapshot passed `npm run check`: **22 test files / 126 tests**, lint and production build. `npm run check:functions`: **2 files / 6 tests** and the Functions TypeScript build passed.
- Existing device/performance evidence in `audit/final/`, `audit/IMPLEMENTATION-STATUS.md` and `audit/LIVE-ACCESS-MATRIX.md` was cross-checked against the current code.
- Current public sources are linked inline. Brand/database checks are preliminary desk research, not legal clearance. `lieuva.com` is controlled and serving the product; social handles and trademark rights are separate questions.

Important limits:

- I did not publish, delete or alter live user data. Therefore owner/editor/viewer/private/unlisted operations are assessed from code and existing evidence, not newly re-executed destructive tests. A release-gate E2E run remains required.
- Firebase console enforcement, billing/quota dashboards, Analytics, Search Console, email-provider delivery and DNS ownership cannot be proven from the repository.
- Search-result composition and domain/handle availability change. Recheck immediately before launch.

---

## 1. Executive summary

LIEUVA already has a credible technical product core: a no-account local creation flow, three templates, robust local drafts, recovery, undo/redo, transactional placement, Walk/Overview/Guided Tour, stable published revisions, visibility controls, ACLs and a notably strong authored DannyHirschArts visitor experience. The current build is beyond a disposable prototype. It is, however, still a **guided pilot product**, not a trustworthy public self-serve platform.

The central strategic correction is right: **art is the launch wedge, not the brand boundary**. LIEUVA should internally be understood as a spatial publishing platform, but that phrase is too abstract and ambiguous for the homepage. The public category should be **“an immersive 3D presentation platform”**, immediately explained as a browser-based way to create, publish and share interactive spaces without 3D expertise.

The recommended positioning is:

> **LIEUVA**  
> **Give your work a place.**  
> Create and publish immersive 3D spaces for art, design and ideas—directly in the browser, with no 3D expertise required.

The best beachhead is **independent visual artists and small galleries with a real collection or exhibition to launch**, supported by a small number of curated graduate-show pilots. This matches the current product, generates beautiful public examples and shareable links, and avoids promising architecture/brand workflows before the content model supports models, video, documents, free-form surfaces and richer spatial storytelling.

The launch blockers are not another visual redesign. They are: production trust/legal completeness; deployment and external verification of the locally implemented account data-rights lifecycle; verified live Firebase security and abuse controls; a real LIEUVA email identity; clean crawlable URLs with per-space metadata; a controlled visible rebrand; and repeatable pilot evidence. The hash-routed GitHub Pages shell currently gives every route the same static AURA metadata, so it cannot support the proposed SEO/discovery flywheel.

**Overall maturity:**

| Dimension | Current maturity | Judgment |
|---|---:|---|
| Visitor 3D reference | 4/5 | DannyHirschArts is a persuasive quality benchmark; template output does not yet consistently match it. |
| Creator workflow | 3/5 | Strong local drafting and preview; mobile density, general-purpose content and cloud continuity remain weak. |
| Publishing/account | 3/5 | Sensible architecture and ACL model; WP1/WP2 are locally green with conditions, but live Firebase/App Check and deployed data-rights behavior still need external proof. |
| Brand/positioning | 1/5 | Live product is entirely AURA and art-gallery-specific; LIEUVA direction is sound but unimplemented. |
| SEO/distribution | 1/5 | Static metadata, fragment routes and no per-space indexable documents block acquisition. |
| Operations/trust | 2/5 | Rules/tests exist; monitoring, moderation, legal identity, lifecycle email and operational runbooks are incomplete. |
| Commercial readiness | 1.5/5 | No validated pricing, cost model, conversion instrumentation or case studies. |

**Recommendation:** do not launch as a broad “platform for everyone.” Run a controlled LIEUVA migration and 10–15 design-partner pilots, make public spaces technically indexable and socially shareable, and only then open self-serve acquisition.

---

## 2. Current Product Maturity

### What is real and working

- The landing story, template selection and local Studio are usable without an account.
- Drafts are project-scoped in IndexedDB with fallback/legacy support, autosave and recovery.
- Placement is constrained and transactional; undo/redo and publish review reduce accidental loss.
- Public, unlisted and private lifecycle states exist. Published updates retain the same share URL and use revision checks.
- Owner/editor/viewer access and invitations exist in the domain model, rules and Functions.
- The same visitor control system covers published spaces and DannyHirschArts.
- DannyHirschArts uses authored GLB assets, metadata, colliders, guided-tour anchors and an adaptive/mobile asset path; it is visibly more authored than procedural templates.
- Repository and Functions test/build gates are green.

### What remains pilot-grade

- Local drafts do not provide cross-device/cloud draft continuity. Browser eviction, private mode and device loss remain user risks.
- Optimistic revision checks are conflict protection, not a restorable version history or collaborative editor.
- Account export/deletion is now implemented locally with deterministic coverage; deployment, real App Check/Firebase verification, browser QA and legal retention/controller decisions remain open (`audit/DATA-RIGHTS-ACCOUNT-DELETION.md`).
- Newsletter/lifecycle functions and sender/legal configuration are not production-complete.
- App Check is conditional and core Functions request it, but live enforcement, metrics and abuse response are not demonstrated.
- Analytics, RUM/error monitoring, funnel definitions and operational alerts are missing.
- Public share pages are SPA states behind fragments; static metadata describes AURA, not the space.
- Current schemas and copy are deeply gallery/artwork/exhibition-oriented. This is acceptable internally for the art wedge, but cannot support the broad promise without a planned capability layer.

### Product maturity classification

**Current:** guided proof-of-concept / private alpha with a credible production nucleus.  
**Next valid state:** design-partner beta with verified trust, stable branded URLs, lifecycle support and measurable outcomes.  
**Not yet:** public self-serve SaaS, institutional procurement-ready platform, general-purpose spatial publishing system.

---

## 3. Recommended LIEUVA Positioning

### Category decision

“Spatial publishing platform” is a useful internal strategy label: it accommodates authored spaces, publishing, versions, audiences and discovery. It is not the best homepage category. Current search results for “spatial” skew toward spatial computing, XR worlds, property/real-estate services and technical publish/subscribe concepts; the phrase does not tell a first-time buyer what they can make.

Use this hierarchy:

| Layer | Recommendation |
|---|---|
| Brand | **LIEUVA** |
| Internal category | Spatial publishing platform |
| Public category | **Immersive 3D presentation platform** |
| Primary claim | **Give your work a place.** |
| Supporting statement | **Create and publish immersive 3D spaces for art, design and ideas—directly in the browser, with no 3D expertise required.** |
| Product proof line | Start from a template. Arrange your work. Publish one link people can explore. |
| Secondary line 1 | **Where ideas take place.** — editorial/brand storytelling |
| Secondary line 2 | **Create spaces worth experiencing.** — creator/product campaigns |

### Claim evaluation

Scores are 1–5; SEO is judged as compatibility with explanatory copy, not keyword stuffing.

| Line | Clear | Emotional | Distinctive | International | Beyond art | Conversion | Brand fit | SEO compatible | Decision |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Give your work a place. | 5 | 5 | 4 | 4 | 5 | 4 | 5 | 4 | **Primary** |
| Where ideas take place. | 4 | 5 | 4 | 4 | 5 | 3 | 5 | 3 | Secondary/editorial |
| A place for what you create. | 5 | 3 | 3 | 5 | 5 | 4 | 4 | 4 | Useful explanatory copy, not main claim |
| Create spaces worth experiencing. | 5 | 4 | 3 | 5 | 5 | 5 | 4 | 5 | Secondary/product CTA |
| Make your work somewhere to be. | 2 | 4 | 4 | 2 | 5 | 2 | 4 | 2 | Reject; awkward non-native phrasing |

The primary claim is memorable precisely because “place” connects the name, the spatial medium and the creator’s emotional job. It must never stand alone above an abstract visual: pair it with the literal category and three-step proof.

### Audience value propositions

- **Artists and photographers:** turn a body of work into a place people can enter; share beyond geography without flattening it into a feed.
- **Small galleries and curators:** publish an accessible companion or extension to a physical show, update it without changing the link, and understand visits.
- **Schools and graduate shows:** give each cohort a coherent public destination with creator attribution and shared editorial control.
- **Museums/cultural institutions:** extend access, context and preservation with controlled publishing, accessibility and organizational governance. This is post-pilot until procurement needs are covered.
- **Architects/interior designers:** communicate a proposal spatially in one browser link. This must wait for 3D-model/media/annotation capability and client-review UX.
- **Design studios/brands:** create guided, measurable launch and portfolio experiences. This is later, after custom identity, embeds, analytics, concurrency and service levels.

### Terminology system

Use state and audience to remove ambiguity:

| Concept | Recommended UI term | Rule |
|---|---|---|
| Editable created object | **Project** | A creator edits a Project in Studio. |
| Published spatial result | **Space** | A visitor opens a Space. |
| Visitor outcome | **Experience** | Marketing descriptor, not the primary database noun. |
| Builder | **LIEUVA Studio** / **Studio** | Avoid “Builder” in primary navigation; keep as internal component name. |
| Visitor mode | **Explore** | “Preview” for creator validation; “Explore” for visitors. |
| Discover | **Discover** | Clear and scalable. Use “Featured” as a curated subset. |
| Templates | **Space templates** | Template categories may be Exhibition, Portfolio, Showcase, etc. |
| Publish | **Publish** | Reserve for producing/updating the visitor-facing Space. |
| Share | **Share** | Opens link/embed/social/QR controls after publication. |
| Visibility | **Public / Unlisted / Private** | Add one-sentence consequences and indexability. |
| Guided Tour | **Guided tour** | Retain; widely understood. Later use “Story” as an authoring layer, not a replacement. |
| Artwork | **Work** in art templates; **Item** or **Content** in platform schema | Contextual language beats one unnatural global noun. |
| Gallery/exhibition | Keep only for art-specific templates/use cases | Do not use as the platform-wide object. |

---

## 4. Beachhead Audience

### Recommended beachhead

Launch to **independent visual artists and small galleries with a finished collection and a real exhibition, release or portfolio moment**. Recruit 10–15 design partners; include 2–3 small graduate art/design-show teams as managed institutional pilots.

Why this wedge:

1. It matches current capabilities: 2D works, wall placement, gallery templates, artist metadata and DannyHirschArts.
2. The emotional job is urgent and legible: make a body of work feel intentional and shareable.
3. Every successful Space becomes both proof and distribution; visitors already understand exhibitions.
4. Small operators decide faster than museums, universities or brands and tolerate guided onboarding.
5. The resulting learning—upload, curation, narrative, sharing, analytics—generalizes to broader spatial publishing.

Do **not** lead with museums, enterprise brands, architecture firms or whole-university deployments. Their requirements—procurement, DPA/SLA, SSO, advanced collaboration, large cohorts, 3D/CAD assets, annotations, analytics, custom domains, accessibility governance and support—would distort the first launch.

### Jobs to be done

**Creator functional job:** turn heterogeneous work into an intentional browser-based spatial presentation without learning 3D software or hiring a studio.  
**Creator emotional job:** feel that the work has weight, context and a memorable destination—not another post in a feed.  
**Visitor job:** understand, navigate and share the work immediately, without installing software, creating an account or learning game controls.  
**Institutional job:** publish, govern and update a coherent public experience across contributors, dates and permissions.

### MVP versus production readiness

The present feature set is already larger than a minimal demo. “MVP” should now mean the smallest **trustworthy paid pilot**, not the fewest controls.

Required for paid pilots:

- stable branded URLs and per-Space social cards;
- verified access matrix and recovery/version behavior;
- legal/operator/privacy/content policy and deletion/export;
- basic visit/share/publish analytics and error monitoring;
- support path and incident/runbook ownership;
- one repeatable, excellent template workflow and three credible case studies;
- predictable limits and transparent preview/beta status.

Not required yet:

- real-time co-editing, avatars, multiplayer voice, VR apps, AI space generation, template marketplace, commerce, native mobile apps, CAD/BIM ingestion, user-imported arbitrary environments or a social feed.

### Product vocabulary/generalization plan

Do not rename Firestore merely to sound broader. Introduce a platform-facing capability model above legacy gallery entities:

- `Project` lifecycle → draft, review, published, archived/trash.
- `Space` publication → stable public identity + revisions.
- `ContentItem` → image initially; later video, audio, text, document, 3D model, embed.
- `Placement` → wall, floor, pedestal, free, screen, hotspot; keep legacy artwork placement adapter.
- `TemplateCapabilities` → supported media/surfaces/navigation/lighting/limits.
- `Story` → ordered stops, narration, camera targets and optional branches.
- `Contributor` and attribution → person/organization, roles, profile, rights.

The first implementation should be additive and adapter-based. Existing `gallery`, `artwork`, routes, IDs and records remain valid.

### Packaging hypothesis—not final pricing

| Plan | Suggested boundary | Why |
|---|---|---|
| Free | One active public LIEUVA-branded Space, limited items/templates/storage, standard social card | Enables creation and the sharing loop; costs stay bounded. |
| Plus | Several active Spaces, private/unlisted, more storage, basic analytics, longer history, HD/social customization | Individual creator value. |
| Pro | Collaborators, custom branding, embeds, version restore, advanced analytics, domain mapping, priority support | Small gallery/studio value. |
| Business | Organization admin, SSO, audit log, DPA/SLA, high concurrency, bulk/managed publishing and procurement support | Institutions/brands; sales-assisted. |

Prices require storage/egress/rendering/support cost telemetry and willingness-to-pay interviews. Do not copy competitor price points without cost and value validation.

---

## 5. Top 10 Risks

| Rank | Risk | Type | Evidence | Consequence |
|---:|---|---|---|---|
| 1 | Broad promise outruns art-bound product | Strategic | `gallery/artwork/exhibition` permeate model, UI and templates | Architecture/brand prospects churn after the claim. |
| 2 | LIEUVA not legally cleared | Brand/P0 | `lieuva.com` is live, but open-web screening is not a professional similarity search | Forced rename after investment if an earlier right is found. |
| 3 | Hash/static hosting blocks search/share identity | Technical/SEO/P0 | `#/g/...`; one AURA `index.html` OG/JSON-LD for all routes | No per-Space SERP, weak social sharing, broken flywheel. |
| 4 | Trust/privacy lifecycle not production-verified | Product/legal/P0 | Account deletion/export is locally implemented, but deployment, external verification and legal sender/operator/retention decisions remain open | Cannot responsibly claim production-complete data rights yet. |
| 5 | Live security/abuse posture not demonstrated | Technical/P0 | App Check conditional; no new full role matrix; no moderation/alert evidence | Data exposure, cost abuse or incident without response. |
| 6 | Reference-quality gap | 3D/P1 | Authored Danny visibly exceeds procedural templates; live texture warnings | Marketing raises expectations the builder output cannot meet. |
| 7 | Mobile creation overload | UX/P1 | 390×844 Studio toolbar/panel crowd canvas and truncate context | Mobile visitors succeed; mobile creators abandon. |
| 8 | No measured retention or value | Product/GTM/P1 | No funnel/RUM/case outcomes | Roadmap and pricing optimize opinions, not behavior. |
| 9 | UGC index bloat/spam | SEO/operations/P1 | Future public publishing without quality/index gates | Thin pages, abuse, crawl waste and brand damage. |
| 10 | Big-bang rebrand breaks working contracts | Migration/P0 | Firebase project, callables, collections, storage, local DB and exports embed legacy terms | Avoidable outage/data loss with zero user value. |

---

## 6. Top 10 Opportunities

| Rank | Opportunity | Mechanism | Proof to seek |
|---:|---|---|---|
| 1 | Public-Space SEO flywheel | Each quality Space and creator profile becomes an indexable, attributed destination | Non-branded impressions → engaged Space visits → creator starts. |
| 2 | Visitor-to-creator loop | Tasteful “Made with LIEUVA / Give your work a place” after engagement | Creator-start rate from shared Space visitors. |
| 3 | No-account activation | Template → upload → Walk Preview before signup | First preview completion and publish-intent rate. |
| 4 | Art/design proof wedge | Beautiful pilots are product demos and cultural content | Qualified referrals per published pilot. |
| 5 | Graduate-show repeatability | Cohort deadlines, many sharers, annual recurrence | Renewal and visitor reach per institution. |
| 6 | Physical/digital bridge | QR, embed and companion Space for real shows | Scans, return visits and post-event longevity. |
| 7 | Stable updateable publication | One durable URL can evolve over time | Update frequency and link longevity. |
| 8 | Narrative differentiator | Guided tour/story turns rooms into authored presentations | Tour starts/completions and work-detail engagement. |
| 9 | Template/capability architecture | Same engine supports exhibitions, portfolios and cases without forking products | New use case delivered through capabilities, not parallel code. |
| 10 | Premium governance | ACL, versions, identity, analytics and domains create institutional value | Pilot conversion to Pro/Business. |

---

## 7. Full Customer Journey Audit

| Stage | Current experience | Finding/type | Target experience and metric | Priority |
|---|---|---|---|---:|
| 1. Google/social/referral | Search lands on a static AURA shell; shared routes lack unique previews | SEO/brand gap | Branded clean URL, accurate intent page or Space card. CTR and engaged-visit rate. | P0 |
| 2. Landing/Emil scroll | Cinematic editorial reference, visually strong; the product category is not immediate | UX/strategy | Claim + literal descriptor + live proof above first story beat. Product comprehension in 5 seconds. | P1 |
| 3. Understanding/trust | Preview disclaimers exist; little social proof/operator/support evidence | Trust gap | Three proof points, real case outcomes, privacy/support identity and honest beta status. CTA confidence. | P0/P1 |
| 4. What is LIEUVA? | AURA says virtual galleries/art exhibitions | Brand gap | “Create and publish immersive 3D spaces” with art launch wedge, broader examples shown as roadmap/possibility only. | P1 |
| 5. Template selection | Three art rooms with limits and descriptions | Good base/UX | Outcome thumbnails, capacity/media/navigation/accessibility compatibility; “best for” labels. Template-selection completion. | P1 |
| 6. First Space without account | Strong differentiator; local draft starts immediately | Opportunity | Keep. Add progress, privacy reassurance and recovery explanation. Preview reached without signup. | P1 |
| 7. Upload/place/design | Strong art workflow; controls dense; content type is image/artwork | UX/model constraint | Progressive disclosure, clearer selected-work context, safe file validation; later media capabilities. Time to first placed work. | P1 |
| 8. Arrange/Walk/Overview/Tour | Valuable modes; mobile Arrange cramped, Walk much clearer | UX | Mode-specific toolbars, persistent orientation, accessibility/reduced-motion controls. Preview task success. | P1 |
| 9. Account/verification | Deferred until publish is strategically correct | Good but risky | Explain why account is needed, preserve draft, reliable email retry/change-address path. Verification completion. | P0/P1 |
| 10. Publish/share | Review and visibility exist; AURA language; generic previews | Product/brand/SEO | Clear consequences, progress/retry, per-Space card, copy link/QR/embed. Publish success and share action. | P0 |
| 11. Public/unlisted/private | Model exists; index meaning not integrated | Product/SEO | Public = eligible for review/index; unlisted = accessible by link + `noindex`; private = auth + `noindex`. Zero accidental exposure. | P0 |
| 12. Discover | Current public gallery list is an early network surface | Opportunity/quality risk | Curated/quality-gated launch collection, filters and creator attribution; not an unmoderated feed. Engaged visits per listing. | P1 |
| 13. Account/Space management | Rooms, roles, lifecycle and profile exist | Functional/terminology | Projects vs Spaces, status/role/last-published/visibility/action clarity. Task success. | P1 |
| 14. Versions/ACL/invites | Revision conflict and roles exist; no visible restore history | Technical/product gap | Version timeline/restore later; invite expiry/resend/revoke/audit. Invite acceptance and conflict recovery. | P1/P2 |
| 15. Edit published Space | Same URL can update; strong value | Opportunity | Distinguish draft changes from live version; preview diff; rollback. Zero unintended live changes. | P1/P2 |
| 16. Return | Drafts and managed spaces exist; no lifecycle loop | Retention gap | “Continue project,” update reminders, visitor insights, event/date prompts and annual archive. 30-day returning creators. | P1/P2 |
| 17. Upgrade | Billing inactive; value boundaries unvalidated | Commercial gap | Usage-based value moments, transparent limits, no hostage data. Pilot-to-paid conversion. | P2 |
| 18. Support/email/privacy/delete | Data notice exists; lifecycle email and deletion incomplete | P0 trust gap | Support SLA, transactional emails, consent ledger, export/delete workflow and legal pages. Resolution/deletion completion. | P0 |
| 19. Direct visitor | No account required and controls are shared; Danny works well | Strength with 3D gap | Fast shell, clear controls, optional intro, work directory fallback, share/creator attribution. First interaction and completion. | P1 |
| 20. Visitor → creator | No strong contextual conversion loop | Opportunity | After meaningful engagement: “Made with LIEUVA — give your work a place,” opening a matching template. Visit-to-start rate. | P1 |

### Journey principle

The visitor experience must never become an acquisition interstitial. Earn the creator CTA after a user has moved, opened a work, completed a tour or reached the exit. Preserve the published creator’s identity; LIEUVA attribution should be quiet on Free and removable/customizable on paid plans.

---

## 8. UI/UX Audit

### 8.1 Landing, information architecture and conversion

**Current strengths**

- The Emil/Danny editorial scroll is distinctive, controlled and more premium than generic SaaS cards.
- Actual product views and the authored reference create emotional proof.
- “Create” and “Discover” are real routes, not fake marketing CTAs.

**Current problems**

1. The homepage begins with the reference story, not a user-centered definition. A first-time visitor can reasonably think this is DannyHirschArts rather than a creation platform.
2. The live accessibility tree at 390×844 contained no homepage H1; the first meaningful heading was an H2 about building the Danny Hirsch exhibition.
3. Copy says “concept images” while the repository status says the landing now uses product captures. That lowers trust in real proof.
4. One static `index.html` supplies title, description, JSON-LD and social metadata to every hash route. `App.tsx` changes only `document.title` after JavaScript.
5. The header shows “AURA Light Preview”; the PWA prompt offers “Install AURA — Virtual Art Platform.”
6. Importing account UI in the shared header pulls Firebase/App Check into the landing startup path; earlier production network evidence showed reCAPTCHA resources before account intent. This conflicts with the intended progressive loading and must be remeasured after route/chunk changes.

**Recommended IA**

Top navigation at launch: **Create · Discover · For Artists · For Galleries · Pricing · Sign in**. Keep “How it works” as a homepage anchor. Do not expose future audience pages until each has specific proof. Account uses a utility position; “Studio” appears after a project exists.

Homepage sequence:

1. Claim + literal category + create CTA + explore demo.
2. Three-step product proof: choose, arrange, publish.
3. Interactive or video proof of switching Arrange → Walk → share.
4. One strong creator case with outcome, not only atmosphere.
5. Templates/outcomes.
6. Visitor proof: no install/account; mobile/desktop; accessibility controls.
7. Trust/privacy/ownership statement.
8. Focused audiences: artists, small galleries, graduate shows.
9. FAQ addressing “Is this VR?”, “Do visitors install anything?”, ownership, pricing preview and supported media.
10. Final create CTA.

Do not discard the Emil scroll. Reframe it as the first case-study chapter below a clear product hero, or as `/showcase/danny-hirsch-arts`.

### 8.2 Studio and first-use UX

**Desktop:** the Studio is dense but coherent for a motivated user. The work directory, selection, placement constraints, modes, autosave state and publish review form a credible editor. The largest issue is conceptual density: several authoring modes, work fields and room/material controls compete before the user has achieved a first success.

**Mobile 390×844:** the tested Arrange screen loaded correctly and preserved the project. The top context was truncated, controls competed horizontally, the review CTA dominated, and the lower panel left a small 3D canvas. Walk Preview was substantially clearer. This is not a rendering failure; it is an **authoring layout problem**.

Recommendations:

- Make mobile creation “quick edit”: select work, upload/replace, move, rotate, preview and publish. Put advanced room/material/tour editing behind a sheet or recommend desktop.
- Replace the horizontal top-tool accumulation with one mode title, save state, undo and overflow. Keep publish in a bottom/overflow action until review.
- On first project, guide one work through upload → wall → Walk Preview before exposing every setting.
- Make selected item, current surface and constraint/error visible together; never make users infer why placement failed.
- Use capability-driven panels so art-only fields do not become platform-wide permanent UI.
- Provide visible local-storage semantics: “Saved on this device,” last saved time, storage warning, export backup and cloud-upgrade path.
- Keep keyboard shortcuts discoverable, not mandatory. Restore focus after dialogs and announce save/publish states through polite live regions.

### 8.3 Accounts, projects and space management

The account domain is more mature than the branding suggests: user profiles, roles, invitations, visibility and lifecycle states exist. The main UX failure is noun/state ambiguity—“rooms,” galleries, projects and published experiences overlap.

Target management model:

- **Projects** tab: drafts and editable projects, with local/cloud badge, owner/role, template, modified time.
- **Spaces** tab: published identities, live revision, visibility, visits, share and update actions.
- **Invitations** tab: pending, accepted, expired, resend/revoke.
- **Trash**: retention deadline, restore and permanent deletion consequences.
- **Profile & data**: identity, newsletter consent, export, delete account.

Account switching must invalidate cached permissions and data immediately, cancel in-flight writes, clear creator-specific UI and re-resolve the active project. Test this as part of the release matrix.

### 8.4 Publish, sharing and visibility

The existing review gate and stable URL are the right architecture. Improve four things:

1. Separate **Save project** from **Update live Space**. A creator needs confidence that edits are not public until explicit update.
2. Make visibility consequences explicit:
   - Public: anyone can open; eligible for Discover and search only after quality/index eligibility.
   - Unlisted: anyone with link; excluded from Discover/search.
   - Private: only named people; authentication required; excluded from search.
3. After publish, show a deterministic success state with canonical URL, copy, QR, social preview, embed (paid later), visibility and “View as visitor.”
4. Replace generic static cards with title, creator, representative image, LIEUVA mark and correct canonical URL.

`Discover` owner removal currently confirms that removal “cannot be undone,” while repository deletion routes the record to `trash`. Align language with actual lifecycle; destructive copy must describe recoverability and retention exactly.

### 8.5 States, accessibility and inclusive interaction

**Good foundations:** labels/ARIA exist in many controls; a directory/list fallback helps non-spatial browsing; shared controls reduce divergence; Reduced Motion is considered in the prior implementation.

**Gaps to close:**

- Add a true H1 and logical heading outline per document.
- Run keyboard-only passes for landing, authentication, template selection, upload, placement, publish, Account and Viewer. Visible focus and dialog focus traps are acceptance criteria, not visual polish.
- Offer an always-available non-3D content directory with equivalent titles, descriptions and attribution.
- Reduced Motion must disable drone intro, camera easing, ornamental parallax and auto-tour movement; it should not merely shorten CSS transitions.
- Expose camera sensitivity, invert option if demanded, control help and reset/orientation.
- Touch targets ≥44×44 CSS px; avoid overlapping bottom browser UI/safe areas.
- Verify text/background/control contrast, especially image overlays and disabled/secondary gray text.
- Provide captions/transcripts before video/audio content becomes supported.
- Announce loading progress, renderer fallback and failures in text; offer a low-motion/low-performance mode.

### 8.6 Visual identity direction

The AURA aesthetic—dark editorial surfaces, warm off-white, acid accent, disciplined typography and cinematic imagery—can evolve into LIEUVA. A total UI reskin would waste functioning hierarchy. What should change:

- Replace the AURA monogram/wordmark with a LIEUVA identity capable of small app/favicon use.
- Use “place” as a system idea: frames, thresholds, coordinates, rooms and editorial negative space—not literal map pins.
- Reduce “luxury art magazine” dominance in utility/product screens; Studio clarity beats expressive type.
- Establish a neutral content system that lets creators’ work lead. LIEUVA chrome should be recognizable but not tint or overpower art.
- Define color, type, motion, imagery, icon, spatial-lighting and sound rules in one brand/design-token source.

### 8.7 Retention, referrals and network effects

Return reasons must derive from work, not gamification:

- finish a draft; update a live Space; view visitor insights; prepare an opening; archive a show; reuse a successful template; collaborate; publish the next collection.
- send meaningful lifecycle events: draft recovery, invite, publish success/failure, storage/limit, event reminder, monthly insight summary and annual archive/renewal. No unsolicited marketing by default.
- sharing loops: branded social card, QR/embed, creator attribution, contextual “Made with LIEUVA,” duplicate own project/template, and public creator profile.

Network effect: more quality Spaces → more visitor discovery and indexed creator pages → more creators → more templates/examples. It only works if quality, attribution and performance remain high. An unmoderated feed produces the opposite effect.

---

## 9. 3D Experience Audit

### 9.1 Current quality

DannyHirschArts remains the quality reference because its scene is authored as an experience: custom geometry, metadata, collision/navigation anchors, tuned lighting and a coherent presentation. The procedural Studio templates are flexible and reliable but read more like generated rooms. The gap is not one shader setting; it is asset authorship, lighting, material variation, composition and performance budget working together.

Earlier 390×844 evidence showed Danny rendering with usable controls; the bottom title/info layer consumed meaningful scene area without blocking navigation. That run emitted repeated Three.js texture-update warnings. Because interactive Chrome was unavailable on 23 August, treat the warning as a **previously confirmed defect requiring re-verification**, not proof that the current deployment still emits it.

### 9.2 Rendering, material and lighting findings

- **Lighting:** template light is serviceable, not architectural. A smaller set of deliberately lit templates will outperform many configurable but generic rooms.
- **Shadows:** preserve contact and artwork grounding while avoiding expensive dynamic shadow coverage. Static architecture should prefer baked contribution; dynamic works/props need selective contact shadowing.
- **Reflections:** only add probes/reflections where they materially sell glass, polished floor or metal. Screen-space effects with unstable mobile artifacts are worse than restrained PBR.
- **Materials:** current surfaces mix authored assets and procedural/maps. Build calibrated PBR material families with controlled roughness/normal scale; avoid noise as a substitute for material structure.
- **Artwork color:** maintain sRGB/color-management consistency and a deliberate tone-mapping path. An unlit artwork surface can protect color, but it must still feel physically mounted; validate against source images on calibrated desktop/mobile references.
- **Placement:** wall constraints and anchors are a strong fixed-template solution. Future free-form models require explicit semantic surfaces and/or authoring tools; do not infer every surface at runtime.

### 9.3 Navigation modes

- **Walk:** primary mode. Default controls must work for non-gamers; preserve click/touch movement options, visible help and reset.
- **Overview:** valuable for orientation and authoring. Clarify whether it is a map, camera or edit mode; show current location and selected item.
- **Guided tour:** strongest differentiator when the route is editorial, not merely nearest-neighbor camera hops. Support an ordered story, optional narration/captions and an easy exit to free exploration.
- **Drone intro:** use as optional spectacle, not a gate. Skip on Reduced Motion, slow connections, repeat visits and low-power/mobile paths.
- **Touch:** virtual-stick/control regions must respect safe areas and not compete with work-detail overlays. Test real device UA and touch, not only a responsive viewport.

### 9.4 Performance architecture

Current code already has adaptive quality, an authored mobile Danny derivative and Meshopt-related infrastructure. Major remaining gains:

1. Fix the texture lifecycle warnings and add asset-validation tests.
2. Establish per-template budgets for initial JS, environment GLB, textures, work media, draw calls, triangles, texture memory and peak heap.
3. Add progressive loading: interactive shell and low-res environment first, visible works next, distant/optional detail last.
4. Transcode appropriate color/normal/roughness assets to KTX2/Basis; measure device support and visual regressions.
5. Add LOD or authored mobile variants only where profiling shows sustained benefit. Avoid generic automated LOD that damages artwork frames/architecture silhouettes.
6. Bake lighting/lightmaps for static authored templates; maintain a limited dynamic-light budget for works and user choices.
7. Cache immutable versioned assets aggressively and serve through a production CDN/domain.
8. Add RUM for time-to-first-interaction, Space ready, FPS bands, context loss, crash/error and device class.

Suggested pilot performance gates, validated on real devices:

- useful HTML shell ≤1.5s on mid-tier mobile 4G; first navigable Space ≤5s at p75 for the launch template;
- no long unresponsive interval >500ms during initial interaction;
- p75 ≥30 FPS on supported mid-tier mobile and ≥50 FPS on supported desktop during representative tours;
- zero WebGL context loss in the supported device matrix;
- asset failure produces a recoverable text state, not a blank canvas.

These are product targets, not claims that current cached DevTools timings already satisfy them.

### 9.5 Generalizing beyond galleries

The fixed room + wall artwork + swept collision model is appropriately optimized for launch. It is too specialized for arbitrary architecture/brand experiences. Generalize in layers:

1. **Media/content layer:** image → video/audio/text/document/3D object.
2. **Surface/placement layer:** wall/floor/pedestal/screen/free/hotspot.
3. **Template capability layer:** allowed content, sizes, navigation, lighting and device budgets.
4. **Story layer:** stops, camera framing, narration, interactions.
5. **Environment layer:** first curated authored LIEUVA templates; later verified partner/custom models; user-uploaded arbitrary architecture last.

Do not replace the current collision/placement architecture before a broader use case is validated. Create adapters and one non-gallery pilot template to test the abstraction.

### 9.6 Largest visible quality jumps

| Order | Change | Why it matters | Priority |
|---:|---|---|---:|
| 1 | Bring one Studio template to Danny-level authorship and eliminate renderer warnings | Makes the product promise repeatable, not a one-off demo | P1 |
| 2 | Baked/static lighting + calibrated PBR material kit | Largest realism gain per runtime cost | P1 |
| 3 | Progressive/KTX2 asset pipeline and budgets | Faster entry protects sharing conversion | P1 |
| 4 | Better work mounting, scale cues and light/fidelity validation | The creator’s work—not the room—is the value | P1 |
| 5 | Story-quality Guided tour authoring | Differentiates presentation from a generic walkthrough | P2 |

---

## 10. Technical Product Audit

### 10.1 Save, autosave, recovery and versioning

Local project-scoped IndexedDB autosave, fallback keys and recovery are strong for no-account activation. Risks: device-local scope, storage eviction/private browsing, quota failure and misleading “saved” language. Show storage location and last durable save; provide manual export and, after signup, an explicit cloud-backup path.

Published writes use revision checks and stable identity, protecting against silent overwrite. That is not version history. Add immutable publication revisions plus metadata and a restore operation before calling the feature “versions.” Real-time co-editing is not needed; clear conflict resolution is.

### 10.2 Firebase/Auth/Firestore/Storage/Functions

Architecture is sensible for the current scale: client Auth, Firestore records, Storage assets, callable Functions for privileged publication/invitation/lifecycle operations and security rules/tests. Production gates:

- re-run the complete anonymous/owner/editor/viewer × public/unlisted/private × draft/published/trash matrix on the final LIEUVA domain;
- verify authorized domains, password/email action URL, OAuth consent brand and redirect behavior;
- verify App Check **enforcement** and rejection metrics, not only client initialization;
- rate-limit/signature-check privileged and email endpoints; set per-user/storage/publication quotas;
- validate MIME by bytes/decoding, dimensions and decompression bounds; scan or moderate broader uploads before adding formats;
- document cleanup/idempotency, alert on stuck publication reservations and orphaned assets;
- replace long-lived GitHub service-account secrets with workload identity/OIDC where supported;
- test Firebase account switch, token expiry, revoked role and offline/retry states.

### 10.3 ACL and invitations

Owner/editor/viewer is the right minimum. Define capabilities centrally and mirror them in UI, Functions and rules. A viewer is an invited private visitor, not a public visitor. Required invitation behavior: expiry, single intended recipient, resend, revoke, accepted identity, role change, audit event and safe response when already used/wrong account.

### 10.4 Error handling and observability

Console errors are not an operational system. Add:

- privacy-conscious client error monitoring with release, route, template, device/GPU class and anonymous correlation ID;
- Web Vitals plus Space-ready/FPS/context-loss RUM;
- structured Function logs and alerts for publish, ACL, email, cleanup and quota failures;
- synthetic read-only checks for homepage, create, demo and a canary public Space;
- a support diagnostic code and retry path in user-facing errors.

Do not include titles, email addresses, artwork text or private URLs in telemetry by default.

### 10.5 Analytics and funnel

Minimum event taxonomy, named for product behavior rather than legacy brand:

`landing_view`, `demo_enter`, `template_view/select`, `project_created`, `first_item_uploaded`, `first_item_placed`, `preview_started`, `account_gate_view`, `signup_started/completed`, `verification_completed`, `publish_started/succeeded/failed`, `share_action`, `space_enter/ready`, `item_opened`, `tour_started/completed`, `creator_cta_view/click`, `return_project`, `invite_sent/accepted`.

Properties: route/use-case/template, visibility, device class, referrer campaign, anonymous→account correlation with consent, timing/error category. Never send user content or stable private identifiers. Define one activation event: **creator reaches navigable Walk Preview with at least three placed works**. Define first value: **creator publishes and receives one external engaged visit**.

### 10.6 Privacy, export and deletion

WP2 is locally implemented and evidenced in `audit/DATA-RIGHTS-ACCOUNT-DELETION.md`: authenticated account-wide export, recent-auth irreversible deletion, owner-versus-member handling, Storage/Firestore/Auth cleanup ordering, conservative local-draft cleanup and regression coverage are present. This is **not** a claim that the Functions/rule or live Firebase/App Check matrix has been deployed and verified.

Before public onboarding, complete the remaining external/legal layer:

- actual legal operator/controller/contact and jurisdiction;
- privacy notice covering Firebase/Google, hosting/CDN, monitoring, analytics, email, retention, international transfers and rights;
- terms/content license clarifying creator ownership, LIEUVA hosting/display license and takedown;
- cookie/consent behavior driven by actual non-essential tools, not a generic banner;
- deploy and externally verify `exportAuraAccountData` and `deleteAuraAccount`, App Check enforcement, exact cleanup and the account browser flow with isolated fixtures;
- decide provider backup/log retention, legal receipt/audit retention and whether a grace period is required (the current implementation is immediate and irreversible);
- separate delete, unpublish, trash and account deletion semantics.

### 10.7 Scalability and cost

Primary early costs are storage, media egress, Function operations, social-card generation, monitoring and support—not Firestore document count alone. Put explicit limits on source media, derivatives, public active Spaces, revisions and concurrent viewers. Measure bytes uploaded, derivatives generated, monthly public egress and p95 Function operations per Space. A beautiful viral Space can create an egress spike; CDN caching and immutable asset URLs are mandatory.

### 10.8 Brand versus technical migration classification

Three rules:

1. **Visible rebrand:** everything a user, recipient, crawler, browser, app-store/PWA prompt or support contact sees becomes LIEUVA.
2. **Sensible technical rename:** new public abstractions and new code use Project/Space where it improves product clarity; legacy adapters remain.
3. **Avoid cosmetic migration:** stable IDs, collections, callable names, storage paths, local databases, exporter import compatibility and old share URLs remain until a user-value migration exists.

---

## 11. DannyHirschArts Quality Gap

| Area | DannyHirschArts | Studio templates | Published Spaces | Required resolution |
|---|---|---|---|---|
| Scene authorship | Authored GLB and metadata | Procedural/configurable | Template-derived | Raise one launch template to authored reference quality; do not market Danny as average output. |
| Lighting/material | Deliberately art-directed | More generic/configurable | Inherits template/user settings | Provide locked quality presets and calibrated work lighting. |
| Navigation | Curated anchors/tour | Generic placement-derived modes | Depends on creator data | Validate tour stops and fallback when creator data is incomplete. |
| Content | Specific exhibition story | Image/artwork fields | Same art-centric schema | Introduce contextual Work/Content abstraction before broader claims. |
| Performance | Desktop/mobile asset strategy | Procedural geometry and user media | Variable user media | Enforce per-template/media budgets and derivatives. |
| Branding | Danny leads; AURA chrome | AURA Studio | AURA/private-room copy | LIEUVA attribution consistent and subordinate to creator identity. |
| Controls | Shared visitor controls | Author + preview controls | Shared visitor controls | Keep shared core; version and test one contract. |
| Accessibility | Directory/details available | Authoring controls dense | Depends on metadata completeness | Require title/alt/description rules and equivalent directory. |
| Proof | Visually compelling | Can appear less refined | Quality varies | Publish honest “made with template” examples and quality tiers. |
| Console | Texture warnings in earlier production evidence | No current interactive session in this audit | Asset-dependent | Reproduce first; make zero unexpected renderer warnings a release gate. |

---

## 12. LIEUVA Brand Validation

**WP3 authority:** the final frozen decision, current 23 August 2026 desk check, exact language contract and protected technical identifiers are in `audit/LIEUVA-BRAND-CONTRACT.md`. This section preserves the broader audit evidence; where wording differs, the Brand Contract governs WP4.

### 12.1 Result

**Frozen WP3 verdict: PASS WITH CONDITIONS.** No obvious exact-name company, spatial-platform competitor, severe multilingual meaning or indexed exact-handle conflict surfaced in the 23 August 2026 open-web screen. Exact-name results are mostly historical misspellings of Lithuanian `Lietuva`, including philatelic records, rather than an active technology brand. Active LIEVA technology uses are a concrete similarity-search condition, but no finding justifies reopening naming without counsel finding overlapping earlier rights. This is **not trademark clearance** and not legal advice.

Conditions before public exposure:

1. Keep `lieuva.com` as the canonical domain; consider only cost-effective defensive variants.
2. Run exact, phonetic and similarity searches in relevant Nice classes/territories with trademark counsel.
3. Decide and document one pronunciation; test hear-once spelling with target users.
4. Reserve platform-native handles and verify entity names directly inside each platform.

### 12.2 Meaning, pronunciation and writability

The French root `lieu` means place/location ([Larousse](https://www.larousse.fr/dictionnaires/francais/lieu/47076)). That gives LIEUVA a legitimate semantic bridge to PLACE without describing only art galleries.

Risk: English, German and Dutch speakers will not automatically derive French `[ljø]`, and the added `-va` allows several plausible pronunciations. Recommended international spoken form: **lee-OO-vah**. Put pronunciation in the brand guide, press/about material and founder pitch; do not make the homepage teach a linguistic puzzle. Run a minimum 10-person test across English/German/Dutch/French: say it once, ask participants to write it and describe the category later. Acceptance target: ≥80% correct spelling after one correction-free hearing and no dominant negative association.

“Lieuva” also appears as a rare historical misspelling/variant around Lithuanian `Lietuva`, including stamp catalog noise. This is minor search noise, not a consumer-negative meaning found in the screen.

### 12.3 Company and phonetic conflicts

No relevant exact LIEUVA organization dominated the Google brand SERP. Adjacent names found included **LIEVA**, **LEEVIA**, **LEEVA**, **LUVEA**, **LUVIA** and **LEUVA** across health, marketing, insurance, jewelry, software and commerce. None was an obvious direct spatial-publishing collision, but LIEVA/LEEVIA are sufficiently close to include in a professional similarity search.

Current direct/adjacent category brands are descriptive or distinct—KUNSTMATRIX, Artsteps, ArtPlacer, Exhibbit, Menel, New Art City, oncyber, Spatial, Shapespark and Foveate. LIEUVA is differentiated from art-specific descriptive naming and can scale beyond galleries.

### 12.4 Domain and handle screen

`lieuva.com` is owned, resolves to GitHub Pages and returned HTTP 200 during this audit. That settles the primary-domain question, not trademark or handle rights. Recommended defensive order:

1. `lieuva.com` — primary and already active.
2. `lieuva.eu` and `lieuva.nl` — defensive/market trust.
3. `lieuva.app` — defensive/product redirect.
4. `.studio`, `.space`, `.io`, `.co` only if inexpensive; redirect to the canonical domain.

Search-engine screens for exact GitHub/Instagram/X/LinkedIn names did not reveal a prominent exact LIEUVA account. TikTok could not be reliably screened through search because of crawler restrictions. Search indexing is incomplete; check and reserve handles directly, using one consistent `@lieuva` or `@lieuvahq` fallback.

### 12.5 Trademark due diligence

The EUIPO itself directs users to eSearch plus/TMview for identical and similar marks, and TMview aggregates participating offices ([EUIPO](https://www.euipo.europa.eu/en/trade-marks/after-applying/where-to-watch)). Required professional search:

- EUIPO eSearch plus and TMview: exact `LIEUVA`, prefixes/suffixes, phonetics and device marks.
- [WIPO Global Brand Database](https://www.wipo.int/en/web/global-brand-database)/Madrid system; WIPO itself recommends also searching national/regional registers.
- [USPTO Trademark Search](https://www.uspto.gov/trademarks/search).
- [BOIP/Benelux register](https://support.boip.int/hc/nl/articles/23546410785041-Wat-is-het-BOIP-Merkenregister) plus relevant national/company-name registers and [TMview](https://www.tmdn.org/tmview/).
- Likely Nice classes for counsel to confirm: 9 (software/downloadables), 35 (business/showcase services where applicable), 38 (communications), 41 (cultural/educational exhibitions), 42 (SaaS/design/hosting). Product scope and filing strategy decide the actual list.

**Decision point only if counsel finds:** an earlier identical/highly similar mark with overlapping SaaS/exhibition/creative-platform services, a credible opposition risk, or blocked principal domain/handle ownership that materially damages use. Do not autonomously select another name.

### 12.6 Branded-search potential

The near-empty exact SERP is favorable: LIEUVA can become an ownable branded query. The weakness is initial ambiguity and spelling. Resolve with consistent entity signals: canonical domain, `Organization` markup, same logo/name/contact across About/legal/social profiles, stable handles, press/case citations and a clear descriptor adjacent to the name.

---

## 13. AURA → LIEUVA Migration Plan

The Step 1 inventory found **388 matching lines across 58 files** for AURA/Aura/aura outside generated dependencies/build output. Count alone is misleading: many are stable technical contracts or CSS/assets. Classify by audience and migration risk.

### 13.1 Must rename before LIEUVA public launch

| Surface/finding | Evidence/examples | Action |
|---|---|---|
| Visible logo/wordmark/status | `src/components/Logo.tsx`; `AURA Light Preview` in `src/App.tsx` | LIEUVA logo, wordmark, beta label and accessible names. |
| Landing/Discover/Studio/Viewer/Account copy | `src/App.tsx`, account/auth/access components, repository error strings | Replace public AURA and art-only platform language; retain contextual exhibition copy in art use cases. |
| Page titles and metadata | `index.html`; route title map in `App.tsx` | LIEUVA title/description/H1; route-specific server metadata. |
| Open Graph/Twitter/JSON-LD | `index.html` points to GitHub/AURA hero | Brand and per-Space dynamic cards/canonical. |
| PWA/browser identity | `public/site.webmanifest`, favicon/app icons/theme/install prompt | LIEUVA name, short name, icons and start URL. |
| Robots/sitemap public host | `public/robots.txt` and `public/sitemap.xml` now use `lieuva.com`, but the sitemap lists only `/` | Preserve the canonical host and generate eligible public route/Space entries later. |
| Transactional/marketing email | `functions/src/emailTemplates.ts`; unsubscribe HTML in `functions/src/index.ts` | LIEUVA sender, wordmark, subjects, links, legal footer and consent copy. |
| Firebase Auth/OAuth-facing templates | Firebase console/action URLs/authorized-domain brand | Update only after final domain; test verification/reset/Google flows. |
| Data/privacy/support/legal | `src/App.tsx` data page, README/setup/docs and live sender footer | LIEUVA legal entity/operator, contacts, service list and rights flows. |
| Export display name/filename | user-visible `.aura.json`, `aura-account-data-*` and labels | WP4 may use LIEUVA-visible download names/copy, but must preserve embedded `aura-gallery-export`/`aura-account-export` schema identifiers and all legacy compatibility. |
| Repository/hosting presentation | README, repository description, GitHub Pages labels | Public-facing docs/descriptions become LIEUVA; preserve technical history. |
| Demo/sample copy | AURA example titles/status/alt text | Rename unless it is explicitly migration history. |

### 13.2 Should rename opportunistically

| Surface | Recommendation |
|---|---|
| Package/application identifiers | Rename human-facing package description. Internal npm package name can wait if private and deployment-safe. |
| CSS classes such as `aura-*` | Keep during rebrand unless touched; rename only in bounded refactors with visual regression coverage. They are invisible and low value. |
| Source comments/test descriptions | Rename when they describe current user behavior; retain historical/migration comments where useful. |
| New analytics events | Use neutral behavior taxonomy, not `aura_*` or `lieuva_*`; map old events in reporting. |
| Template/demo asset display labels | New catalog labels use LIEUVA/neutral terms; filenames can remain stable. |
| Function parameter labels/config descriptions | Add new LIEUVA-named config interface during an intentional Functions release; keep legacy aliases temporarily. |

### 13.3 Keep internally now

| Legacy contract | Examples | Reason |
|---|---|---|
| Firestore collection and domain fields | `galleries`, `gallery`, `artworks` | Renaming creates data/rules/query migration risk without user value. Wrap in Project/Space adapters. |
| Firebase project/config identity | `virtualartplattform` and existing app IDs | Internal infrastructure; new domain/brand does not require a new project. |
| Callable Function names | `beginAuraGalleryPublication`, related endpoints | Deployed API contract. Add aliases only when a functional API version warrants it. |
| Storage paths/object keys | gallery/art asset hierarchy | Existing URLs, rules and cleanup depend on them. |
| Local IndexedDB/storage keys | `aura-gallery-editor`, `aura-gallery-project-v2`, legacy fallback | Renaming can strand drafts. Keep and document as legacy persistence. |
| Blender/GLB extras | `aura_role`, `aura_surface_id`, named collections | Asset pipeline contract. Introduce v2 neutral schema later; support both. |
| Existing asset filenames | `aura-*` paths used by scenes/metadata | Renaming breaks caches/references for no visible benefit. |
| Existing IDs/share route keys | gallery IDs, revision IDs, `#/g/...` | Preserve forever or redirect; never invalidate published links for branding. |

### 13.4 Requires controlled migration

- **Domain/hosting:** add canonical LIEUVA host, SSL, DNS, Firebase authorized domains, CSP/connect/image sources, App Check domain, redirects and monitoring. Keep GitHub URL redirecting where possible.
- **Clean routes:** issue `/spaces/{slug-or-id}` and `/creators/{slug}` while resolving legacy `#/g/{id}`. Store stable immutable ID separately from mutable slug.
- **Email/auth:** deploy LIEUVA sender/domain authentication, action links and templates together; preserve outstanding AURA verification links for a grace window.
- **Analytics/Search Console:** create new property/stream or update carefully; annotate migration date, map legacy events and verify both hosts during transition.
- **Export:** write `lieuva-space-export` v2; import both `aura-gallery-export` v1 and v2 indefinitely. Provide round-trip tests.
- **Structured content schema:** add neutral capability view and migration-on-read/write adapter only when a non-art use case needs it. Do not rewrite all records.

### 13.5 Do not rename because risk exceeds benefit

Do not rename the existing Firebase project, Firestore collections, deployed callable endpoint names, Storage roots, IndexedDB database, legacy local keys, existing document IDs, published URLs or current GLB metadata merely for cosmetic consistency. Mark them as **legacy technical contracts** in architecture documentation and hide them behind neutral interfaces.

### 13.6 Separate migration plan

**Phase 0 — secure and decide (P0)**

1. Preserve control of `lieuva.com`, reserve priority handles/defensive domains, and commission trademark similarity search.
2. Choose pronunciation, legal operator name, canonical host and support/sender addresses.
3. Freeze LIEUVA messaging hierarchy and visible terminology.
4. Inventory all public URLs, email templates, OAuth/Auth action links, Firebase authorized domains, App Check, Analytics and Search Console properties.

**Phase 1 — compatibility-first visible rebrand / WP4 (P0)**

5. Add a centralized `brand` configuration and copy/metadata source; do not bulk-rename internals.
6. Replace customer-visible UI/PWA/base metadata/email identity and terminology using `audit/LIEUVA-BRAND-CONTRACT.md`.
7. Preserve all legacy data, callable, Storage, local-persistence, export, GLB and route contracts behind the visible layer.
8. Coordinate Auth/OAuth/sender identity externally and verify legacy links; do not rename deployed endpoints.
9. Gate with a zero-unintended-visible-AURA scan and compatibility matrix.

**Phase 2 — clean URLs, dynamic metadata and SEO delivery / WP5 (P0/P1)**

10. Add clean server-resolvable routes and permanent legacy hash resolvers.
11. Build dynamic metadata/social-card delivery for eligible public Spaces and future audience pages without leaking private/unlisted content.
12. Preserve immutable share IDs separately from slugs and verify canonical/redirect behavior.
13. Submit sitemap/Search Console signals and verify canonical, Open Graph, robots and index eligibility.

**Phase 3 — observe and clean (P1/P2)**

14. Monitor 404s, auth failures, App Check rejects, old email links, canonical selection and branded queries for at least 60 days.
15. Rename invisible code/CSS/assets only when touched or when a v2 technical contract is justified.
16. Keep a permanent migration test suite and old-link canary.

**Rollback:** visible brand assets/copy and canonical host can roll back independently; legacy IDs/data/functions never move in Phase 2, so rollback does not require database restoration.

### 13.7 Rebrand acceptance criteria

- Zero customer-visible “AURA” on anonymous, account, Studio, Viewer, email, browser/PWA, social-card, legal/support and error surfaces.
- All historical share links resolve to the same Space and permissions.
- Existing local drafts open; AURA v1 exports import; published revisions remain editable.
- Verification/reset/invite/unsubscribe links work before, during and after cutover.
- Canonical/OG/Twitter/JSON-LD use the final LIEUVA domain; private/unlisted pages never expose metadata content.
- No Firestore/Storage mass rewrite is required for launch.

---

## 14. SEO Strategy

### 14.1 Current diagnosis

The SEO problem is structural, not a missing keyword list:

- fragment routes represent distinct content behind one fetchable HTML document;
- metadata/canonical/JSON-LD are static AURA/GitHub Pages values;
- sitemap lists only the static shell;
- public Spaces, creators and Discover entries have no server-rendered/indexable descriptive page;
- the homepage lacks a clear H1/category statement;
- private/unlisted/public semantics are not an indexing policy.

Google’s current JavaScript SEO guidance explicitly recommends History API routes rather than fragments for distinct SPA content ([Google Search Central](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)). Therefore clean URLs and per-route HTML metadata are P0 for the proposed organic flywheel.

### 14.2 Search-intent map

This is a qualitative current-SERP judgment; validate volumes/CPC/difficulty in Search Console and a professional keyword tool after the domain exists.

| Query field | Dominant intent | LIEUVA relevance | Competition | Conversion proximity | Content/roadmap decision |
|---|---|---:|---:|---:|---|
| virtual exhibition platform | Compare tools to publish a show | Very high | High/established | Very high | Launch commercial page with demo, workflow, examples, pricing/FAQ. |
| virtual exhibition creator / online exhibition maker | Hands-on creation | Very high | Medium-high | Very high | Launch page; interactive template proof and no-install promise. |
| 3D exhibition | Mixed examples/tools/definition | High | High | High | Launch hub with examples and creator CTA. |
| virtual gallery | Mixed visitor/tool/room intent | High for wedge | Very high | Medium-high | Use `/virtual-art-galleries` or consolidate with exhibition hub; avoid duplicate near-pages. |
| online gallery for artists | Artist solution/comparison | Very high | High | Very high | `/for/artists` launch page. |
| immersive / interactive exhibition | Inspiration + technology + services | High | Medium | Medium | Editorial guide/case cluster linking to product page. |
| virtual museum | Visitor destinations + museum vendors | Medium | High | Medium B2B | Post-launch once governance/accessibility case exists. |
| online graduate exhibition / virtual degree show | Examples and institutional solution | High | Lower but episodic | High B2B | Early `/for/graduate-shows`; needs pilot proof and multi-creator workflow. |
| architecture presentation | Mostly techniques/templates/software, often non-3D | Medium future | Very high | Medium | Do not launch a generic page until product supports the job. Research guide first. |
| interactive architecture presentation | Tool/service inspiration | High future | Medium | High B2B | Post-launch solution page with a real architecture case. |
| 3D / immersive portfolio | Inspiration, portfolios and builder tools | High future | High | Medium-high | Post-launch hub when non-art template/media model ships. |
| spatial experience | Agencies, real estate, XR/conceptual | Broad/ambiguous | High | Low | Thought leadership only; not primary acquisition category. |
| spatial publishing | Sparse/technical/ambiguous | Strategic language | Low direct, unclear | Low today | Own definition through a manifesto later; not homepage keyword. |

The current SERP contains direct, active tool propositions from Menel, KUNSTMATRIX, Exhibbit and ArtPlacer for exhibition queries, while “spatial” results are led by Spatial/XR and unrelated spatial services. That supports plain category copy.

### 14.3 Recommended IA

**Launch, indexable**

```text
/
/create
/templates
/discover
/for/artists
/for/galleries
/for/graduate-shows
/virtual-exhibitions
/3d-exhibition-maker
/showcase/{case-slug}
/spaces/{stable-slug-or-id}
/creators/{creator-slug}
/pricing
/about
/data-and-privacy
/terms
/content-guidelines
/help
```

Avoid simultaneously launching `/virtual-exhibition-platform`, `/virtual-exhibition-creator`, `/online-exhibition-maker`, `/3d-exhibition`, `/virtual-gallery` with near-identical copy. One strong `/virtual-exhibitions` hub and one task page `/3d-exhibition-maker` cover the initial cluster; use sections/FAQ and consolidate weak variants.

**Post-launch only with product/case proof**

```text
/for/museums
/for/universities
/for/architects
/for/designers
/for/studios
/immersive-portfolios
/3d-portfolios
/interactive-architecture-presentations
/resources/{topic}
```

Do not publish empty audience doors “for SEO.” Each solution page needs a specific workflow, applicable template, proof/case, constraints, FAQ and conversion path.

### 14.4 Homepage search specification

**Title:** `LIEUVA — Create and publish immersive 3D spaces`  
**Meta description:** `Turn art, design and ideas into interactive 3D spaces people can explore in any browser. Start from a template, no 3D expertise required.`  
**H1:** `Give your work a place.`  
**Supporting copy:** `LIEUVA is an immersive 3D presentation platform. Create, publish and share browser-based spaces for art, design and ideas—without learning 3D software.`

Title can be tested against a more wedge-specific version during launch; do not change the claim simply to insert “virtual gallery.”

### 14.5 Technical metadata specification

- One self-referencing canonical per indexable clean URL; 301 host/protocol/legacy duplicates. Google treats redirects and `rel=canonical` as strong signals and advises against fragment canonicals ([Google](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)).
- Server/edge-render title, description, canonical, OG and Twitter/X card before crawler/social fetch. Do not rely on post-load `document.title`.
- `Organization` JSON-LD on homepage/About: legal/public name, `url`, logo, contact point and verified `sameAs`. Current Google guidance recommends organization markup on home/about and useful real identity properties ([Google](https://developers.google.com/search/docs/appearance/structured-data/organization)).
- `WebSite` JSON-LD on homepage with name, alternate name and canonical URL. Add `SearchAction` only when a genuine public search experience exists and conforms to current eligibility.
- Creator pages: `ProfilePage` with `Person` or `Organization`, public image/bio/sameAs and links to Spaces; Google supports creator/organization profile markup when the page focuses on that entity ([Google](https://developers.google.com/search/docs/appearance/structured-data/profile-page?hl=en)).
- Space pages: use `CreativeWork` as conservative base; add truthful subtypes such as `VisualArtwork`, `ImageObject`, `VideoObject`, `ExhibitionEvent` only when visible content and dates satisfy the schema. Do not invent a `3DModel` rich result expectation.
- Dynamic 1200×630 social card: representative work/space image, title, creator, LIEUVA; no private data; deterministic fallback.
- XML sitemap index: static/solution/case pages, approved public Spaces, eligible creator profiles. Use `lastmod` from meaningful published changes. Exclude drafts, private, unlisted, trash and low-quality pending pages.
- `robots.txt` allows required rendering assets and points to canonical sitemap. It is not a privacy control.

### 14.6 Public, unlisted, private and Discover indexing

| State | Access | Search directive | Sitemap/Discover |
|---|---|---|---|
| Public, quality-approved | Anonymous | `index,follow`, self canonical | Sitemap + eligible Discover |
| Public, new/untrusted/thin | Anonymous | `noindex,follow` until eligibility | Not sitemap; may appear in creator dashboard only |
| Unlisted | Anyone with link | `noindex,nofollow` (or `follow` by policy); generic non-sensitive preview | Never sitemap/Discover |
| Private | Authorized users only; return 401/404 appropriately | `noindex,nofollow`, no content in HTML/OG/cache | Never sitemap/Discover |
| Trash/deleted | None | 410 after retention; noindex during grace | Remove from sitemap immediately |

Crawler directives are readable only when crawlers can access the page; login is the actual private protection. Google’s robots-meta documentation states that `noindex` must be accessible to be observed ([Google](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)).

### 14.7 UGC SEO flywheel without index bloat

Index eligibility should require:

- verified creator; public consent to indexing;
- unique title, useful summary, creator attribution and representative image;
- minimum meaningful content and successful render/performance check;
- no prohibited/spam content; moderation/risk score;
- no near-duplicate publication/canonical conflict;
- sustained availability, not a one-hour test;
- human/editorial boost for Discover, separate from base index eligibility.

Mark untrusted outbound creator links `rel="ugc"` and build abuse controls. Google recommends UGC link qualification and monitoring open platforms for spam ([Google](https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links)). Concentrate public UGC under `/spaces/` and `/creators/` for monitoring. Report indexed/eligible/excluded counts, soft-404s, spam/takedowns, crawl activity and non-branded engaged conversions.

The flywheel is:

```text
quality creator Space → indexable description/profile → search/share visitor
→ engaged exploration → creator attribution/LIEUVA CTA → new Project
→ reviewed public Space → more relevant inventory
```

Thin pages do not enter the loop. Discover should link only to canonical Space pages, not generate faceted index permutations.

---

## 15. Competitor Analysis

### 15.1 Market map

| Category | Relevant current products | What users buy |
|---|---|---|
| Virtual exhibition platforms | Menel, KUNSTMATRIX, Exhibbit, Artsteps | Fast gallery/exhibition creation from art-centric rooms. |
| Online gallery/sales builders | ArtPlacer, KUNSTMATRIX | Exhibition plus inventory, AR, collector/contact/sales workflow. |
| Spatial/3D web platforms | Spatial, oncyber, New Art City | Flexible worlds, community, multiplayer/digital-native media. |
| Architecture presentation | Shapespark, Foveate | Client-ready walkthroughs, embeds, analytics and existing 3D workflow integration. |
| Portfolio platforms | Behance, Adobe Portfolio, Squarespace/Webflow/Framer | Fast, familiar, searchable 2D identity and case studies. |
| Creator/discovery | Behance, ArtStation, New Art City, Spatial | Audience, profiles, feed/community and reputation. |
| Adjacent future competition | Matterport/3D tour tools, Canva/Figma presentation, Unity/Unreal Web exports, no-code site builders | Existing workflow, flexibility, capture realism or broad publishing distribution. |

### 15.2 Product comparison

| Product | Position/audience | Creation/templates | 3D/mobile | Sharing/discovery/network | Collaboration/business | Pricing signal | LIEUVA implication |
|---|---|---|---|---|---|---|---|
| **Menel** | “3D exhibition platform for artists & institutions” | Browser editor, rooms, works, lighting/frames | First-person browser, touch/gyro | Link + public galleries | Institution direction | Free; public page currently advertises low-cost Pro/lifetime | Closest simple-art proposition; LIEUVA must win on authored quality, story and professional lifecycle. |
| **KUNSTMATRIX** | Art presentation/management ecosystem | Spaces marketplace, image/sculpture/audio/video | Mature virtual exhibition + AR | Embed, featured exhibitions, sales contact | EDU, custom digital twins, CRM/inventory | Current site: trial; €10/€25/€50 monthly tiers | Deep art operations and installed credibility; do not compete on feature count initially. |
| **Exhibbit** | Artists/galleries publish and promote 3D shows | Browser curation | Cross-device virtual gallery | Link/show promotion | Art-specific | Verify during pricing study | Demonstrates established intent language; differentiation must be more than browser 3D. |
| **ArtPlacer** | Artists/galleries/collectors | Virtual exhibitions + inventory/AR | Strong placement/visualization utility | Embed/link, sales workflow | Gallery commercial workflow | Paid SaaS | Art commerce is an adjacent job LIEUVA should integrate later, not rebuild now. |
| **Artsteps** | Accessible VR exhibition community | Community builder/templates | Browser/VR orientation | Public community | Education usage | Free/accessible signal | Low barrier/community; LIEUVA can differentiate through current visual polish and governance. |
| **New Art City** | Virtual toolkit for new-media art | Built-in artwork/space tools, flexible worlds | Browser/mobile, real-time multiplayer | Strong curated public shows/events | Collaborative production | Mission/community-led | Strong culture/network and digital media; validates graduate-show/community wedge. |
| **oncyber** | “Build your own world, experience with others” | World creation, Web3 heritage | High-style realtime worlds | Feed/community | Creator ecosystem | Current plan study needed | Brand/world flexibility; LIEUVA should stay work/presentation-led rather than metaverse-led. |
| **Spatial** | UGC worlds, education, training, brands/games | No-code templates + Unity SDK; 2D/3D/video | Web/mobile/XR/multiplayer | Millions-scale Explore/profile/social | Pro/business, analytics, vanity URLs | Tiered creator/business | Far broader platform; avoid avatars/games race. Win with focus, editorial quality and no-expertise authoring. |
| **Shapespark** | Architecture/AEC walkthroughs | Imports architecture workflows | Realistic web walkthroughs | Share/embed | Client/business delivery | B2B SaaS | Architecture requires model pipeline and client review, not renamed art walls. |
| **Foveate** | Architecture proposal storytelling | 3D + video + narrative presentation | Client-facing interactive link | Branded link/analytics | Proposal/business workflow | Sales-led | Story + analytics are core architecture value; use as requirements benchmark later. |

Source snapshots: [Menel](https://www.menel.art/), [KUNSTMATRIX](https://www.kunstmatrix.com/en), [New Art City](https://info.newart.city/about), [oncyber](https://oncyber.io/), [Spatial](https://www.spatial.io/?login=true), [Shapespark](https://www.shapespark.com/), [Foveate](https://foveate.com/presentations/), [ArtPlacer](https://www.artplacer.com/virtual-exhibitions/), [Exhibbit](https://exhibbit.com/).

### 15.3 Strategic differentiation

LIEUVA should not claim “the first virtual gallery builder.” The defensible combination is:

1. authored presentation quality without 3D expertise;
2. work-first spatial storytelling, not avatar/world-first social gaming;
3. one durable, fast browser publication across devices;
4. professional creator lifecycle—draft, review, access, update, version, attribution, analytics;
5. a brand/category broad enough to expand through proven templates.

The hard-to-copy asset is not WebGL. It is a library of high-quality spatial presentation systems, reliable publishing infrastructure, creator/audience data and a discovery corpus with taste.

---

## 16. Go-to-Market Strategy

### 16.1 Pilot offer

Run a 12-week **LIEUVA Founding Spaces** program for 10–15 independent artists/small galleries and 2–3 graduate-show teams:

- free/low-cost managed setup in exchange for structured research, permission to publish a case and outcome data;
- one launch template with white-glove content preparation and a fixed opening date;
- co-created social card/QR and optional physical-show companion;
- weekly office hour; response-time expectation; no implied enterprise SLA;
- success review: time to publish, visitors, engaged works, tour completion, shares, creator referral and willingness to pay.

Do not offer unlimited custom 3D production under a SaaS pilot. Price custom environment work separately or exclude it.

### 16.2 Required demonstrations and proof

Launch proof set:

1. independent artist solo collection;
2. photographer/editorial series;
3. small gallery/group show;
4. managed graduate art/design show;
5. DannyHirschArts technical/reference case clearly labeled as authored reference.

Post-launch proof: one architecture project only after model/media/annotation support; one brand experience only after analytics/custom identity/performance governance.

Every case study should state problem, source material, time to build, device reach, creator quote, visitor outcome and what was template versus custom. Avoid vanity visitor totals without engagement context.

### 16.3 Conversion paths

- Search solution page → relevant example → matching template → no-account first preview → account at publish.
- Shared Space → creator/work attribution → post-engagement LIEUVA CTA → preselected template.
- Physical exhibition QR → visitor Space → newsletter/follow creator (separate consent) → creator referral.
- Institution outreach → tailored demo → scoped pilot → Business requirements review.
- Social content → 15–30 second screen capture → live Space, not a generic homepage.

### 16.4 Content and lifecycle

Content pillars:

- practical: how to curate/publish an online exhibition, prepare images, write labels, light digital work;
- inspiration: exceptional spatial presentations with creator commentary;
- professional: hybrid exhibitions, graduate-show accessibility, archival/publication strategy;
- technical transparency: browser compatibility, color, performance and ownership;
- emerging category: “spatial publishing” manifesto only after plain-language product pages rank/convert.

Email journey:

1. verification/invite/security transaction;
2. draft recovery or “continue your Space” based on explicit account behavior;
3. publish success + share checklist;
4. 7-day insight summary;
5. event/archive/update reminder;
6. optional editorial newsletter under separate consent;
7. upgrade only at a demonstrated limit/value moment.

### 16.5 Trust needed for launch

Operator/contact identity, privacy/terms/content guidelines, ownership/license summary, deletion/export, supported browser/device statement, accessibility/reduced-motion statement, public status/support page, honest beta limits, real examples, and transparent pricing/no-billing language.

### 16.6 Launch decision gate

Open self-serve only when all P0 acceptance criteria pass and at least five pilots publish successfully, ≥80% of pilot creators can update/share without founder intervention, p75 visitor Space-ready meets the defined device target, and no unresolved security/privacy incident exists.

---

## 17. Launch/Pilot Readiness

**Launch decision: not ready for open self-service; ready for controlled, founder-supported pilots after the P0 release gate.** The creator and visitor core is credible, but production trust cannot be inferred from green unit tests. The immediate gate is a non-destructive staging/live matrix covering new publish, in-place update, reload/recovery, visibility changes, owner/editor/viewer permissions, invitation acceptance, expired/revoked access, Storage media resolution, App Check and retry behavior.

Required before a public beta:

1. Every P0 acceptance criterion in the §19 work-package table passes with dated evidence and an owner.
2. Legal operator, privacy, terms, content/takedown, retention, export and deletion behavior are published and match implementation.
3. Five pilot Spaces can be created, updated and shared; at least 80% of pilot creators complete the second update without founder intervention.
4. Public, unlisted and private metadata/access matrices show no content leak.
5. Production errors, App Check rejects, Function failures, storage/bandwidth and Firebase spend have alerts and rollback/runbooks.
6. The visible product is consistently LIEUVA while all legacy persistent contracts remain compatible.
7. One authored/template output is close enough to DannyHirschArts that the landing promise is honest.

Pilot format: 10–15 Founding Spaces, one real publishing deadline each, a 30-minute onboarding ceiling, written permission for selected case-study use, explicit beta limits, weekly issue review and no promise of broad paid availability. Do not treat bespoke 3D production as included SaaS support.

## 18. Prioritized P0–P3 Backlog

- **P0 — launch/data/security/core:** production publish/update/access release gate; legal operator and complete data rights; App Check/ACL/quota/alert proof; coordinated visible LIEUVA migration; authenticated email/Auth identity; clean Space URLs and privacy-safe metadata.
- **P1 — convincing pilots:** immediate landing comprehension; mobile creator simplification; one reference-quality template; progressive visitor loading/performance budgets; clear draft/live/share UX; curated Discover/moderation; Account Project/Space information architecture; privacy-safe observability; five evidence-rich cases.
- **P2 — major quality/growth:** neutral Project/Space/Content capability adapters, restorable version history, validated pricing/entitlements, creator profiles, audience-specific SEO clusters and lifecycle retention.
- **P3 — later:** multilingual/hreflang, marketplace, advanced embeds/custom domains, synchronous co-editing, native/VR apps and broad AI authoring. These are not launch requirements without pilot evidence.

The work-package table below is the actionable backlog. Each row contains evidence, impact, solution, affected systems, effort, risk, dependencies, owner decision and measurable acceptance.

## 19. Recommended next 20 work packages

Legend: effort S ≤3 focused days, M ≤2 weeks, L 2–5 weeks, XL multi-stream/unknown. “Impact” is expected user/business impact. Estimates assume the current architecture is preserved.

**Current execution status (23 August 2026):** WP1 is locally complete with conditions (`audit/PUBLISH-UPDATE-RELEASE-GATE.md`); WP2 is locally complete with conditions (`audit/DATA-RIGHTS-ACCOUNT-DELETION.md`); WP3 is complete with legal/external conditions (`audit/LIEUVA-BRAND-CONTRACT.md`). External Firebase/App Check/browser verification for WP1/WP2 and legal decisions are not represented as complete. The next repository package is WP4, followed by WP5. The numbered table below remains the evidence-backed broader backlog, not a second work-package sequence.

| # / Pri. | Concrete problem + evidence | User/business impact | Concrete solution | Files/systems | Effort / impact | Risk | Dependencies | Decision needed | Measurable acceptance criterion |
|---|---|---|---|---|---|---|---|---|---|
| **1 P0 · local PASS WITH CONDITIONS** | The deterministic release gate now passes locally; deployed Firebase/App Check/browser parity remains unverified | A deployment mismatch can still block the product’s core promise or lose trust | Execute the documented external owner/editor/viewer matrix with isolated fixtures and exact cleanup; fix only reproduced defects | Functions, rules, Storage, App Check, browser QA; `audit/PUBLISH-UPDATE-RELEASE-GATE.md` | M / high | Test-data leakage or false confidence | Two isolated test accounts, test Spaces, Firebase project access | Which environment may hold test data; cleanup policy | External matrix passes twice; stable URLs/revisions preserved; failures are recoverable and logged; prefixed data removed |
| **2 P0 · local PASS WITH CONDITIONS** | Account export/deletion is implemented and locally tested; deployment, provider behavior and legal operator/retention decisions remain open | Unsafe claims or incomplete production data rights | Deploy and externally verify the existing flow; complete privacy/terms/content/takedown and retention/controller decisions | Legal pages, Account, Auth, Firestore/Storage/Functions/email; `audit/DATA-RIGHTS-ACCOUNT-DELETION.md` | M / high | Incomplete or over-broad deletion | Legal counsel; isolated accounts; deployed Functions/rule | Retention/grace/license/controller policy | Isolated account exports readable data and deletes exact owned resources; legal pages identify operator and match behavior |
| **3 P0 · WP3 complete with conditions** | LIEUVA category, claim, audience, terminology and protected technical contracts are frozen; professional similarity clearance and handle reservation remain external | Rework or later rights conflict if external conditions are ignored | Use `audit/LIEUVA-BRAND-CONTRACT.md`; counsel searches LIEUVA/LIEVA/LIUVA variants and owner reserves handles | Counsel/registers, social accounts, brand contract | S / high | Adverse legal result | Owner/legal | Territories, classes, filing applicant | Written counsel result and handle custody record; WP4 follows the frozen contract without reopening strategy |
| **4 P0** | Visible AURA remains across UI, metadata, PWA, email and errors; Step 1 found 388 matching lines in 58 files | Brand launch is incoherent despite LIEUVA domain | Centralize visible brand config and migrate customer-facing surfaces only; preserve legacy technical identifiers | `Logo.tsx`, `App.tsx`, account/access/errors, `index.html`, manifest/icons, email | M / high | Missed surface or accidental persistent rename | #3; approved assets/legal identity | Logo/icons/beta label | Automated scan plus route/email/PWA matrix finds zero unintended visible AURA; all legacy drafts/URLs/data still open |
| **5 P0** | Hash routes return one static AURA document; Google explicitly advises History API rather than fragments for distinct content | Public Spaces cannot earn unique search or reliable social previews | Select clean-route hosting/edge strategy; server-generate per-route HTML metadata; retain permanent hash resolver | Hosting, DNS, router, metadata/card service, Firebase authorized domains | L / high | Route/auth outage or private metadata leak | #3–4; host choice | Hosting architecture and slug policy | `/spaces/{id}` returns unique title/OG/canonical without JS; legacy `#/g/{id}` resolves; unlisted/private output contains no sensitive metadata |
| **6 P0** | App Check exists in code and callable Functions enforce it, but live enforcement, ACL state matrix, revision-upload abuse limits and alerts are not evidenced | Exposure, lockout or cost incident | Execute role/state tests; verify Enterprise App Check; add bounded revision/upload quotas, billing alerts and incident rollback | Firebase console, rules, Functions, Storage, QA/runbooks | M / high | False rejection or accidental access | #1; two accounts; console access | Quotas, alert thresholds, supported roles | Matrix passes; invalid token and excess quota reject safely; alert test reaches owner; rollback is documented |
| **7 P0** | Auth/email templates and sender identity remain AURA; provider delivery and action URLs are not proven end-to-end | Verification/invite flows confuse or fail at the conversion point | Coordinate LIEUVA sender, templates, OAuth/Auth action URLs, unsubscribe and legacy-link grace testing | `functions/src/emailTemplates.ts`, Functions params, Firebase Auth, DNS/email provider | M / high | Deliverability/auth break | #2–5; verified sender | Sender/reply-to/legal footer/provider | Verification/reset/invite/welcome/unsubscribe pass in Gmail and one second provider; SPF/DKIM/DMARC pass; links return to correct route |
| **8 P1** | No consent-aware product funnel, RUM or client error tracing is implemented | Failures, performance and value remain invisible | Add privacy-safe errors, Web Vitals/3D readiness, structured Function logs/alerts and minimal funnel | Client, Functions, analytics/monitoring, consent | M / high | PII leakage or noisy data | #2; vendor choice | Vendor, consent regions, retention | Synthetic error alerts; dashboard shows landing→preview→account→publish→share; payload audit finds no artwork/title/email content |
| **9 P1** | Landing lacks immediate definition/H1; Danny story dominates | Low comprehension/conversion | New LIEUVA product hero and IA; move Emil/Danny into proof case; update truthful copy | `App.tsx`, `PitchSections.tsx`, CSS/content assets | M / high | Lose distinctive feel | #2, proof assets | Hero copy/CTA | 5-second test ≥80% identify product/job; H1/heading/keyboard audit passes; CTA tracked |
| **10 P1** | 390×844 Studio is cramped/truncated | Mobile creator abandonment | Mode-specific mobile toolbar, bottom sheet, quick-edit scope and desktop recommendation for advanced tasks | `App.tsx`, Studio CSS/components | M / high | Desktop regression | UX prototype, device lab | Supported mobile authoring scope | At 390×844 no clipped primary control; upload/place/Walk/publish task completes keyboard/touch test |
| **11 P1** | Procedural output remains below Danny quality; earlier production evidence contained texture warnings that need reproduction | Trust gap after demo | Reproduce/fix any texture lifecycle defect; author one launch template with baked light/PBR; establish asset budgets | `GalleryScene.tsx`, Danny lighting, GLB/assets, material pipeline | L / high | Visual/perf regression | 3D artist/asset source | Launch template/art direction | Zero unexpected renderer warning in current matrix; blind quality test closes gap; budget/FPS/ready gates pass |
| **12 P1** | No progressive asset/quality budget system | Slow viral visits/cost | Add per-template budgets, derivatives, KTX2 where measured, staged loading, RUM | Asset tooling, Storage/CDN, loader, CI | L / high | Compression artifacts | #8, #11 | Device targets/quality bar | CI rejects over-budget asset; p75 ready/FPS targets pass on real matrix |
| **13 P1** | Publish/share has generic card and unclear draft/live distinction | Sharing underperforms; accidental expectations | Draft vs live status, update review, dynamic card, QR/copy/view-as-visitor | Studio publish UI, metadata/card service, Functions | M / high | Cache/privacy leak | #3, #5, #8 | Card design/index defaults | Each public Space card validates and is unique; unlisted/private leaks zero content; publish retry tested |
| **14 P1** | Public UGC has no index/Discover quality gate | Spam/thin-content SEO damage | Eligibility workflow, moderation/takedown, sitemap inclusion, creator consent and UGC link rules | Discover, admin/moderation, Functions, sitemap/Search Console | L / high | False positives/moderation load | #3–5, legal | Quality/moderation policy | Only eligible public Spaces enter sitemap; abuse report SLA; spam can be removed/deindexed end-to-end |
| **15 P1** | Account nouns/actions obscure Project vs Space; deletion lifecycle copy conflicts | Management errors/support load | Reframe dashboard Projects/Spaces/Invites/Trash; exact lifecycle consequences | Account components/services, copy | M / medium-high | Role regressions | #2, #4–5 | Trash retention policy | Owner/editor/viewer task suite passes; delete/trash copy matches backend and retention exactly |
| **16 P1** | Five real case studies and social proof absent | No reason to trust/pay | Run 10–15 Founding Spaces pilots and publish outcome-based cases | Research, support, content, showcase routes | L / high | Custom-service creep | P0 gates, partner recruitment | Pilot terms/incentive | ≥5 live cases; ≥80% update/share unaided; willingness-to-pay and objections documented |
| **17 P2** | Legacy art schema blocks broader use but big rename is risky | Expansion stalls or migration breaks | Add Project/Space/ContentItem/Placement capability adapters; one non-art prototype | Types/repositories/template schema/Studio | L / high | Dual-model complexity | Pilot learning | First expansion use case | Existing records/drafts/exports unchanged; one new media/surface type works via capability schema |
| **18 P2** | Revision conflict exists but no restore history | Professional users fear updates | Immutable publication history, compare metadata and safe restore | Firestore/Storage/Functions/Account/Studio | L / high | Storage cost/ACL errors | #5, cost telemetry | Retention/plan boundary | Creator restores prior live version without URL/ACL change; audit event recorded |
| **19 P2** | Pricing/limits unvalidated | Unsustainable free tier or weak conversion | Cost model, 15 interviews, limit experiments, Free/Plus/Pro/Business offer | Billing research, Analytics, Firebase cost dashboards | M / high | Premature paywall | #8, #16 | Pricing/currency/tax | Cost per active Space known; ≥10 WTP interviews; pricing page/limits pass comprehension test |
| **20 P2** | Broader SEO pages would be speculative today | Thin pages/brand overpromise | After proof, ship creator profiles and one validated graduate/architecture cluster | Content, case studies, schema, sitemap | L / medium-high | Index bloat | #14, #16–17 | Next audience | Each page has unique case/workflow/template; non-branded qualified traffic and creator starts measured |

### P3 later optimization backlog

- multilingual content/hreflang after one market converts;
- template marketplace and external creator templates after curation/security economics work;
- advanced embed/custom-domain tooling after stable canonical/tenant policy;
- real-time co-editing/multiplayer only if pilots show synchronous work is a top job;
- AI assistance only for bounded metadata/layout suggestions with creator control;
- native mobile/VR apps only when browser usage data proves a distribution gap.

---

## 20. 30/60/90-day roadmap and execution handoff

### 20.1 Days 0–30 — prove the core and freeze the contract

- **WP1 locally complete with conditions:** release matrix and regressions are recorded; external Firebase/App Check/browser execution remains.
- **WP2 locally complete with conditions:** export/deletion and data map are implemented; deployment, external verification and legal policy remain.
- **WP3 complete with conditions:** category, claim, pronunciation, language and compatibility contract are frozen; counsel/handle/asset actions remain external.
- Begin WP4 only: compatibility-first visible rebrand with no persistent identifier or route migration.
- Prepare—but do not merge into WP4—the WP5 hosting/clean-URL/dynamic-metadata migration design.
- Run live Firebase access/App Check/quota audit (#6).
- Define telemetry schema/vendor/privacy controls (#8).
- Fix the observed texture warnings and establish the first 3D budget baseline (#11 partial).
- Recruit pilot cohort, but do not promise public date before P0 gates.

**Day-30 exit:** core release matrix green; brand/domain controlled; no unresolved route architecture decision; security/legal gap list owned; pilot partners selected.

### 20.2 Days 31–60 — build the trustworthy LIEUVA surface

- Deploy/externally verify the existing WP2 flow and complete production trust/legal pages (#2).
- Complete visible LIEUVA switch in staging (#4).
- Implement clean routes/dynamic metadata and legacy URL compatibility (#5).
- Complete email/Auth identity and delivery tests (#7).
- Add error/RUM/funnel instrumentation (#8).
- Ship clear landing hero/IA (#9) and mobile Studio simplification (#10).
- Bring the launch template toward Danny quality and progressive budget (#11–12).
- Test dynamic share/publish/privacy states (#13).

**Day-60 exit:** staging is entirely LIEUVA to users; legacy data/links still work; route, auth, privacy and performance matrices pass.

### 20.3 Days 61–90 — pilot, prove and prepare controlled release

- Launch Founding Spaces pilots (#16).
- Operate quality/index/moderation gate and curated Discover (#14).
- Refine Account Project/Space lifecycle (#15).
- Publish first five cases and launch SEO pages; submit sitemap/Search Console.
- Measure activation, visitor readiness, share loop, support burden and costs.
- Complete pricing/WTP work (#19); decide whether to remain invite-only or open a capped Free tier.

**Day-90 exit:** ≥5 credible public cases; P0 gates green; quantified activation/performance/cost; go/no-go decision for self-serve.

---

### 20.4 Ownership: what Codex can do and what the owner must do

#### Codex can implement in the repository

- central brand/copy/terminology configuration and visible AURA scan tests;
- LIEUVA UI/metadata/manifest/icons once approved assets are supplied;
- clean route/legacy resolver and dynamic metadata implementation for the selected host;
- social-card generation code, sitemap/robots/canonical/schema templates;
- Project/Space adapters while preserving legacy storage contracts;
- export v2 + import v1 compatibility and tests;
- account deletion/export application and Functions code after policy approval;
- telemetry hooks, accessibility/mobile fixes, asset validation/budgets and renderer warning fix;
- role/state/migration test harnesses, runbooks and implementation documentation.

#### Owner actions in external services

- keep `lieuva.com` controlled and reserve priority social/defensive domains;
- instruct trademark counsel and decide filing jurisdictions/classes;
- choose/confirm legal operator, controller address, support contact, retention/license/takedown policies;
- configure DNS/SSL, production hosting account and redirects;
- change Firebase authorized domains, OAuth consent, Auth templates/action URLs, App Check enforcement, quotas/billing/alerts;
- create email sender/domain/provider credentials; configure SPF/DKIM/DMARC and legal footer;
- choose/configure Analytics, consent policy and Search Console/Bing properties;
- approve monitoring vendor/DPA and incident contacts;
- recruit/contract pilots, approve case-study permissions and conduct pricing decisions.

#### Information/access still required

1. Confirmation that `lieuva.com` remains the canonical production domain and who controls DNS/hosting.
2. Legal entity/operator name, address, country, support and privacy contacts.
3. Trademark counsel result and filing decision.
4. Firebase project admin access or exported screenshots/settings for Auth, App Check, billing, quotas and Functions.
5. DNS/hosting/email/Analytics/Search Console access or an owner who can execute steps live.
6. Approved LIEUVA logo/icon/social-card assets and pronunciation.
7. Target launch countries/languages, supported-device policy and accessibility commitment.
8. Pilot list, consent to use work/case results and pricing constraints.

---

### 20.5 Current five-package sequence

1. **WP1 — Publish / Update / Access Release Gate:** locally complete with conditions. External Firebase/App Check/browser matrix remains (`audit/PUBLISH-UPDATE-RELEASE-GATE.md`).
2. **WP2 — Data Rights / Export / Account Deletion:** locally complete with conditions. Deployment, external matrix and legal decisions remain (`audit/DATA-RIGHTS-ACCOUNT-DELETION.md`).
3. **WP3 — LIEUVA Brand & Product Language Contract:** complete with conditions. Trademark counsel, handle reservation, asset approval and pronunciation test remain external (`audit/LIEUVA-BRAND-CONTRACT.md`).
4. **WP4 — Compatibility-first visible AURA → LIEUVA rebrand:** next repository package. Follow the Brand Contract; preserve persistent contracts and routes.
5. **WP5 — Clean URLs / dynamic metadata / SEO delivery:** starts only after WP4 acceptance. Preserve all legacy hash links and private/unlisted metadata boundaries.

---

### 20.6 Status evidence and non-claims

- “Locally complete” means deterministic repository tests/builds and evidence documents pass; it does not mean Functions/rules were deployed or production data was exercised.
- WP1 and WP2 external steps remain exactly those listed in their evidence documents.
- WP3 does not claim legal trademark clearance.
- WP4 must not absorb WP5 route/hosting work; separating the visible rebrand from URL delivery keeps rollback and compatibility bounded.

---

### 20.7 Final decision summary

- **Positioning:** LIEUVA is a platform for creating and publishing immersive 3D presentations; “spatial publishing platform” remains the internal category.
- **Primary claim:** **Give your work a place.**
- **Beachhead:** independent visual artists and small galleries with real launch moments; a few managed graduate-show pilots.
- **Brand validation:** PASS WITH CONDITIONS; no obvious fatal exact conflict found, but legal similarity clearance, domain/handle reservation and pronunciation testing are mandatory.
- **Migration principle:** customer-visible LIEUVA everywhere; legacy Firebase/data/routes/assets remain where renaming creates risk without user value.
- **SEO opportunity:** quality public Spaces + creator profiles can form a strong non-branded acquisition loop, but only after clean routes, unique HTML metadata and quality/index controls.
- **Launch standard:** verified security/privacy/operations and repeatable pilot outcomes, not merely a finished visual rebrand.
