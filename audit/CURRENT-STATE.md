# LIEUVA current state

- **Reviewed:** 2026-09-14
- **Prior cleanup baseline:** `ef9739e`
- **Audit baseline:** `3e6e58226c3b6204e06033b1e5df0957fa2fc2d5` (`main` = `origin/main` at review start)
- **Live deployment verified at review:** `3e6e58226c3b6204e06033b1e5df0957fa2fc2d5` (`/release.json`, built 2026-09-11T17:57:51.084Z)
- **Deployment performed by the repository cleanup itself:** none; a later protected release deployed the verified revision above

## Product boundary

LIEUVA currently provides the landing story, Explore Spaces, Creator Hub/profiles, account and access management, three-template Studio, local drafts/recovery, artwork and room editing, Arrange, Walk Preview, publication review, canonical Space sharing and the Danny reference exhibition.

Guest publishing is deployed and enables public initial publication through Firebase anonymous Auth without a public profile. A server-authored immutable `guestPublication` marker and original `publishedAt` determine the seven-day Explore window; the browser directory filters at the boundary, on focus and on reopen. Public manifest/media access remains independent and uses the existing 365-day preview `expiresAt`; no seven-day cleanup is introduced. The deployed baseline scans at most ten pages of thirty records per modern/legacy query, continuing past ended guest placements; the local P0 change below replaces the broad legacy client query with the explicit-public query only. Guest origin survives account linking and revisions and is excluded from Creator projection/attribution. Guest control is browser-bound until UID-preserving account creation, and live updates still require verification. The combined Functions/Hosting release preserved the direct-write rule boundary and required no new indexes.

The repository also contains a server-owned `/admin` control plane. Direct client access to the `siteAdmins`, admin-control, audit-event and admin-check-run collections is denied. Admin authority is read from `siteAdmins/{uid}` with an active `owner` or `admin` role; no custom claim or email allow-list is authoritative. The existing verified account explicitly selected by the owner was bootstrapped on 2026-09-11; the one-shot guard and active owner membership were independently confirmed. Bootstrap must not be repeated.

The deployed control plane includes `/admin/operations` and a 13-probe v2 test center with actionable enum evidence and compatible legacy history. Operations exposes deployed Hosting identity, source freshness, bounded recent lifecycle/failure observations, a privacy-projected support report and six copy-only diagnostic commands. It does not add production cleanup, arbitrary execution, new admin endpoints or broader access. Its Hosting release-identity probe is available in the reviewed live build and resolves the exact revision recorded above from `/release.json`.

