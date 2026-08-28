# LIEUVA launch readiness — Work Package 16

**Audit date:** 2026-08-28  
**Repository baseline:** `17f9f91f8d07b28aab2f19454af200d3475f935a` (`main` = `origin/main`)  
**Audited product:** LIEUVA web application, Firebase Functions/Hosting delivery, Studio, visitor experience, Discover, Creator identity/community, account and publishing lifecycle  
**Final verdict:** **PASS WITH CONDITIONS**  
**Launch recommendation:** Do not open unrestricted public uploads yet. Complete the P0 owner actions below, deploy the reviewed WP16 changes, then run a small controlled pilot before deciding on public beta.

This is a hardening and evidence pass, not a new feature package. Automated green tests are necessary but do not by themselves make production launch-ready.

## Executive result

- The checked-in baseline was exactly the successful production deployment source. GitHub Actions run `33150799791` completed successfully for the exact baseline SHA; Firebase Hosting reported the corresponding release. The WP16 fixes listed below are intentionally **not committed, pushed, or deployed**.
- Core repository gates pass: **50 application test files / 298 tests**, **6 Functions files / 48 tests**, and the focused **8-file / 72-test release gate**.
- JPG, PNG and WebP creation, draft persistence/recovery, frame/mat selection, Walk preview, publish/update/recovery, visibility, collaboration and failure paths have automated or browser evidence. HEIC and physical-device source flows remain external.
- Desktop and emulated mobile browser QA found no horizontal overflow and no unexpected application, Three.js, or WebGL console messages on the tested routes.
- Production domain, public Space, Creator profile, sitemap, robots, social-card and canonical endpoints respond correctly. The direct `/creators` route currently returns 404 in production; WP16 contains a tested server-delivery fix awaiting deployment.
- The application is close to a controlled pilot. It is not ready for unrestricted public beta because production rules parity, authenticated role/visibility/App Check smoke, real phones, mail/operator configuration, moderation/malware controls and legal owner decisions still require external evidence.

## P0 launch blockers

| ID | Blocker | Evidence | Owner action |
|---|---|---|---|
| P0-1 | WP16 fixes are local only | Working tree differs from `17f9f91`; production still returns 404 for `/creators` and lacks the new Hosting headers | Review diff, commit, push, allow the standard workflow to deploy Hosting + Functions, and verify the exact deployed SHA |
| P0-2 | Deployed Firestore/Storage rules and indexes are not proven equal to repository | `.github/workflows/deploy.yml` deploys `hosting,functions`, not rules/indexes | Separately approve and deploy the exact reviewed rules/indexes; record release IDs and run isolated deny/allow probes |
| P0-3 | Authenticated production lifecycle has not been executed in this audit | Local deterministic release gate passes; no disposable production owner/editor/viewer accounts were created | Execute the prefixed Public/Unlisted/Private owner/editor/viewer, invite/revoke, update/recovery, App Check valid/invalid and exact cleanup matrix |
| P0-4 | Branded mail/operator setup is absent | Production mail callables return `failed-precondition`; defaults remain `not-configured@invalid.example` and preview legal footer | Configure verified sender, reply-to, legal footer and delivery monitoring. Until then, verify the WP16 Firebase verification fallback after deployment |
| P0-5 | Public-upload abuse controls are incomplete | Repository documents current upload limitations; no malware scanning/moderation service is evidenced | Keep pilot invite-only, or add and validate moderation, reporting response, abuse rate limits and malicious-file controls before public beta |
| P0-6 | Legal/operator decisions remain external | Operator/address, Terms, Privacy, retention, export/delete policy and brand/trademark approvals are not engineering facts | Legal owner approves production copy, entity/operator details, retention, data rights, email consent and brand usage |

## P1 remaining

- Physical iOS Safari and Android Chrome: Studio upload/edit/recover, visitor Walk, fullscreen, touch targets, rotation, low-memory recovery and reduced-motion review.
- Production cold starts were observed around 1.8–3.3 seconds for first server-delivered metadata requests; warm responses were about 0.12–0.14 seconds. Monitor p75/p95 before beta.
- Add a tested CSP after deriving the Firebase/Auth/Storage/Functions allowlist; do not ship a brittle policy blindly.
- Finish the remaining global 44 px touch-target polish outside Creator Hub and validate keyboard focus order with a physical keyboard/screen reader.
- Validate crawler cards with external validators and submit/monitor sitemap in Search Console.
- Confirm production RUM dashboards, alert ownership, notification delivery and incident escalation using real traffic.
- Validate transparent PNG, large WebP/JPEG and HEIC from real device libraries under slow network and memory pressure.
- Calibrated-display visual review for reflection/shadow balance and all three templates remains a human visual-quality action.

