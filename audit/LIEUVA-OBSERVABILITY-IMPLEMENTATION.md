# WP6 — Production Observability, Analytics and Real-User Performance

Verdict: **PASS WITH CONDITIONS**. The local implementation, deterministic verification, and available desktop/mobile Chrome QA are complete. Production activation and real-user performance verification require a later Firebase deployment; no deployment was performed in WP6.

## 1. Implemented

- One client telemetry boundary with consent, environment separation, event/property allowlists, route redaction, bounded batching and failure isolation.
- App Check protected Firebase callable that revalidates every event and hashes ephemeral session references.
- Complete Create/Publish/Visit/Edit/Update funnel instrumentation at existing flow boundaries.
- Native Web Vitals collection for LCP, CLS, INP, FCP and TTFB.
- 3D renderer/model/interactive milestones, WebGL context loss/restoration and adaptive quality transitions in Builder/Viewer, DannyHirschArts and Emil Scroll.
- Global browser error, unhandled rejection and React error-boundary classification.
- Structured, privacy-safe SEO delivery logs for Space documents, cards and sitemap.
- User-facing optional measurement controls in the existing Data & Rights surface.
- Warning-only bundle budgets integrated into the production build.
- Production workflow variables that activate the Functions transport without renaming legacy Firebase parameters.

## 2. Existing systems reused

The implementation reuses existing routing, publishing state machine, Firebase Functions/App Check configuration, GalleryScene renderer, Emil Scroll renderer, adaptive quality logic, Data & Rights page and deployment workflow. No parallel publishing, renderer, routing, Auth, persistence or analytics UI system was created.

## 3. Files changed

- `.github/workflows/deploy.yml`
- `package.json`
- `scripts/check-performance-budgets.mjs`
- `src/services/telemetry.ts`
- `src/services/webVitals.ts`
- `src/services/telemetry.test.ts`
- `src/main.tsx`
- `src/App.tsx`
- `src/components/AppErrorBoundary.tsx`
- `src/features/gallery/GalleryScene.tsx`
- `src/features/landing/ScrollGalleryStory.tsx`
- `functions/src/observability.ts`
- `functions/src/observability.test.ts`
- `functions/src/index.ts`
- the four WP6 audit documents.

The pre-existing modification to `audit/CLEAN-SPACE-URL-SEO-IMPLEMENTATION.md` was preserved and not treated as WP6 work.

## 4. Deterministic verification

- root lint: pass, zero warnings after dependency corrections;
- root tests: 33 files, 217 tests passed;
- telemetry tests: consent no-op, essential failure path, sanitisation, dynamic route redaction, unsafe property filtering;
- Functions tests: 5 files, 34 tests passed, including server hashing and strict batch validation;
- root TypeScript/production build: pass;
- Functions TypeScript build: pass;
- bundle budgets: all warning thresholds pass.

## 5. Three.js warning result

The historical deprecated shadow-map warning is evidenced in `audit/final/browser-qa.json`. Current code already uses `THREE.PCFShadowMap`, so WP6 did not hide warnings or add an unnecessary renderer change. Fresh local Chrome QA did not reproduce that warning.

## 6. Browser QA performed

- Chrome desktop: production Landing opened successfully; local Landing and Data & Rights routes rendered.
- Consent: Allow and Off changed the optional-measurement state in both directions without affecting the page.
- Chrome device emulation at 390×844: Landing hero, Data & Rights, Studio Arrange, and Studio Walk Preview rendered and remained operable.
- Walk Preview exposed the shared touch controls and ready state; the 3D viewport remained the dominant mobile surface.
- Console: no application error was produced. The only message was the expected Firebase warning that `127.0.0.1` is not an authorized OAuth domain; production domains are unaffected.
- An aggressive synthetic jump into Emil produced a visually black intermediate frame without a console error. Slow/aggressive real-device Emil validation remains in the post-deploy matrix; WP6 did not redesign or patch Emil.

## 7. Production activation

No deployment was performed. On the next authorized GitHub deployment, the workflow builds with `VITE_TELEMETRY_MODE=functions` and `VITE_TELEMETRY_ENVIRONMENT=production`, and deploys `recordLieuvaTelemetry` with the other Functions.

After deployment:

1. verify App Check accepts the production domain and rejects invalid tokens;
2. grant optional measurement consent on a test account;
3. run landing → create → upload → preview → publish → share → visit → edit → update;
4. verify only allow-listed `lieuva_client_event`/`lieuva_operation` logs appear;
5. verify no raw IDs, emails, titles, URLs, paths or asset names;
6. run production desktop and real-device mobile QA with slow/aggressive Emil Scroll, published Spaces and DannyHirschArts;
7. record first real p50/p75/p95 baseline before enabling strict budgets or alerts.

## 8. Remaining conditions and risks

- Production telemetry transport, App Check acceptance, published-Space RUM, and real-device Safari remain unverified until deployment.
- The Emil synthetic-scroll black frame needs real-device confirmation; no console failure established a root cause in WP6.
- Optional analytics remains off until each user explicitly enables it.
- Placeholder `AURA_REPLY_TO` and legal-footer values intentionally prevent email delivery and are unrelated to telemetry; configure them before email launch.
- Dashboard and alert thresholds are specifications until production sample volume exists.
- Broader structured operation adoption for every Auth/ACL/email/export/cleanup callable can follow using the existing server helper; Firebase platform metrics remain the current failure source.

## 9. Completion

WP6 code, privacy contract, deterministic tests, available Chrome QA, bundle baseline, dashboards and runbook are complete locally. Final status is PASS WITH CONDITIONS until deployment and real-user baseline collection are performed.
