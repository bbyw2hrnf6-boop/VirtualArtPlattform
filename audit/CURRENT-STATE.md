# LIEUVA current state

**Reviewed:** 2026-09-11  
**Cleanup baseline:** `ef9739e` (`main` = `origin/main` at review start)  
**Deployment performed by this cleanup:** none

## Product boundary

LIEUVA currently provides the landing story, Explore Spaces, Creator Hub/profiles, account and access management, three-template Studio, local drafts/recovery, artwork and room editing, Arrange, Walk Preview, publication review, canonical Space sharing and the Danny reference exhibition.

The repository also contains a server-owned `/admin` control plane. Direct client access to the `siteAdmins`, admin-control, audit-event and admin-check-run collections is denied. Admin authority is read from `siteAdmins/{uid}` with an active `owner` or `admin` role; no custom claim or email allow-list is authoritative. The guarded operator CLI can create only the first active owner and has not been run against production by this implementation change.

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

The admin console deliberately extends the aggregate release ceilings from 575,000 to 588,000 bytes JS gzip and 54,000 to 55,000 bytes CSS gzip. It remains a separate dynamic entry, checked against the built import graph and its own 12,000-byte JS / 5,000-byte CSS limits. Public initial-JS (305,000), initial-CSS (32,500) and largest-lazy-chunk (195,000) ceilings are unchanged. The 560,000-byte total-JS target remains open; new dependencies still require measured impact. Admin smoke coverage includes signed-out/non-admin denial, owner views, role refresh, revocation and 1440 × 1000 / 390 × 844 layouts, using test-only intercepted backend fixtures rather than a production bypass.

## Release boundary

Treat the product as a controlled production pilot until these external conditions are evidenced:

- deployed Firestore/Storage rules and indexes match the reviewed repository policy;
- authenticated production Public/Unlisted/Private and Owner/Editor/Viewer flows pass with isolated fixtures and exact cleanup;
- App Check, email sender/legal footer, moderation/abuse response and malicious-upload controls are operational;
- Terms, Privacy, retention, data-rights and operator/brand decisions have owner/legal approval;
- physical iOS Safari and Android Chrome passes cover upload, recovery, Walk, reduced motion, memory and touch comfort;
- production RUM dashboards, alerts, cold-start behavior, crawler cards and incident/rollback ownership are exercised.
- one explicitly approved, existing verified Firebase Auth account is dry-run reviewed and bootstrapped as the first registry owner; subsequent role changes use the audited admin control plane rather than rerunning bootstrap.

Local verification never authorizes deployment or live-data mutation.

## Maintenance priorities

1. Continue decomposing `src/App.tsx`, `src/features/gallery/GalleryScene.tsx` and `functions/src/index.ts` behind characterization tests; preserve public and persistence contracts.
2. Split dense global CSS by owned surface after visual-regression coverage; keep selector removal evidence-based.
3. Replace remaining `?raw` source-string tests with behavior/integration coverage where practical.
4. Keep `public/` limited to referenced shipping assets and keep generated QA output out of Git.
5. Prefer one updated current-state document over new dated status/audit layers.