## Consolidated WP1–WP15 conditions

| Work package | Consolidated remaining condition | Priority/status |
|---|---|---|
| WP1 | Exact production owner/editor/viewer visibility, invite/revoke, conflicts, App Check, network failure, logs and prefixed cleanup | P0 external |
| WP2 | Legal operator/privacy/retention plus live export/delete callable and deny-rule matrix | P0 external |
| WP3 | Trademark/name rights, entity, handles/assets/pronunciation and Auth/OAuth/email brand | P0 external |
| WP4 | Production email, Auth, App Check, OAuth, legal assets and sender | P0 external |
| WP5 | Authenticated lifecycle and crawler/Search Console operational follow-through | P0/P1 external |
| WP6 | Production telemetry/RUM, real devices, working email identity and active dashboards | P0/P1 external |
| WP7 | Five-person comprehension, reduced-motion/physical device, live funnel, back/forward | P1 external |
| WP8 | Physical 360/390/430 checks; live JPG/PNG/WebP/HEIC/throttle; live edits | P1 external |
| WP9 | Crawler/card validators, search-engine and real-device evidence | P1 external |
| WP10 | Creator rules/functions/hosting deploy plus transaction/image/delete/canonical/OG production matrix | P0 external |
| WP11 | Mid-range phone GPU/FPS, iOS, authorized viewer, memory observation, bespoke Nocturne/Forum polish | P1/P2 external |
| WP12 | Signed-in production smoke, physical devices and low-end RUM | P0/P1 external |
| WP13 | Authenticated publish/update Storage/frame/mat; transparent assets; legacy payload; calibrated display; budgets | P0/P1 external |
| WP14 | Physical tactile QA, production telemetry, authenticated privacy fixtures and legacy Storage CORS/retry | P0/P1 external |
| WP15 | Authenticated production role/visibility/ACL/update/conflict/account matrix, mobile touch, CSS budget and SMTP/legal | P0/P1 external |

## Core end-to-end evidence

| Flow | Result | Evidence/limit |
|---|---|---|
| Create from all three templates | PASS | Browser desktop/mobile template picker and White Cube/Nocturne/Pavilion Studio smoke; deterministic template tests |
| Upload JPG/PNG/WebP | PASS | Local browser chooser accepted one JPEG, PNG and WebP; all showed ready and persisted |
| Upload HEIC | EXTERNAL | No physical HEIC source/device available; do not infer a pass |
| Arrange, frame and mat | PASS | Browser Natural Wood frame + Black mat interaction; validation and persistence tests |
| Save, reload and recover | PASS | Reload showed a three-artwork local draft; Recover Draft restored all filenames; deterministic corrupt/fallback recovery tests |
| Walk/visitor preview | PASS | Browser Walk entry and visitor routes; no unexpected runtime logs |
| Publish and update in place | PASS REPOSITORY | Release gate verifies same ID/revision/media behavior; production authenticated smoke still P0 |
| Public/Unlisted/Private access | PASS REPOSITORY | Direct/discover/private/authorized matrix in release gate; production authenticated smoke still P0 |
| Invite/editor/revoke | PASS REPOSITORY | Deterministic release gate; production role matrix still P0 |
| Partial failure, retry, rollback | PASS | Upload/manifest/transaction cleanup, prior revision preservation, retry and corrupted-draft guards are tested |

## Security, privacy and data rights

- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilities**.
- No tracked private key or service-account JSON was found. Firebase browser configuration is public client configuration, not a server credential.
- Repository Firestore and Storage rules constrain ownership, membership, visibility and Creator internals; deployment parity is unproven and therefore P0.
- WP16 enables App Check enforcement on the verification-email and newsletter callables. Other sensitive newer callables were already enforced.
- WP16 adds Hosting `nosniff`, frame denial, strict-origin referrer policy and camera/microphone/geolocation denial. A CSP remains a deliberate P1 pending a tested Firebase allowlist.
- Private metadata and Discover exclusion are covered by tests. Live isolated privacy fixtures remain required.
- Export/delete implementation exists from prior work; live authorization, recent-authentication, retention and legal wording remain external.

