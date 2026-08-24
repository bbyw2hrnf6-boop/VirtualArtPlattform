# LIEUVA Performance Baseline

Date: 2026-08-24. Scope: WP6, quality-preserving baseline. No visual feature, renderer feature, material, shadow, reflection, or tour behavior was removed.

## 1. Evidence and method

This baseline combines the current production build, repository asset inventory, historical Lighthouse evidence, and fresh local Chrome QA. Computer Use verified desktop routes and 390×844 device emulation for Landing, Data & Rights, Studio Arrange, and Studio Walk Preview. Signed-in production RUM and real-device Safari remain external verification.

## 2. Current production build

`npm run build` passed. Current gzip output:

| Asset group | Gzip |
| --- | ---: |
| entry JS | 106.01 kB |
| Firebase chunk | 182.89 kB |
| Danny lighting chunk | 174.19 kB |
| GalleryScene chunk | 41.30 kB |
| Emil Scroll chunk | 8.22 kB |
| all JS | 521.76 kB |
| all CSS | 30.00 kB |

`public/assets` is approximately 10 MB on disk. Route-level lazy chunks prevent all 3D code from entering the landing entry immediately, but Firebase and the Danny lighting asset remain the largest delivered chunks.

## 3. Historical browser baseline

Repository evidence in `audit/lighthouse-home.json` (2026-08-02, local preview) records:

| Metric | Result |
| --- | ---: |
| Lighthouse Performance | 0.81 |
| Accessibility | 0.95 |
| Best Practices | 0.96 |
| SEO | 0.92 |
| FCP | 2,557.7 ms |
| LCP | 4,369.0 ms |
| CLS | 0 |
| TBT | 0 ms |
| Speed Index | 2,557.7 ms |

This is historical directional evidence, not a current production RUM result.

## 4. Runtime measurement now available

Native `PerformanceObserver` instrumentation records LCP, CLS, INP, FCP and TTFB after consent. 3D surfaces report renderer/model/interactive milestones, WebGL context loss/restoration, and adaptive quality downgrade/recovery. Measurements use coarse route/runtime/template/quality labels only.

Required QA matrix after deployment:

| Surface | Desktop | 390×844 mobile | Network |
| --- | --- | --- | --- |
| Landing + Emil Scroll | Chrome | Chrome/Safari | fast + throttled 4G |
| Builder Arrange/Walk | Chrome | Chrome/Safari | fast + throttled 4G |
| Published Space | Chrome | Chrome/Safari | fast + throttled 4G |
| DannyHirschArts | Chrome | Chrome/Safari | fast + throttled 4G |

Capture p50/p75/p95 for Web Vitals and interactive duration after enough consented samples. Never infer production percentiles from local Lighthouse.

## 5. Three.js warning investigation

Existing evidence in `audit/final/browser-qa.json` reproduced the historical warning: `THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.` The current renderer configuration already uses `THREE.PCFShadowMap`; no warning suppression or speculative renderer rewrite was added. Fresh local Chrome QA did not reproduce it. The only console message was the expected unauthorized-localhost OAuth warning.

An aggressive synthetic device-emulation jump into Emil showed a black intermediate frame without a console error. This is recorded as a real-device/post-deploy verification item rather than treated as a proven regression or changed during this observability work package.

## 6. Warning-only budgets

`scripts/check-performance-budgets.mjs` runs after every production build:

| Budget | Current | Warning threshold |
| --- | ---: | ---: |
| total JS gzip | 521,758 B | 550,000 B |
| total CSS gzip | 29,996 B | 35,000 B |
| largest lazy JS gzip | 180,264 B | 195,000 B |
| entry JS gzip | 104,956 B | 120,000 B |

The baseline is warning-only so WP6 does not block delivery based on one machine's compressor output. CI can enforce it with `LIEUVA_STRICT_PERFORMANCE_BUDGET=1` after one stable production cycle.

## 7. Priorities without quality loss

1. Gather production p75 Web Vitals and 3D interactive duration by surface.
2. Preserve current route lazy-loading and avoid scene/renderer recreation.
3. Investigate Firebase chunk splitting only with repeatable route traces; do not trade reliability for a smaller number.
4. Measure texture/model transfer and decode time on real mobile before changing assets.
5. Alert on WebGL context loss and repeated quality downgrade; do not disable shadows/reflections globally.