The homepage's optional film and native scroll use the same reversible 20-second, 24-beat score. Local camera refinement replaces repeated per-beat stop/start easing with shape-preserving cubic position/gaze curves and redistributes the final descent across five beats without an upward/backward detour. All six floor/wall comparisons keep a fixed view, including mobile; compact framing changes only after the comparisons. The final composition, Look around, reduced-motion/Data Saver paths, materials and GLBs remain unchanged. The story's “Open in Studio” action now goes to the Studio overview and never stages or opens the illustrated White Cube as a draft. This refinement is locally verified, not a deployment; see the [camera motion contract](./MOBILE-EXPERIENCE-AND-AI-DIRECTION.md#landing-camera-motion-contract).

The post-story homepage collection includes the locally implemented Obsidian showcase at `/#/showcase/obsidian`. Both the Art exhibitions preview and its “Explore Obsidian” action open three connected Blender-authored galleries using the owner's eleven supplied AI-generated artworks. It is a read-only bespoke demo, independent of Studio templates and Firebase publications. Entry explicitly loads a desktop/mobile GLB; the artwork directory works without WebGL. Cycles-baked diffuse lighting and a softened planar floor reflection pass trade runtime lighting flexibility for presentation quality. Obsidian now uses the same first-person controller as public Spaces and Studio Walk, including 1.75 m eye height, acceleration/braking, scoped WASD movement, E/↑ look up and Q/↓ look down, tap-to-walk pathfinding with a visible destination marker, touch drag, 40–90° zoom and session pace. Looking no longer cancels a floor route; WASD takes over translation. Native touch activation tolerates tap jitter and rejects drag/pinch compatibility clicks. The shared Space toolbar supplies Walk/Overview, Reset and Artworks; Obsidian omits the instruction overlay as requested and uses direct floor/drag touch navigation without a held-arrow pad, with tap zoom and a room selector. Overview cuts away the roof/facing exterior walls, supports orbit/pan/zoom and restores the saved walk pose without rebuilding the renderer. All nine diffuse atlases have been re-baked at 128 samples on Metal and denoised; native floor bakes remain 4K desktop / 2K mobile. Planar targets increase from 1536/768 to 2048/1024 with subtle world-anchored polishing variation: approximately 78% more reflection pixels, intentionally confined to this showcase. After three consecutive active frames slower than 150 ms, Obsidian caps raster DPR at 1 and its reflection target at 512 px without MSAA; source artwork/lightmaps remain unchanged. This explicit slow-GPU sharpness tradeoff keeps the room navigable. Shared walking catches up at most 250 ms per rendered frame in collision-checked substeps of at most 50 ms; braking and zoom settle using elapsed time. This bounds suspension jumps while avoiding severe slow-motion movement on low-frame-rate devices. The explicit showcase quality increase raises decoded texture estimates to 445 MB / 147 MB plus render targets, and adds 5 KB to the aggregate JS allowance; physical mobile qualification remains open. The Sculpture & 3D card now opens the separate [Sculpture Pavilion](../blender/showcases/sculpture-pavilion/README.md): three metric daylight rooms, five actual modelled sculptures, 4K Cycles room masters, separate sculpture portraits, baked diffuse transport, PBR sculpture surfaces and Meshopt desktop/mobile delivery. It reuses this viewer and the Space walking/menu primitives, with its own obstacle-aware A→B→C→A paths. Gentle Engine animates only while visible in its room and respects reduced motion. Animated shadows remain baked at rest; physical mobile GPU qualification remains open. Architecture retains its future-showcase state, and the bespoke contact route remains pending. See the [Obsidian production contract](../blender/showcases/obsidian/README.md). Deployment status must be checked against the successful Hosting release SHA.

The separate lazy showcase intentionally adds 14,000 bytes JS and 2,000 bytes CSS to aggregate release allowances (610,000 / 56,500), including the shared walking/reflection upgrade and an explicit 3,000-byte addition for the separate Sculpture Pavilion navigation and viewer configuration. Public-entry, largest-lazy-chunk and Studio GLB budgets remain unchanged. The bespoke assets are loaded only on entry, with lower-resolution mobile exports; physical-device qualification remains open.

The Studio's `Auto-arrange` action is local and rules-based: it samples artwork colors in the browser, applies bounded palette and placement rules with randomized compatible variations, keeps locks, runs the shared validator and remains undoable. It is not an OpenAI/GPT feature and sends no artwork to an AI service. The UI states that boundary instead of presenting the workflow as an “AI Curator.” Where the browser exposes `navigator.connection.saveData`, that preference keeps the lightweight landing poster and its direct Studio action instead of mounting the optional WebGL story. Cross-browser coverage, including Safari/iOS, remains open because that signal cannot be assumed.

The active shared template environment is `premium-v3`. Six desktop/mobile GLBs ship from `public/assets/templates/premium-v3/`. Procedural geometry remains the loading/error fallback and explicit `?environment=procedural` diagnostic path. The current `.blend` sources, runtime maps, camera studies and final 4K masters remain under `blender/production/v3/`; historical editable sources remain under v1/v2.

No AURA/gallery technical identifier was migrated. Existing Firebase collections, fields, Storage paths, callable names, draft/export formats, routes and GLB metadata remain compatibility contracts.

The local P0 SEO hardening restores the documented reviewed-content boundary:
new Spaces, content revisions, visibility transitions and lifecycle actions now
fail closed outside Discover/search indexing, while placement-only changes
preserve a prior review.
Legacy schema-v1/v2 gallery documents without `visibility` keep their historical
public direct-link fallback. Explicit legacy `public`, `unlisted` and `private`
values are now authoritative across Firestore, Storage, SSR, operator tooling
and the client. Because rules are not filters, the anonymous client no longer
runs a schema-version-only legacy Discover query; missing-visibility records
need an authorized explicit-public migration before optional client-side
placement. A fully account-owned legacy record can use the existing authorized
Studio revision path, whose successful finalizer replaces it with schema v3;
older records need a new current-schema publication or a separately authorized
schema/data migration.
Obvious QA Spaces and Creator profiles remain directly reviewable but are
derived `noindex`, omitted from structured data and excluded from directory and
sitemap output. Editorial preview cards no longer link to reserved 404 routes;
unverified Creator links are UGC rather than `sameAs` claims; and a published
artist credit links to a Creator profile only while both names agree. This work
is locally verified only and has not been deployed or applied to production data.

The local camera-control change adds session-only “View & pace” in room Walk/Studio Walk Preview and the Danny reference: 78° on compact/coarse-pointer devices, 62° desktop, a 40–90° lens range and 0.5–2× walking pace (Grand Forum defaults to 1.25×). Keyboard, held movement and reachable floor paths share the pace multiplier; guided-tour timing remains separately authored. Arrange keeps its 48° lens but allows four full-room fit distances (at least five room spans), with safe far clipping and −/+ tap controls. Settings are not draft/profile/publication data and survive mode switches, focus and Reset view; Reset settings restores the room-session defaults. The homepage presentation, including its Look around pinch range, is excluded. See the [room camera contract](./MOBILE-EXPERIENCE-AND-AI-DIRECTION.md#room-view-and-pace-contract). No deployment is included.

## Quality boundary

The authoritative local gates are:

```bash
npm run check
npm run check:functions
npm run test:firebase-rules
npm run test:browser-smoke
npm run test:browser-visual
```

Run them with Node `22.23.2` and npm `10.9.8`; rule tests also require the pinned Java runtime. Do not preserve fixed test totals here—run the commands so the result cannot become stale.

Client and Functions checks enforce repository-wide V8 coverage floors and keep reports in ignored `artifacts/` directories. The dedicated visual project compares reduced-motion landing, White Cube, Account and Creator Hub baselines at 1440 × 1000 and 390 × 844 with pinned Chromium and SwiftShader. Pixel baselines are platform-specific; Ubuntu CI runs the functional Chromium suite until reviewed Linux baselines exist. Review diffs before changing an approved baseline. Main production smoke now uses four isolated one-worker shards over one digest-verified candidate. Verify success requires every shard; each has an 11-minute suite limit (12-minute step, 15-minute job), stops at its first exhausted retry, and cancels siblings on failure.

Performance ceilings live in `scripts/lib/performance-budgets.mjs`; GLB limits live in `scripts/validate-premium-glb.mjs`. Raising either requires an explicit, documented decision.

The original admin console extended the aggregate release ceilings to 588,000 bytes JS gzip and 55,000 bytes CSS gzip. Operations and detailed check evidence deliberately added a further 5,000-byte JS allowance (593,000 total; measured approximately +5.4 KB against the previous production build, with no dependencies). The console remains a separate dynamic entry with its existing 12,000-byte JS / 5,000-byte CSS limits; Operations is additionally lazy. The built import graph rejects admin console, operations/model and service code in the public initial graph. The `lazyFirebaseFunctions` boundary and non-recursive Firebase chunk group also keep Firebase/account services outside that graph. The current public initial-JS ceiling is 123,000 bytes gzip (measured 119,978), tightened from 305,000 after that split; initial CSS remains 32,500 and the largest lazy chunk is 174,668 against a 195,000 ceiling. The reviewed production build measures 595,877 total JS and 53,766 CSS against 596,000 / 54,500 hard ceilings. The 115,000-byte initial-JS, 560,000-byte total-JS and 43,000-byte CSS targets remain open. Admin smoke coverage includes signed-out/non-admin denial, owner views, role refresh, revocation, history/evidence filters, report exports, copy-only tools, missing sources and 1440 × 1000 / 390 × 844 layouts, using test-only intercepted backend fixtures rather than a production bypass. The session-only view/pace and tap-zoom feature explicitly adds 1,000 bytes to the aggregate JS ceiling (approximately 0.17%); the measured feature delta is approximately 1 KB, and all other ceilings stay unchanged.

## Release boundary

Guest publication deliberately extended only the aggregate JS release ceiling by 2,000 bytes to 595,000 (measured approximately +2.2 KB production JS for the guarded UI, timed filtering/pagination and copy). At that release, the public entry, largest lazy chunk and CSS limits were unchanged; no dependencies were added. The subsequent public-entry tightening is recorded in the quality boundary above. This is an explicit feature-size tradeoff, not a disabled budget check.

The immutable release validator accepts direct endpoint declarations and explicit named local-module re-exports, including the admin callables, without executing bundled code. The exact endpoint allowlist and digest checks remain mandatory; unsupported export forms fail closed.

Builds generate a minimal `/release.json` with schema version, build time and the exact CI commit SHA. Local builds without `GITHUB_SHA` carry a null SHA, never a guessed live identity. Immutable artifact validation requires a non-null stamp matching the manifest SHA, rejects extra fields and includes the file in digest verification. Hosting revalidates it on every request. Older live deployments do not retroactively gain this identity file.

Treat the product as a controlled production pilot until these external conditions are evidenced:

- deployed Firestore/Storage rules and indexes match the reviewed repository policy;
- authenticated production Public/Unlisted/Private and Owner/Editor/Viewer flows pass with isolated fixtures and exact cleanup;
- App Check, email sender/legal footer, moderation/abuse response and malicious-upload controls are operational;
- Terms, Privacy, retention, data-rights and operator/brand decisions have owner/legal approval;
- physical iOS Safari and Android Chrome passes cover upload, recovery, Walk, reduced motion, memory and touch comfort;
- production RUM dashboards, alerts, cold-start behavior, crawler cards and incident/rollback ownership are exercised.
- Google Search Console and Bing Webmaster ownership, sitemap submission, URL Inspection and a non-brand/index-coverage baseline are evidenced by the operator.
- subsequent role changes use the audited admin control plane; the approved first-owner bootstrap is complete and must not be rerun.

Local verification never authorizes deployment or live-data mutation.

A read-only public-content review on 2026-09-11 found two still-indexable QA records: Space `lieuva-sample-collection-pavilion-test-dad82647f0d041b8` and Creator handle `skippertestadmin`. The local P0 gate will make both `noindex` and remove them from discovery/sitemap after a protected release, without deleting them. Explicit production demotion or removal remains an owner/operator decision and needs credentials; no live data was mutated. The existing Gen2 runtime principal also still has project-level `roles/editor`; the least-privilege migration is specified in `FIREBASE_SETUP.md` and remains an external IAM/deploy action.

## Maintenance priorities

1. Complete the physical-device gate on current and older iPhone Safari plus midrange Android Chrome, including upload/recovery, 15–20 minute WebGL soak, orientation, background/foreground and in-app browsers.
2. Continue the evidence-ranked mobile journey work in [`MOBILE-EXPERIENCE-AND-AI-DIRECTION.md`](./MOBILE-EXPERIENCE-AND-AI-DIRECTION.md): orientation and artwork access before additional cinematic or generative features.
3. Do not add remote AI until consent, data preview, retention/cost controls, proposal/diff review and evaluation are specified. Astra may later create a semantic curation brief; it must never bypass the local solver, validator, Undo or publish review.
4. Continue decomposing `src/App.tsx`, `src/features/gallery/GalleryScene.tsx` and `functions/src/index.ts` behind characterization tests; split dense global CSS only behind visual coverage.
5. Replace remaining `?raw` source-string tests with behavior/integration coverage where practical; keep `public/` limited to referenced shipping assets and generated QA output out of Git.
