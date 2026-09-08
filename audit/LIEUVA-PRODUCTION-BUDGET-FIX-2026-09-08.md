# Production bundle budget fix · 8 September 2026

## Failure and cause

The production artifact job for `d86d513d078ccdd2bd9f6e3e90d0f7649f6887de` failed at **578,058 bytes JavaScript gzip**, above the unchanged **575,000-byte** release ceiling. The screenshot and GitHub job distinguish this from the passing quality/policy jobs. The previous local build measured 574,377 bytes because App Check and Functions telemetry were not both configured. Commit/Publish was the correct user workflow; the failed artifact prevented promotion of this revision.

## Final change

- Pin Terser 5.51.2 as a development dependency. Minify for the existing ES2020 target with two safe compression passes; no unsafe arithmetic or property-name transformations are enabled.
- Group the Firebase SDK and account adapter for compression. Room renderers retain their normal loading boundaries.
- Load a small telemetry sender dynamically with static named SDK imports. Endpoint, consent, queue limits and nonblocking failure behaviour stay the same.
- Compact only whitespace in known Three.js shader string literals during builds. Preserve directive lines and macro continuations exactly. Skip comments, strings and line-sensitive shaders. Independent tests compare every installed shader's full token sequence, directive text, operator separation and numeric literals. The transform changes no JavaScript outside those recognized string literals.
- Add `check:production-build` to `npm run check`. It enables App Check and Functions telemetry with a nonfunctional public fixture in an isolated ignored output directory. It does not overwrite the standard `dist/` or Functions HTML shell. CI continues using the real production variables and the same Commit/Publish workflow.

## Quality preservation

`git diff --exit-code HEAD -- src/features/gallery public/assets blender scripts/lib/performance-budgets.mjs` passes. Room geometry, texture maps/resolution, GLBs, Blender sources, light settings, shadows, reflections, material choices, object models, runtime quality policy and budget ceilings are unchanged. Shader arithmetic and precision tokens remain identical. No lower visual-quality tier was forced to solve the download budget.

## Verification

`npm ci` succeeds with the CI-pinned npm 10.9.8 and Node 22.23.2. `npm run check` passes under that toolchain: lint, **343 client tests / 56 files**, **46 script tests**, all six premium GLBs, TypeScript, the standard build and the isolated production-feature build. The two additional client tests exercise the real lazy telemetry sender contract and its nonblocking rejection path using mocked Functions. The three additional script tests cover installed shader equivalence and the transform boundary.

| Gzip measure | Failed CI | Fixed local production-feature build | Existing ceiling |
|---|---:|---:|---:|
| Total JavaScript | 578,058 | 574,126 | 575,000 |
| Total CSS | 53,908 | 53,908 | 54,000 |
| Largest lazy JavaScript | 173,069 | 171,723 | 195,000 |
| Entry JavaScript | 298,567 | 300,555 | 305,000 |
| Entry CSS | 31,731 | 31,731 | 32,500 |

The standard local build is 572,658 bytes JavaScript gzip. Grouping raises the entry total by about 2KB against the failed CI artifact while reducing the total download; both existing release ceilings pass. Softer target budgets remain open. The production-feature check uses a representative public fixture, so a real site key can change the final byte count slightly; GitHub checks the actual configured artifact again.

The built White Cube opened in Arrange/Walk and its pre-publish review reported **Geometry valid / 0 warnings**. No publishing or live-data action was taken. The Mac relocked during browser verification, preventing completion of fresh Nocturne and Forum browser checks in this pass. Their six GLB validations and shared shader-token equivalence checks pass; the prior Studio pass already contains all-room browser evidence. This is not a new physical-device performance claim.

No commit, push, deployment, or automatic GitHub rerun was performed. After the local fix is handed off, the user can use the same Commit and Publish actions to start a new verified artifact and deployment.

Build-tool references: [Vite build options](https://vite.dev/config/build-options), [Terser](https://github.com/terser/terser). The task outputs contain the full check log and the isolated production-feature build log.
