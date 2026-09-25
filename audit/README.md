# LIEUVA audit and operations index

This directory contains current state and durable operational contracts. It is not a storage location for routine screenshots, test traces, copied prompts or chronological implementation diaries; those belong in ignored `artifacts/` and can be regenerated.

## How to read status

`CURRENT-STATE.md` records the current product boundary, known risks and priorities; it is not proof of a live deployment. Each selected document states whether its content is a requirement, proposed direction or operator procedure. A dated test, rollout result, verdict or production snapshot applies only to its stated date and any recorded revision. For checked-out behavior, inspect source and tests; for live revision or policy state, use the release stamp and the relevant operator checks. Do not promote an old `PASS`, `complete` or `still required` line into a current-status claim.

## Read on demand

Do not read this directory as a bundle. Start with [`CURRENT-STATE.md`](./CURRENT-STATE.md) only when current product boundaries or risks matter, then choose the one scoped source below.

| Work | Source | Role |
| --- | --- | --- |
| Homepage promise, copy or landing journey | [Homepage contract](../src/features/landing/README.md) | Current product and page criteria |
| Mobile experience or remote AI | [Mobile and AI direction](./MOBILE-EXPERIENCE-AND-AI-DIRECTION.md) | Reviewed direction and proposed work |
| Guided tours, cinematic cameras or three-world film | [Showcase direction](../src/features/showcase/README.md) | Current visitor behavior |
| Firebase setup, release or rollback | [Firebase setup](../FIREBASE_SETUP.md) and [WP2 release gate](./WP2-DETERMINISTIC-RELEASE-GATE.md) | Operator procedure and artifact contract |
| Firestore/Storage policy promotion | [WP3 policy gate](./WP3-FIREBASE-POLICY-GATE.md) | Reviewed rules and promotion procedure |
| Data lifecycle and security | [WP3 lifecycle](./WP3-DATA-SECURITY-LIFECYCLE.md) | Security invariants and rollout conditions |
| Live roles, visibility and expiry | [Live access matrix](./LIVE-ACCESS-MATRIX.md) | Acceptance procedure |
| Publication and updates | [Publish/update gate](./PUBLISH-UPDATE-RELEASE-GATE.md) | Acceptance criteria with dated evidence |
| Clean Space URLs and SEO | [Clean URL/SEO contract](./CLEAN-SPACE-URL-SEO-IMPLEMENTATION.md) | Delivery and indexing contract with dated evidence |
| Account export or deletion | [Data rights and deletion](./DATA-RIGHTS-ACCOUNT-DELETION.md) | Lifecycle contract and open policy decisions |
| Product telemetry | [Observability contract](./LIEUVA-OBSERVABILITY-CONTRACT.md) | Normative event and data boundary |
| Admin operations, dashboards or alerts | [Observability dashboards](./LIEUVA-OBSERVABILITY-DASHBOARDS.md) | Implemented admin view and proposed dashboard criteria |
| Legal or moderation decisions | [WP1 legal/moderation](./WP1-LEGAL-MODERATION-OPERATIONS-DESIGN.md) | Owner questions and pilot procedure |
| Studio GLB measurements | [Premium GLB report](./premium-glb-measurements.json) | Deliberately refreshed measurements for six current exports |
| Individual bespoke scene or source | [Obsidian](../blender/showcases/obsidian/README.md), [Sculpture Pavilion](../blender/showcases/sculpture-pavilion/README.md) or [Forest Fold House](../blender/showcases/forest-fold-house/README.md) | Current showcase contract; source briefs are scoped inputs |

The retained `WP` labels match active release/operator terminology and script names; they are not the current product roadmap. Dated cleanup and timing records live in [`history/`](./history/) and are not part of normal task context.

## Document metadata

At the top of a durable document, state its role and scope, the date and revision of evidence when recorded, and where to verify current repository or live status. If it contains no dated verification, say so rather than inventing a date or revision. Keep that header current when the document's authority changes; update the exact scoped contract when its requirement changes.

## Evidence policy

- Keep current behavior in code and automated tests.
- Keep an audit document only for a durable contract, unresolved owner decision or externally executed production procedure.
- Bind point-in-time evidence to a date and revision; replace stale summaries instead of appending status layers.
- Store local screenshots, Lighthouse output, Playwright traces, build products and logs in `artifacts/`.
- Refresh the GLB report only with `npm run validate:premium:update`; ordinary validation is read-only.
- Historical removed material is available from Git at the pre-cleanup baseline, for example `git show ef9739e:audit/IMPLEMENTATION-STATUS.md`.
