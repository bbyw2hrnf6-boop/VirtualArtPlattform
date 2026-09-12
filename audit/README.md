# LIEUVA audit and operations index

This directory contains current state and durable operational contracts. It is not a storage location for routine screenshots, test traces, copied prompts or chronological implementation diaries; those belong in ignored `artifacts/` and can be regenerated.

## Start here

- [`CURRENT-STATE.md`](./CURRENT-STATE.md) — current product boundary, release conditions and maintenance priorities.
- [`MOBILE-EXPERIENCE-AND-AI-DIRECTION.md`](./MOBILE-EXPERIENCE-AND-AI-DIRECTION.md) — evidence-ranked mobile journey and AI/Astra product boundary.
- [`REPOSITORY-CLEANUP-2026-09-11.md`](./REPOSITORY-CLEANUP-2026-09-11.md) — repository cleanup scope, evidence and preservation decisions.

## Retained operational specifications

- [`CLEAN-SPACE-URL-SEO-IMPLEMENTATION.md`](./CLEAN-SPACE-URL-SEO-IMPLEMENTATION.md) — clean Space delivery, privacy and SEO behavior.
- [`DATA-RIGHTS-ACCOUNT-DELETION.md`](./DATA-RIGHTS-ACCOUNT-DELETION.md) — export/deletion lifecycle and authorization.
- [`LIVE-ACCESS-MATRIX.md`](./LIVE-ACCESS-MATRIX.md) — production access cases.
- [`PUBLISH-UPDATE-RELEASE-GATE.md`](./PUBLISH-UPDATE-RELEASE-GATE.md) — publication/update acceptance matrix.
- [`LIEUVA-OBSERVABILITY-CONTRACT.md`](./LIEUVA-OBSERVABILITY-CONTRACT.md) and [`LIEUVA-OBSERVABILITY-DASHBOARDS.md`](./LIEUVA-OBSERVABILITY-DASHBOARDS.md) — telemetry boundaries and operations.
- [`WP1-LEGAL-MODERATION-OPERATIONS-DESIGN.md`](./WP1-LEGAL-MODERATION-OPERATIONS-DESIGN.md) — legal/moderation operations design.
- [`WP2-DETERMINISTIC-RELEASE-GATE.md`](./WP2-DETERMINISTIC-RELEASE-GATE.md) — immutable production-release procedure.
- [`WP3-DATA-SECURITY-LIFECYCLE.md`](./WP3-DATA-SECURITY-LIFECYCLE.md) and [`WP3-FIREBASE-POLICY-GATE.md`](./WP3-FIREBASE-POLICY-GATE.md) — lifecycle and policy-release controls.
- [`premium-glb-measurements.json`](./premium-glb-measurements.json) — intentionally refreshed measurements for the six current premium-v3 exports.

The retained `WP` labels match active release/operator terminology and script names; they are not the current product roadmap.

## Evidence policy

- Keep current behavior in code and automated tests.
- Keep an audit document only for a durable contract, unresolved owner decision or externally executed production procedure.
- Bind point-in-time evidence to a date and revision; replace stale summaries instead of appending status layers.
- Store local screenshots, Lighthouse output, Playwright traces, build products and logs in `artifacts/`.
- Refresh the GLB report only with `npm run validate:premium:update`; ordinary validation is read-only.
- Historical removed material is available from Git at the pre-cleanup baseline, for example `git show ef9739e:audit/IMPLEMENTATION-STATUS.md`.
