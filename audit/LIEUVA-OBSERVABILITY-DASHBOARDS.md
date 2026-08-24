# LIEUVA Observability Dashboards and Alerts

Status: provider-neutral production specification. Data source today is Google Cloud Logging through the App Check protected telemetry callable and structured Firebase Function logs.

## 1. Product funnel dashboard

Filter `jsonPayload.schema="lieuva_client_telemetry_v1"` and `jsonPayload.environment="production"`.

Show daily unique hashed sessions and conversion between:

`landing_view → create_started → template_selected → studio_ready → artwork_upload_completed → walk_preview_entered → publish_review_opened → account_gate_opened → publish_started → publish_succeeded → share_action → published_space_ready`

Separate new publication from `published_edit_started → published_update_started → published_update_succeeded`. Segment only by template, visibility, coarse route, and consented session reference. Never segment by title, person, raw Space ID, or asset.

## 2. Reliability dashboard

Panels:

- publish and update success rate;
- failure rate by `error_class` and visibility;
- online/offline application errors;
- account-gate to publish-start conversion;
- App Check accepted/rejected requests from Firebase App Check metrics;
- callable failure count from Firebase Functions platform metrics;
- WebGL context loss/restoration ratio;
- adaptive quality downgrade/recovery ratio.

## 3. Real-user performance dashboard

For `web_vital`, show p50/p75/p95 by metric and coarse route. For `three_milestone`, show interactive `duration_ms` by runtime (`studio`, `published`, `danny`, `emil`), template and quality. Include sample count beside every percentile and suppress low-volume comparisons.

Suggested targets after two weeks of production evidence:

- LCP p75 ≤ 2.5 s;
- INP p75 ≤ 200 ms;
- CLS p75 ≤ 0.1;
- 3D interactive p75 targets set separately per runtime/device class after baseline collection.

## 4. Server and SEO delivery dashboard

Filter `jsonPayload.schema="lieuva_observability_v1"`. Show outcome, duration and status for `space_document`, `space_card`, `space_sitemap`, plus `client_telemetry`. Use Firebase platform metrics for all callable invocation/error/latency and App Check enforcement. Hashed `resourceRef` is for incident correlation only.

## 5. Alert policy

| Alert | Initial condition | Window | Action |
| --- | --- | --- | --- |
| Publish/update reliability | failure >5% and ≥10 attempts | 15 min | inspect error class, Functions, Storage, App Check; preserve drafts |
| Visitor route availability | Function 5xx >2% and ≥20 requests | 10 min | check `spaceDocument`, Firestore availability and release |
| Share-card availability | `space_card` failure >5% | 15 min | check Storage cover and Function revision |
| Sitemap | any sustained 5xx | 30 min | inspect sitemap Function and public query |
| App Check | rejection spike >2× 7-day hourly baseline | 30 min | verify domain registration/site key before changing enforcement |
| WebGL context loss | >2% of 3D sessions | 1 h | segment runtime/device; inspect GPU/resource pressure |
| LCP regression | p75 >4 s with ≥100 samples | 6 h | compare release and route; do not remove quality blindly |
| 3D readiness regression | p75 >1.5× 7-day baseline | 6 h | inspect model/texture/network milestones |

Alert owner: engineering/product owner. Each alert links to release hash, affected runtime, safe error class, and runbook. Alerts must never include user content.

## 6. Incident runbook

1. Confirm environment and deployment SHA.
2. Check scope: one route/runtime or all traffic.
3. Check Firebase status, App Check and Functions platform metrics.
4. Correlate structured operation outcomes; use hashed refs only.
5. Reproduce with an isolated test Space; never modify user data.
6. Roll back only the affected release when evidence supports it.
7. Verify recovery and record cause, fix and regression test.

