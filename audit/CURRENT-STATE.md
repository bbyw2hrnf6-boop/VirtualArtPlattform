# LIEUVA current state

**Reviewed:** 2026-09-11  
**Cleanup baseline:** `ef9739e` (`main` = `origin/main` at review start)  
**Deployment performed by this cleanup:** none

## Product boundary

LIEUVA currently provides the landing story, Explore Spaces, Creator Hub/profiles, account and access management, three-template Studio, local drafts/recovery, artwork and room editing, Arrange, Walk Preview, publication review, canonical Space sharing and the Danny reference exhibition.

The local guest-publishing extension enables public initial publication through Firebase anonymous Auth without a public profile. A server-authored immutable `guestPublication` marker and original `publishedAt` determine the seven-day Explore window; the browser directory filters at the boundary, on focus and on reopen. Public manifest/media access remains independent and uses the existing 365-day preview `expiresAt`; no seven-day cleanup is introduced. Discovery scans at most ten pages of thirty records per modern/legacy query, continuing past ended guest placements; deeper eligible records can remain outside this bounded directory slice. Guest origin survives account linking and revisions and is excluded from Creator projection/attribution. Guest control is browser-bound until UID-preserving account creation, and live updates still require verification. This change needs a combined Functions/Hosting release; no direct-write rule relaxation, new indexes or production mutation was performed.

The repository also contains a server-owned `/admin` control plane. Direct client access to the `siteAdmins`, admin-control, audit-event and admin-check-run collections is denied. Admin authority is read from `siteAdmins/{uid}` with an active `owner` or `admin` role; no custom claim or email allow-list is authoritative. The existing verified account explicitly selected by the owner was bootstrapped on 2026-09-11; the one-shot guard and active owner membership were independently confirmed. Bootstrap must not be repeated.

The current local extension adds `/admin/operations` and a 13-probe v2 test center with actionable enum evidence and compatible legacy history. Operations exposes deployed Hosting identity, source freshness, bounded recent lifecycle/failure observations, a privacy-projected support report and six copy-only diagnostic commands. It does not add production cleanup, arbitrary execution, new admin endpoints or broader access. This extension has not yet been published; its release-identity probe remains unavailable on an older build without `/release.json`.

The homepage's optional film and native scroll use the same reversible 20-second, 24-shot score. It demonstrates three floors and three walls before entering the White Cube. Desktop and mobile have separate compositions; reduced motion receives a static/fallback path.

The active shared template environment is `premium-v3`. Six desktop/mobile GLBs ship from `public/assets/templates/premium-v3/`. Procedural geometry remains the loading/error fallback and explicit `?environment=procedural` diagnostic path. The current `.blend` sources, runtime maps, camera studies and final 4K masters remain under `blender/production/v3/`; historical editable sources remain under v1/v2.

No AURA/gallery technical identifier was migrated. Existing Firebase collections, fields, Storage paths, callable names, draft/export formats, routes and GLB metadata remain compatibility contracts.

## Quality boundary

The authoritative local gates are:

```bash
npm run check
npm run check:functions
npm run test:firebase-rules
npm run test:browser-smoke
```

Run them with Node `22.23.2` and npm `10.9.8`; rule tests also require the pinned Java runtime. Do not preserve fixed test totals here—run the commands so the result cannot become stale.

Performance ceilings live in `scripts/lib/performance-budgets.mjs`; GLB limits live in `scripts/validate-premium-glb.mjs`. Raising either requires an explicit, documented decision.

The original admin console extended the aggregate release ceilings to 588,000 bytes JS gzip and 55,000 bytes CSS gzip. Operations and detailed check evidence deliberately add a further 5,000-byte JS allowance (593,000 total; measured approximately +5.4 KB against the previous production build, with no dependencies). CSS stays at 55,000. The console remains a separate dynamic entry with its existing 12,000-byte JS / 5,000-byte CSS limits; Operations is additionally lazy. The built import graph rejects admin console, operations/model and service code in the public initial graph. Public initial-JS (305,000), initial-CSS (32,500) and largest-lazy-chunk (195,000) ceilings are unchanged. The 560,000-byte total-JS target remains open. Admin smoke coverage includes signed-out/non-admin denial, owner views, role refresh, revocation, history/evidence filters, report exports, copy-only tools, missing sources and 1440 × 1000 / 390 × 844 layouts, using test-only intercepted backend fixtures rather than a production bypass.

## Release boundary

Guest publication deliberately extends only the aggregate JS release ceiling by 2,000 bytes to 595,000 (measured approximately +2.2 KB production JS for the guarded UI, timed filtering/pagination and copy). The public entry, largest lazy chunk and CSS limits are unchanged; no dependencies were added. This is an explicit feature-size tradeoff, not a disabled budget check.

The immutable release validator accepts direct endpoint declarations and explicit named local-module re-exports, including the admin callables, without executing bundled code. The exact endpoint allowlist and digest checks remain mandatory; unsupported export forms fail closed.

Builds generate a minimal `/release.json` with schema version, build time and the exact CI commit SHA. Local builds without `GITHUB_SHA` carry a null SHA, never a guessed live identity. Immutable artifact validation requires a non-null stamp matching the manifest SHA, rejects extra fields and includes the file in digest verification. Hosting revalidates it on every request. Older live deployments do not retroactively gain this identity file.

Treat the product as a controlled production pilot until these external conditions are evidenced:

- deployed Firestore/Storage rules and indexes match the reviewed repository policy;
- authenticated production Public/Unlisted/Private and Owner/Editor/Viewer flows pass with isolated fixtures and exact cleanup;
- App Check, email sender/legal footer, moderation/abuse response and malicious-upload controls are operational;
- Terms, Privacy, retention, data-rights and operator/brand decisions have owner/legal approval;
- physical iOS Safari and Android Chrome passes cover upload, recovery, Walk, reduced motion, memory and touch comfort;
- production RUM dashboards, alerts, cold-start behavior, crawler cards and incident/rollback ownership are exercised.
- subsequent role changes use the audited admin control plane; the approved first-owner bootstrap is complete and must not be rerun.

Local verification never authorizes deployment or live-data mutation.

## Maintenance priorities

1. Continue decomposing `src/App.tsx`, `src/features/gallery/GalleryScene.tsx` and `functions/src/index.ts` behind characterization tests; preserve public and persistence contracts.
2. Split dense global CSS by owned surface after visual-regression coverage; keep selector removal evidence-based.
3. Replace remaining `?raw` source-string tests with behavior/integration coverage where practical.
4. Keep `public/` limited to referenced shipping assets and keep generated QA output out of Git.
5. Prefer one updated current-state document over new dated status/audit layers.