## Mobile, accessibility and visual QA

- Tested locally at desktop plus 360×800, 390×844 and 430×932 emulated viewports; production smoke included desktop and 390×844. Tested routes had zero horizontal overflow.
- Physical Safari/iOS and Chrome/Android were unavailable and are marked EXTERNAL.
- WP16 fixes Creator Logo nested interactive controls, restores a Studio `h1`, raises Creator Hub mobile social targets to at least 44 px, and adds 48 px hold-to-walk controls to both public Space runtimes. Final local checks: one `h1`, zero nested interactive controls, zero mobile Creator Hub targets below 44 px, and zero horizontal overflow.
- Creator Hub activation now retries transient callable failures and maps backend `internal`, timeout and unavailable states to actionable copy. Account settings and Hub activation use the same Creator profile identity and handle rules.
- The former entrance portal architecture is removed. A small, raycastable homepage-return sign is mounted on the arrival-side wall instead.
- Some older global footer/text actions and compact Studio controls remain P1 for physical-device accessibility review.
- Cross-product typography, colors and navigation were visually coherent in landing, templates, Studio, visitor, account, Creator Hub and Creator profile. Calibrated shadow/reflection review remains human P1.

## 3D and performance

Final production build budgets:

| Budget | Actual | Limit | Result |
|---|---:|---:|---|
| Total JS gzip | 553,858 B | 560,000 B | PASS, narrow margin |
| Total CSS gzip | 42,855 B | 43,000 B | PASS, narrow margin |
| Largest lazy JS gzip | 180,987 B | 195,000 B | PASS |
| Entry JS gzip | 113,473 B | 115,000 B | PASS, narrow margin |
| Entry CSS gzip | 31,756 B | 32,500 B | PASS |

Browser console on tested local and production routes: **zero unexpected application errors; zero Three.js/WebGL warnings**. Exact GPU memory, thermal behavior, sustained FPS and low-end phone recovery require physical-device/RUM evidence.

## SEO, sharing and production delivery

- `lieuva.com`, `www` redirect, `robots.txt`, `sitemap.xml`, public Space documents/cards and public Creator documents/JSON returned expected HTTP status and canonical/indexing behavior during read-only production checks.
- Direct `/creators` currently returns 404 in production. WP16 adds a tested indexable `CollectionPage` server document at canonical `https://lieuva.com/creators`; deployment is P0-1.
- Current baseline production source parity is proven by exact SHA and successful deployment. The local WP16 working tree is intentionally ahead and not deployed.
- The authoritative workflow deploys Hosting + Functions only. Rules/indexes are a separately approved production release.
- Rollback: restore a known-good Firebase Hosting release or redeploy a reviewed known-good commit; roll back Functions from the same source when applicable. Never roll back by deleting Firestore/Storage customer data or IDs.

## WP16 code hardening completed

1. Fixed direct Creator Hub server delivery and canonical metadata.
2. Added a Creator Hub metadata regression test.
3. Enforced App Check on branded verification and newsletter callables.
4. Preserved account creation when branded mail is unconfigured by using the Firebase verification fallback for `failed-precondition`; added pure regression tests while retaining hard failures for auth/internal/permission errors.
5. Added baseline Hosting security headers.
6. Fixed nested interactive Creator Logo controls, Studio heading semantics and Creator Hub mobile targets.
7. Corrected README product maturity, deployment-scope and rollback claims.
8. Diagnosed Creator Hub activation 504s in Cloud logs, added transient read/check/save retry and safe user-facing errors, and increased Creator callable timeouts without adding warm-instance cost.
9. Unified Creator Hub activation with Account public-profile settings and added a valid handle suggestion for first-time setup.
10. Reworked Creator Hub navigation, identity status, feed presentation and fixed mobile section dock for clearer community purpose and wayfinding.
11. Removed the entrance portal/door treatment; added a small, obvious in-room homepage-return sign.
12. Added direct touch floor-walk handling and hold-to-walk controls to both normal published Spaces and the Danny demo, while removing competing mobile control CSS.

