# LIEUVA Premium 3D Quality — WP11

Date: 2026-08-26  
Verdict: **PASS WITH CONDITIONS**

## Baseline and architecture

The current implementation already used the correct modern foundation: one shared procedural Studio/Viewer runtime in `src/features/gallery/GalleryScene.tsx`, sRGB output, ACES filmic tone mapping, sRGB artwork textures, procedural PMREM environment lighting, room reflection probes, PBR room materials, adaptive DPR/shadow tiers, WebGL context telemetry and explicit disposal. DannyHirschArts remains a separate authored GLB runtime and was deliberately not flattened into the generic template system.

The highest-value gaps confirmed in the White Cube baseline were:

- flat architectural wall/floor junctions and ceiling transitions;
- excessive neutral fill that reduced directional depth;
- boxy, generic artwork frames with limited surface response;
- fixed texture filtering and reflection-probe cost rather than tier-aware fidelity;
- no runtime evidence for draw calls, triangles, textures or scene-ready time;
- deprecated `PCFSoftShadowMap`, which emitted a Three.js warning;
- the first bevelled-frame implementation briefly occluded artwork surfaces; browser QA caught and fixed this before completion.

No second renderer, post-processing stack or parallel quality selector was introduced.

## Changes

### Reference template: White Cube

White Cube is the WP11 reference template. It now receives restrained architectural detail:

- physical skirting/baseboards around all walls;
- narrow ceiling shadow-gap trim;
- cast/receive-shadow participation for the new architectural detail;
- rounded, bevelled artwork frames with deeper geometry;
- tuned physical frame materials for black, white and oak finishes.

These details improve room scale, corner definition and artwork separation without changing template dimensions, placement contracts, navigation or publishing data.

### Lighting and color

`src/features/gallery/scene/roomLighting.ts` remains the single Studio/Viewer lighting calibration. White Cube was rebalanced from broad fill toward deliberate architectural modelling:

- ambient multiplier: `1.80 → 1.48`;
- hemisphere multiplier: `1.35 → 1.18`;
- key multiplier: `1.00 → 1.12`;
- bounce multiplier: `1.00 → 1.16`;
- exposure: `0.96 → 0.98`;
- environment intensity now scales `0.74 / 0.82 / 0.88` for low/balanced/high.

Artwork remains on an un-tone-mapped `MeshBasicMaterial` surface with sRGB textures. This preserves source color while the physical frame, room and shadows respond to lighting.

### Shadows

The existing tiered shadow architecture remains authoritative: 512/1024/2048 maps, tiered artwork-light shadow budgets, tuned radius, bias and normal bias, and selective casting. The renderer now uses supported `PCFShadowMap`; deprecated `PCFSoftShadowMap` was removed after live QA reproduced its warning. Higher tiers retain better shadow resolution and more shadow-casting artwork lights without relying on an obsolete filter alias.

### Materials and reflections

New frame materials use `MeshPhysicalMaterial` with restrained metalness, roughness, clearcoat and environment response. White Cube trims use physical materials with deliberately matte reflectance. Existing floor, wall and ceiling material definitions remain shared and were not duplicated.

Room reflection probe resolution now follows the existing adaptive tier: 64 low, 128 balanced, 256 high. Surface anisotropy is 4/8/12 and artwork anisotropy is deliberately higher at 8/12/16. High-end desktop therefore receives visibly sharper oblique textures and reflections while constrained hardware avoids the full cost.

No bloom, vignette or generic post-processing was added. The before/after evidence showed that lighting, PBR frames, reflection quality and architectural details delivered the needed improvement without an artwork-distorting effect stack.

### Runtime evidence

The shared runtime now exposes stable diagnostic data attributes for:

- scene-ready milliseconds;
- draw calls;
- rendered triangles;
- texture count;
- reflection-probe size;
- surface/artwork anisotropy;
- active shadow filtering.

Diagnostics update at one-second intervals and do not add a render pass.

## Quality tiers

`premiumQualityForTier()` extends, rather than replaces, `getRenderQuality()`:

