# LIEUVA Observability Contract

Status: implemented contract for WP6, 2026-08-24. This document is normative for product telemetry. Existing AURA technical identifiers remain compatibility-sensitive.

## 1. Purpose and boundary

LIEUVA collects only the minimum signals needed to understand product reliability, the Create-to-Publish funnel, and real-world 3D performance. All browser events cross one boundary: `src/services/telemetry.ts`. Product components must not call an analytics vendor directly.

The current transport is vendor-neutral and can send allow-listed batches to the App Check protected `recordLieuvaTelemetry` Firebase callable. The server validates every event again and emits structured Cloud Logging entries. Telemetry failure is silent and must never block saving, publishing, viewing, or rendering.

## 2. Consent and lawful minimisation

| Class | Examples | Before opt-in | Reason |
| --- | --- | --- | --- |
| Essential operational | publish/update failure, application error class, WebGL context loss/restoration | Allowed | Diagnose a requested operation without tracking content or identity |
| Optional product measurement | funnel, Web Vitals, 3D readiness, quality transitions | Denied by default | Product analytics; enabled only by explicit choice |

Consent is stored as `lieuva-telemetry-consent-v1`. Revocation stops queued optional events. The Data & Rights screen exposes Allow/Off controls and states what is excluded.

Never collect:

- raw account, Project, Space, Gallery, revision, invitation, or session identifiers;
- email, display name, nickname, title, artist, description, notes, or artwork metadata;
- full URLs, hash fragments, query strings, Storage paths, filenames, image sources, tokens, or uploaded content;
- keystrokes, pointer traces, screenshots, or free-form text.

The browser uses an ephemeral session UUID only for batching/session analysis. The server immediately replaces it with a 12-character SHA-256 reference. It is not an account identifier.

## 3. Environments

| Environment | Default transport | Intended use |
| --- | --- | --- |
| development | no-op | local development |
| test | injected in-memory transport | deterministic tests |
| staging | Firebase only when explicitly configured | QA fixtures |
| production | Firebase Functions transport | consented real-user measurement |

`VITE_TELEMETRY_MODE=functions` enables transport. `VITE_TELEMETRY_ENVIRONMENT` sets the explicit environment. The Firebase deploy workflow sets both only for the production build. Events include their environment and dashboards must filter it.

## 4. Event schema

Every event has: `name`, ISO `occurredAt`, coarse `environment`, coarse `route`, ephemeral `sessionId`, and allow-listed `properties`. Browser batches contain at most 20 events; the in-memory queue is capped at 40; failed sends are dropped without retry storms.

### Funnel events

| Event | Meaning | Safe dimensions |
| --- | --- | --- |
| `landing_view` | Landing route viewed | source |
| `create_started` | Template picker/create flow entered | source |
| `template_selected` | Template chosen | template |
| `studio_ready` | Builder route ready | template |
| `artwork_upload_started` | Normalized upload begins | count |
| `artwork_upload_completed` | Upload completes | count |
| `walk_preview_entered` | Builder Walk Preview entered | template |
| `publish_review_opened` | Review UI opened | template, is_update |
| `account_gate_opened` | Publish required sign-in | stage |
| `publish_started` | New publication began | template, visibility |
| `publish_succeeded` | New publication completed | template, visibility |
| `publish_failed` | Publication failed | template, visibility, error_class |
| `share_action` | User invoked sharing | source |
| `published_space_opened` | Visitor route opened | none |
| `published_space_ready` | Visitor experience resolved | template |
| `discover_viewed` | Discover feed requested | source |
| `published_edit_started` | Existing publication opened for editing | template |
| `published_update_started` | Revision update began | template, visibility |
| `published_update_succeeded` | Revision update completed | template, visibility |
| `published_update_failed` | Revision update failed | template, visibility, error_class |

### Performance and reliability events

| Event | Purpose | Safe dimensions |
| --- | --- | --- |
| `web_vital` | LCP, CLS, INP, FCP, TTFB | metric, value, rating |
| `three_milestone` | renderer/model/interactive milestone | runtime, stage, template, duration_ms, quality |
| `three_runtime_health` | context loss/restore and adaptive quality transition | runtime, outcome/reason, quality |
| `application_error` | classified UI/runtime failure | operation, error_class, online |

## 5. Route taxonomy

Only stable categories are emitted: `home`, `template_picker`, `studio`, `published_edit`, `published_space`, `reference_demo`, `account`, `data_rights`, `auth_action`, `other`. Dynamic IDs and URL details are discarded before event creation.

## 6. Error taxonomy

Client: `access`, `storage`, `quota`, `network`, `conflict`, `unknown`.

Server: `access`, `quota`, `conflict`, `availability`, `validation`, `internal`.

Errors are classified from stable codes only. Messages and stack traces are not client telemetry properties. Firebase platform logs remain access-controlled operational evidence.

## 7. Server log contract

Structured operation records use message `lieuva_operation`, schema `lieuva_observability_v1`, operation, outcome, duration, safe error class, and an optional hashed resource reference. Browser batches use `lieuva_client_event`, schema `lieuva_client_telemetry_v1`.

SEO delivery Functions (`spaceDocument`, `spaceCard`, `spaceSitemap`) use structured outcome logs. Firebase callable/platform logs remain the failure source for Auth, App Check, ACL, email, export/deletion and cleanup operations until each operation adopts the same helper.

## 8. Retention, access and ownership

Pilot recommendation: retain observability logs for 30 days, restrict access to project operators, and export no raw telemetry to advertising systems. Product analytics must not be joined to Auth/profile data. Any future vendor requires a privacy review, EU-region/processing decision, retention setting, deletion procedure, and an adapter behind the same boundary.

Dashboard owner: product/engineering owner. Incident owner: Firebase project owner. Review consent wording and retention before public analytics activation.