## Final launch-readiness table

| AREA | VERDICT | EVIDENCE | BLOCKER | OWNER ACTION |
|---|---|---|---|---|
| Product | PASS CONDITIONS | Complete primary surfaces; repository and browser gates green | Pilot evidence incomplete | Limit first release to controlled cohort |
| Creator workflow | PASS CONDITIONS | Create/upload/edit/save/recover browser + tests | Production authenticated run | Run prefixed lifecycle |
| Publishing | PASS CONDITIONS | 72-test release gate | Live owner/editor/update matrix | Execute and clean isolated fixtures |
| Viewer | PASS CONDITIONS | Public routes and visitor QA | Physical devices/private fixtures | Run real-device and privacy matrix |
| 3D | PASS CONDITIONS | No WebGL warnings; templates/Walk smoke | GPU/FPS/thermal evidence | Test mid-range phones |
| Mobile | EXTERNAL | Emulated 360/390/430 pass | No physical iOS/Android | Run device lab |
| Security | PASS CONDITIONS | Audit 0; rules reviewed; App Check/header fixes | Rules parity/CSP/abuse controls | Deploy/verify rules; staged CSP; pilot-only uploads |
| Privacy | PASS CONDITIONS | Visibility/private metadata tests | Live isolated matrix/legal approval | Run deny probes and approve notices |
| Data rights | PASS CONDITIONS | Prior export/delete implementation | Live auth/retention evidence | Run callable matrix; approve retention |
| SEO | PASS CONDITIONS | Canonicals, sitemap, robots and server metadata | `/creators` fix undeployed; external crawler tools | Deploy fix; validate/search-submit |
| Sharing | PASS | Canonical Space URLs/cards and www redirect | External card cache validation | Run major validators after deploy |
| Creator profiles | PASS CONDITIONS | Public profile route/JSON/browser pass | Production creator rules transaction matrix | Run controlled creator fixture |
| Discover | PASS CONDITIONS | Public listing/visibility tests and live data | Operational moderation/real traffic | Pilot and observe |
| Accessibility | PASS CONDITIONS | Semantic/target fixes; keyboard-oriented automated review | Physical AT/global compact targets | VoiceOver/TalkBack/keyboard pass |
| Performance | PASS CONDITIONS | All budgets pass; warm delivery fast | Narrow entry/CSS margins and cold starts | Monitor RUM p75/p95 and freeze growth |
| Telemetry | PASS CONDITIONS | Telemetry tests/callable auth behavior | Dashboard/alert delivery not proven | Exercise production alert chain |
| Email/Auth | NOT READY PUBLIC BETA | Auth code and fallback fixed locally | Sender/legal footer unconfigured | Configure mail, deploy fallback, run signup/reset |
| Firebase | PASS CONDITIONS | Baseline SHA parity; Hosting/Functions deploy green | Rules/indexes parity and new fixes undeployed | Controlled releases with evidence |
| Operations | PASS CONDITIONS | Workflow and rollback documented | On-call/alerts/runbook drill incomplete | Assign owners and run rollback drill |
| Legal/external | EXTERNAL | Engineering limitations documented | Operator, Terms, Privacy, consent, trademark | Legal sign-off |

## Exact verification totals

- `npm run check`: lint PASS; **50 files / 298 tests PASS**; TypeScript + Vite build PASS; performance budgets PASS.
- `npm run check:functions`: **6 files / 48 tests PASS**; Functions TypeScript build PASS.
- `npm run test:release-gate`: **8 files / 72 tests PASS**.
- `npm audit --omit=dev --audit-level=high`: **0 vulnerabilities**.
- `git diff --check`: PASS.
- Browser console: zero unexpected application errors and zero Three.js/WebGL warnings on tested routes.

## Completion

**WP16 complete: YES — repository hardening, consolidation and audit are complete.**  
**Launch ready now: NO — verdict remains PASS WITH CONDITIONS until the P0 owner actions are evidenced.**

### Recommended next action

Review the uncommitted WP16 diff, then explicitly authorize a commit/push/deploy if accepted. After the exact deployment is green, execute P0-2 through P0-6 as a controlled launch gate. If they pass, promote the verdict to **READY FOR CONTROLLED PILOT**; only later promote to public beta using real-device, moderation, legal, mail and production telemetry evidence.