| Tier | Artwork filtering | Surface filtering | Probe | Existing shadow map |
|---|---:|---:|---:|---:|
| Low / Performance | 8× | 4× | 64 | 512 |
| Balanced | 12× | 8× | 128 | 1024 |
| High | 16× | 12× | 256 | 2048 |

The existing adaptive DPR downgrade/recovery, device capability selection and renderer persistence remain unchanged.

## Visual QA

Evidence is stored in `audit/evidence/wp11/`:

- `white-cube-before-1440.png` — baseline arrange view;
- `white-cube-after-1440.png` — same reference template after changes;
- `white-cube-walk-1920.png` — high-tier desktop Walk Preview;
- `white-cube-mobile-390x844.png`;
- `white-cube-mobile-360x800.png`;
- `danny-reference-1440.png` — authored DannyHirschArts regression check.

Results:

- 1920×1080: high tier, 1605×1012 canvas, Walk Preview stable;
- 1440×1000: high tier, 1125×932 canvas, arrange and Walk modes stable;
- 390×844: 390×780 canvas, 92.4% viewport area, no horizontal overflow;
- 360×800: 360×736 canvas, 92.0% viewport area, no horizontal overflow;
- mobile touch copy remained touch-specific; bottom controls stayed usable;
- Focus/Walk/Arrange controls remained present;
- DannyHirschArts loaded its authored full model, 29 authored lights, 14-light active budget and existing intro/tour contracts unchanged;
- a known published fixture correctly stopped at the private access gate when unauthorized. Full public published-viewer visual QA remains an external-account check; the renderer used after authorization is the same shared `GalleryScene` runtime exercised in Walk Preview.

After the deprecated shadow mode was removed, a fresh local Studio and Danny run produced **zero new warning/error console entries**. No unexpected Three.js/WebGL warning remained.

## Performance before / after

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Total JS gzip | 538,138 B | 538,763 B | +625 B |
| Total CSS gzip | 34,667 B | 34,667 B | 0 B |
| Largest lazy JS gzip | 180,987 B | 180,987 B | 0 B |
| Entry JS gzip | 110,150 B | 110,149 B | -1 B |
| Scene ready, local high tier | not previously exposed | 34 ms | diagnostic added |
| White Cube Walk draw calls | not previously exposed | 74 | measured |
| White Cube Walk triangles | not previously exposed | 36,630 | measured |
| White Cube textures | not previously exposed | 23 | measured |

The increase is under 1 KB gzip and stays inside all current warning budgets. No new image, HDR, model or post-processing dependency was added. Geometry cost is small and bounded to the White Cube architecture and artwork frames.

## Automated verification

- `npm run check` — PASS
  - ESLint PASS
  - 41 test files / 256 tests PASS
  - TypeScript + production build PASS
  - all performance budgets PASS
- `npm run check:functions` — PASS
  - 6 files / 43 tests PASS
  - Functions TypeScript build PASS
- `npm run test:release-gate` — PASS
  - 8 files / 71 tests PASS
- New `premiumQuality.test.ts` verifies tier progression and stronger artwork filtering.
- Existing `roomLighting.test.ts` remains green with the shared calibration.

## Remaining conditions and deferred work

- Real-device GPU/FPS sampling is still required on at least one mid-range phone and Safari/iOS; viewport emulation cannot reproduce actual GPU limits.
- A public published Space should be opened with a safe live test account to capture final authorized Viewer evidence. The available known fixture was private and correctly rejected anonymous access.
- Texture memory is represented by texture count; exact GPU allocation is not exposed reliably by WebGL.
- More bespoke architectural/material art direction for Nocturne and Grand Forum is intentionally deferred. Shared filtering, frame, reflection and runtime improvements already propagate to them.
- No deployment, commit or push was performed.

## Completion

WP11 is complete locally with the two external real-device/authorized-viewer checks above recorded as conditions. The repository is ready for WP12 without changing Firebase, Storage, IDs, URLs or legacy persistence contracts.
