# Repository cleanup — 2026-09-11

**Starting revision:** `ef9739e`  
**Method:** trace imports, dynamic asset URLs, routes, package scripts, documentation links, Firebase contracts and Git history before deletion.

The TypeScript import graph from `src/main.tsx` reached every production module; `tsc` with unused-local/parameter checks also passed. No unreachable product TypeScript module or unused declared dependency qualified for deletion; one redundant telemetry wrapper was later collapsed after an equivalent-path bundle measurement.

## Removed from the tracked tree

| Category | Files | Size at baseline | Reason |
| --- | ---: | ---: | --- |
| Historical audit diaries and generated evidence | 138 | 32.18 MiB | Superseded, duplicated or ad-hoc; durable operational contracts retained. |
| Blender backups/logs, duplicate v2 maps and intermediate preview renders | 49 | 66.62 MiB | Reproducible outputs; primary `.blend` sources and final masters retained. |
| GPT-generated concept screenshots | 5 | 21.80 MiB | Unreferenced since the earlier repository audit. |
| `premium-v1`/`premium-v2` runtime GLBs | 12 | 19.62 MiB | Runtime loads only premium-v3; Vite copied every old GLB into deployments. |
| Unreferenced public material/poster files | 2 | 0.28 MiB | Replaced or never selected by runtime code. |
| Unnecessary telemetry transport wrapper | 1 | <0.01 MiB | Its Firebase chunk was already loaded; the direct callable preserves the transport contract. |

Total: 207 tracked files and about 140.5 MiB removed from the current tree. Git history was not rewritten.

Removing unused files from `public/` reduced the generated `dist/` footprint from about 50 MiB to 28 MiB. This improves checkout/build/deploy artifact size; unreferenced files were not part of the initial browser request graph.

The source audit also removed 183 unreachable CSS rules and 29 dead entries from otherwise live selector lists (16,977 source bytes) across five stylesheets, plus one unused demo-data computation. No live selector or AURA/gallery contract was changed.

Removing the redundant telemetry import boundary reduced the standard build by 916 bytes gzip and the production-feature build by 665 bytes gzip. After the parallel renderer/save repair, the combined state uses 574,304 of the enforced 575,000-byte total-JavaScript ceiling, leaving 696 bytes of headroom. This is still close to the ceiling; the 560,000-byte target remains open.

## Removed locally

- 4.8 GiB of ignored build/test/CI diagnostics, including the 4.3 GiB Lima scratch VM.
- Reproducible `dist/`, Functions build output, Firebase cache, TypeScript build info, OS metadata and ignored Blender backups/logs/caches.

Dependency directories and `functions/.env.virtualartplattform` were retained because they are active local setup, not repository content. `npm run clean:generated` now repeats the safe generated-output cleanup without deleting either.

The remaining tracked tree is about 401 MiB, dominated by deliberately retained Blender sources and 4K masters. `.git` remains about 541 MiB because history was preserved; moving large originals to Git LFS or an external asset archive would require a separate owner-approved migration.

## Preserved deliberately

- all reachable product/Functions code and declared dependencies;
- all automated tests and portable Playwright journeys;
- Firebase rules, indexes, release/operator scripts and legacy compatibility identifiers;
- Danny licensed assets, current premium-v3 runtime assets and active AURA-named material paths;
- primary Blender `.blend` files, original material studies, current runtime maps, camera/story sources and six retained 4K masters;
- asset licensing, Firebase setup, GLB export contract and durable security/operations specifications.

Historical removed files can be inspected without restoring them, for example:

```bash
git show ef9739e:audit/FULL-PRODUCT-REPOSITORY-AUDIT-2026-09-02.md
```

## Verification

All authoritative checks used Node `22.23.2` and npm `10.9.8`:

- `npm run check`: lint, 353 application tests, 47 script tests, six premium-v3 GLBs and both production builds passed.
- `npm run check:functions`: 160 Functions tests, seven script tests, typecheck and the 22-file production manifest passed.
- `npm run test:firebase-rules`: 27 Firestore/Storage rule tests passed with the pinned Java 21 runtime.
- `npm run test:browser-smoke`: all 15 portable browser journeys passed after the separate renderer/save repair was fast-forwarded as `8411739`.
- Markdown local links, the retained render-manifest hashes and `git diff --check` passed.
