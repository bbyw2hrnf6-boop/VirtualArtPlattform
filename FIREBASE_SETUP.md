# Firebase setup for LIEUVA — Firestore + Storage MVP

LIEUVA uses Anonymous, Email/Password, and Google Authentication; Firestore for Space metadata and access roles; and Firebase Storage for work images and Space covers. Legacy AURA/gallery identifiers remain intentionally unchanged. Firebase requires the Blaze pay-as-you-go plan for Storage access as of 3 February 2026. No-cost quotas still apply, but configure billing alerts.

## Services

| Service | Purpose |
| --- | --- |
| Authentication | Guest identity plus Email/Password and Google accounts |
| Firestore | Gallery metadata, layout, visibility, ACL, Discover, expiry |
| Storage | Compressed artwork images and covers |
| Cloud Functions | Publication permits, quotas, lifecycle, safe Trash, canonical Space HTML, cards and sitemap |
| Firebase Hosting | Root application plus clean `/spaces/{id}` delivery rewrites |
| App Check | Blocks scripts that are not running in the registered LIEUVA app |
| GitHub Action | Physical cleanup after expiry or the Trash recovery window |

New publications use schema v3. Existing schema-v1/v2 galleries remain public and readable; new rooms do not create legacy `galleryArtworks` documents.

## 1. Confirm the project

The app targets project `virtualartplattform` and bucket `virtualartplattform.firebasestorage.app`. Firebase web configuration is public client configuration. Never commit or paste a service-account key.

## 2. Authentication

1. Open **Firebase Console → Authentication → Sign-in method**.
2. Enable **Anonymous**.
3. Enable **Email/Password** (Email link is not required).
4. Enable **Google**, choose the public support email, and save.
5. Under **Authentication → Settings → Authorized domains**, add:
   - `localhost`
   - `lieuva.com`
   - `www.lieuva.com`
   - `bbyw2hrnf6-boop.github.io`
   - any future replacement domain before it becomes active

### Branded account email and LIEUVA Preview Letter

The web app now requests a branded verification email from trusted Cloud
Functions. Newsletter consent is separate, optional, unchecked by default, and
stored server-side. One welcome edition is queued only on the first opt-in per
account. Client code cannot write email jobs or consent records.

Before deployment, choose a transactional email provider with SMTP support
(for example Postmark, Mailgun, SendGrid, or another provider you control),
verify the sending domain, and create a real sender address such as
`hello@your-lieuva-domain.example`. Do not use a personal mailbox password.

1. Install the official **Trigger Email from Firestore** extension:

   ```bash
   npx firebase-tools@15.28.2 ext:install firebase/firestore-send-email \
     --project virtualartplattform
   ```

2. During extension setup use:
   - Firestore collection: `mail`
   - SMTP connection URI: the provider's TLS SMTP URI
   - Default from address: a verified LIEUVA sender
   - Default reply-to: the public support address
   - Users/templates collection: leave blank unless the extension explicitly requires a value
3. Add these GitHub repository or organization variables with real public
   information:
   - `AURA_PUBLIC_APP_URL`: `https://lieuva.com`
   - `AURA_REPLY_TO`: the monitored support email
   - `AURA_LEGAL_FOOTER`: legal sender name and full postal address
4. Use the immutable production release in sections 8 and 10. It verifies these
   values, packages the legacy-named Function parameters, and promotes Functions
   and Hosting together. Do not bypass the gate with a direct Functions deploy.
5. In **Authentication → Templates → Email address verification**, set the
   custom action URL to:
   `https://lieuva.com/`
   Firebase appends `mode`, `oobCode`, and continuation parameters. The LIEUVA
   route verifies the code and returns the visitor to the product.
6. Set the fallback Firebase sender name to **LIEUVA**, use the same reply-to,
   and update the public-facing project name. The fallback is used only while
   the branded function is unavailable.
7. Publish the repository's current `firestore.rules` manually. No Storage-rule
   change is needed for email delivery.

The branded functions use the Admin SDK to create Firebase action links. Do
not call the Firestore `mail` collection from the browser. Marketing consent
must remain optional. Release preflight and the Functions runtime both reject
empty, malformed, or placeholder URL, reply-to, and legal-footer values before
mail is queued. Before sending recurring campaigns, replace the preview data
notice with final operator details, privacy policy, imprint/terms where
required, and obtain legal review for each target country.

Live email acceptance test:

1. Create a new Email/Password test account without ticking the letter box.
   Confirm exactly one branded verification email and no welcome letter.
2. Open the verification link and confirm the LIEUVA result page completes the
   action and returns to the account.
3. Create another test account with the checkbox ticked. Confirm one
   verification email and one LIEUVA Preview Letter.
4. Sign out and in again with the same account. Confirm no second welcome
   edition is sent.
5. Open the unsubscribe link, confirm the explicit POST action, and confirm the
   Profile & settings toggle is off after reloading the account. A passive GET
   from a mail scanner must not change the preference.
6. Repeat opt-in once through Google sign-in and check mobile rendering, spam
   placement, sender alignment (SPF/DKIM/DMARC), and reply handling.

## 3. Blaze and Storage bucket

1. Open **Usage and billing → Details & settings**.
2. Select **Modify plan → Blaze** and connect a Google Cloud billing account.
3. Create Google Cloud budget alerts, for example 1 €, 5 €, and 20 €. Alerts do not hard-stop spending.
4. Return to Firebase Console and open **Storage**.
5. Select **Get started**.
6. Create the default bucket `virtualartplattform.firebasestorage.app`.
7. Choose the same or nearest compatible location as Firestore. This location is difficult to change later.
8. Start with production rules. Never use public test-mode rules.

## 4. Promote reviewed rules and indexes

Do not paste policy into Firebase Console and do not run an ad-hoc `npx`
deployment. `firestore.rules`, `storage.rules`, and
`firestore.indexes.json` are one reviewed policy release:

1. Install the exact repository and Firebase CLI locks under Node `22.23.2`,
   provide Java `21.0.12.1+1`, and run the credential-free emulator matrix:

   ```bash
   npm ci
   npm ci --prefix firebase-cli --ignore-scripts --no-audit --no-fund
   npm run test:firebase-rules
   ```

2. Merge the reviewed policy revision to `main`. A successful push-to-main
   `Verify` run uploads `lieuva-policy-{sha}-{run_id}`. The six-file policy
   bundle has a manifest with exact file hashes and contains a sanitized
   Firebase config that can target only Firestore rules/indexes and Storage
   rules.
3. Manually dispatch **Promote Firebase policy** from `main`. Supply the full
   successful-main SHA, type `virtualartplattform`, and provide the reviewed
   change/incident/rollback reference.
4. Inspect the unprivileged artifact/provenance result, then approve the
   protected `firebase-policy-production` environment.
5. The protected job installs only Firebase CLI `15.28.2` from its verified
   lock, authenticates through WIF, adds required indexes without `--force`,
   and waits for every repository index/override to report `READY` before it
   promotes Firestore and Storage rules.
6. The same job fetches the active Firestore and Storage rulesets and current
   index resources. It fails unless rule-source hashes match the artifact,
   every required index/override is present and ready, and no undeclared field
   override or TTL policy exists. Extra composite indexes are counted and
   retained; deleting them is a separate reviewed migration.

The authoritative index inventory is `firestore.indexes.json`, including the
Discover lifecycle indexes, collection-group fields used by account deletion
and moderation, and the `accountExportJobs`/`accountExportChunks` `expiresAt`
TTL overrides, the `accountDeletionJobs(status, updatedAt)` recovery index, and
the deletion tombstone's `expiresAt` TTL override. The emulator does not enforce compound-index or TTL readiness,
so the live post-promotion check requires every declared TTL state to be
`ACTIVE`. Storage rules read Firestore gallery,
membership, and trusted permit documents; enable the Storage service agent's
cross-service Rules access before the first protected promotion.

The immutable application release remains Functions and Hosting only. The
policy workflow is deliberately separate, manually approved, and can roll back
to a still-retained successful-main policy artifact by dispatching its SHA.

### WP1 production record — 2026-09-02

The first reviewed-content containment is live:

- ten known fixture Spaces and one test Creator were backed up and removed from
  discovery without deleting their records or assets;
- all three new composite indexes are `READY`;
- active Firestore ruleset
  `220efd97-efc8-4995-a622-42382d03ff46` has source-hash parity with
  `firestore.rules`;
- Hosting and the 20 scoped public/callable Functions were deployed with CLI
  `15.28.2`, and all report `ACTIVE`;
- the live directory has zero approved Creators and zero approved Spaces; the
  sitemap contains only `/` and `/creators`; quarantined direct Space links are
  `noindex`.

The executed order was backup/containment, indexes, strict rules, Hosting plus
its pinned routes, then the remaining callable Functions. Strict rules briefly
froze old-client publication until Hosting completed; the deployed client now
writes the required fail-closed state. Already-open pre-WP1 Studio tabs should
be reloaded before publishing.

### WP1 reviewed-content rollout order

`discoverEligible: true` is trusted approval state. Do not deploy Functions that
trust it while production still has older Firestore rules that let clients
preserve or introduce that field.

1. Back up and set all unreviewed live records to `discoverEligible: false`.
2. Deploy `firestore:indexes` and wait until every new index is **Enabled**.
3. Deploy Hosting only, so new and reloaded Studio clients always write `false`
   for creates and revisions.
4. Deploy the strict `firestore:rules`. Older already-open Studio tabs may then
   fail a publish once; reloading moves them to the compatible client.
5. Deploy Functions only after the strict rules are active.
6. Inspect exact revisions with `npm run review:public-content -- ...`, then use
   `npm run review:public-content:decision -- ...` first as a dry-run and only
   then with its exact execution guard. Never edit the gate directly in Firebase
   Console.
7. Verify the directory, sitemap, one approved target, and one pending target.

The current production GitHub workflow deploys only Hosting and Functions. It
must not be used for the first WP1 rollout or as proof that repository rules and
indexes are in parity.

## 5. Apply CORS once

The app reads Storage files as bounded blobs so Safari can release memory predictably. From the repository root:

```bash
gcloud auth login
gcloud config set project virtualartplattform
gcloud storage buckets update gs://virtualartplattform.firebasestorage.app \
  --cors-file=storage.cors.json
```

Add any future custom origin to `storage.cors.json`, then rerun the last command.

## 6. App Check and trusted room mutations

The current client initializes App Check only when
`VITE_FIREBASE_APPCHECK_SITE_KEY` is present. The trusted publication and
lifecycle Functions require a valid App Check token.

1. Open **Firebase Console → App Check → Apps → Web app**.
2. Register the existing LIEUVA web app with **reCAPTCHA Enterprise** and create
   a site key for `lieuva.com`, `www.lieuva.com`, and the retained
   `bbyw2hrnf6-boop.github.io` origin.
3. Add a GitHub repository variable named
   `VITE_FIREBASE_APPCHECK_SITE_KEY` containing that public site key.
4. Complete the email parameters in section 2 and the WIF/environment setup in
   section 8. The production gate validates all deployed Functions together; it
   intentionally does not offer a partial core-Functions bypass.
5. On the first deployment, enable Cloud Functions, Cloud Run, Cloud Build,
   Artifact Registry, Eventarc, and Cloud Scheduler APIs for this project if
   Google Cloud asks. The immutable Functions manifest requires
   `cloudscheduler.googleapis.com` for `resumeAuraAccountDeletions`.
   Until the verified combined release succeeds, publishing, visibility
   changes, Trash/restore, renewal, and ACL invitations intentionally fail
   closed instead of changing room data directly from the browser.
6. Promote the exact immutable policy artifact through the protected process in
   section 4. Do not paste rules in the Console or run an ad-hoc policy deploy.
7. Promote the verified Functions and Hosting artifact as described in section
   10, verify publishing and lifecycle actions, then enable
   App Check enforcement for **Cloud Functions, Firestore and Storage** in the
   Firebase Console. Use monitor mode first and review metrics before enforcing.
8. For local testing, register a Firebase App Check debug token and place it in
   an uncommitted `.env.local` as
   `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN=...`. Never put a debug token in GitHub
   variables or a production bundle.

Publication now starts with a 20-minute server permit. Publishing requires a
verified Email/Password or Google account; each account can start at most 20 new
publications per UTC day. Storage paths are immutable and bounded to one cover
plus the template artwork limit. Repeated revisions still require a current
Owner/Editor ACL and App Check.

### WP3 trusted media rollout and legacy metadata scrub

New schema-v3 media is uploaded one bounded image at a time through the trusted
`uploadAuraGalleryAsset` callable. The browser cannot create, update, or delete
anything below `published/**`; the Function checks the current permit and
Owner/Editor state, decodes the bytes, derives the legacy-compatible final path
and metadata itself, and creates the object with an immutable generation
precondition. A manifest is committed only after all expected objects pass a
second trusted inspection. Do not re-enable direct client writes as a rollback.

Account avatars use `setAuraAccountAvatar`; Creator avatars and covers use their
existing trusted callables. Direct browser writes to those Storage paths are
denied. Each callable holds `accountMediaUploadLeases/{uid}` for at most 60
seconds, longer than its 30-second ceiling. Account deletion waits out a current
lease, claims the lease for the deletion ID, then performs the final media drain.
The lease collection is server-only and its `expiresAt` TTL removes stale rows.

Old objects may still carry Firebase download-token metadata or a revision
editor's raw `uploaderId` from deployments before this boundary. Remove both
with the guarded, bucket-authoritative migration.
The scan includes live, deleted, and orphaned objects under `published/`; it is
not driven by current gallery documents. Run it only after the server-owned
upload Function and compatible Hosting client are active:

```bash
export FIREBASE_PROJECT_ID='virtualartplattform'
export FIREBASE_STORAGE_BUCKET='virtualartplattform.firebasestorage.app'
export STORAGE_POLICY_MIGRATION_MODE='plan'
export STORAGE_POLICY_MIGRATION_MAX_OBJECTS='1000'
npm --prefix functions run maintenance:storage-policy
```

Plan mode is read-only. Repeat it with the reported
`STORAGE_POLICY_MIGRATION_START_AFTER` until `complete` is true, recording the
inspected and changed counts. Then remove that plan-only variable, change the
mode to `apply`, and invoke the same command until its persisted two-pass
checkpoint reports `complete: true`. Apply mode uses metageneration guards, a
single-writer lease, and `securityMaintenanceState/gallery-storage-metadata-v3`;
a crash is resumed rather than restarted. It also refuses to start unless
`STORAGE_POLICY_MIGRATION_CONFIRM` exactly equals
`virtualartplattform:gallery-storage-metadata-v3`. Set that confirmation only
after reviewing the complete plan. Finally run the complete plan scan again and
require `changedObjects: 0` on every page. Never delete the checkpoint or raise
the 10,000-object per-invocation cap to force completion.

```bash
unset STORAGE_POLICY_MIGRATION_START_AFTER
export STORAGE_POLICY_MIGRATION_MODE='apply'
export STORAGE_POLICY_MIGRATION_CONFIRM='virtualartplattform:gallery-storage-metadata-v3'
npm --prefix functions run maintenance:storage-policy
# After the apply and zero-change verification records are complete:
unset STORAGE_POLICY_MIGRATION_CONFIRM
```

Safe promotion order:

1. Pause publishing and updating from the controlled pilot.
2. Promote the Functions/Hosting artifact containing the server-owned upload
   callable and client, while the previous rules remain compatible.
3. Smoke one initial publication and one revision through the callable.
4. Promote the policy artifact that denies all browser writes below
   `published/**`.
5. Prove a direct authenticated Storage create is denied and the callable path
   still succeeds.
6. Run and record the complete plan, guarded two-pass apply, and zero-change
   verification plan above.
7. Resume pilot publishing only after exact Functions/rules/index/TTL parity is
   recorded.

## 7. Security contract

- Upload requires Firebase Authentication, App Check, and a current trusted permit. The callable—not the browser—derives the owner-scoped immutable path; new-room uploads require the Owner and revision uploads also allow a current Editor.
- Storage objects remain immutable. Live edits create a new asset revision and atomically move the existing gallery manifest to it.
- Covers are below 1 MiB; artworks below 2 MiB.
- Only supported image MIME types are accepted.
- Guests can build, autosave locally, and use Walk Preview without an account.
- Only verified accounts can create public, unlisted, or private account-preview rooms.
- Unlisted rooms are readable by direct link but omitted from Discover.
- Private room metadata and images require the owner or an invited verified email.
- Owner, editor, and viewer roles are stored in a gallery member subcollection; the owner is implicit.
- Owners and Editors may update content under the same gallery ID/share URL. Only the owner may change visibility, renew, archive, restore, or move a room to Trash.
- Trash hides the room immediately and keeps a seven-day recovery window. Physical Firestore/Storage deletion is performed by the trusted cleanup worker, never by the browser.
- White Cube and Nocturne accept up to eight works; Grand Forum accepts fourteen.
- Local drafts remain in IndexedDB and never require Firebase.
- Account and Creator avatar/cover writes are callable-only and serialized with
  account deletion by a server-owned media lease.

### Report-only Content Security Policy

Hosting and server-rendered Space/Creator documents emit the same report-only
policy and `Reporting-Endpoints` value. `lieuvaCspReport` accepts only bounded
CSP media types, strips URL paths, queries, fragments, cookies and arbitrary
fields, suppresses duplicates, and rate-limits logs. Treat its telemetry as
security data: keep log access narrow and set an approved retention period.
The exact report-only candidate is also injected as an enforcing policy during
the local Chromium smoke; the Create/sample/WebGL path must complete without a
`securitypolicyviolation` before a release artifact is accepted.

Before changing `Content-Security-Policy-Report-Only` to an enforcing
`Content-Security-Policy`, observe a representative staging and production-pilot
window. Exercise Email/Password and Google Auth, App Check, Firestore, private
and public Storage reads, every callable, all three Space templates, WebGL
fallback, blob-backed media, PWA/service-worker update, and mobile Safari.
Resolve unexplained violations; do not add broad wildcard, `unsafe-eval`, data
connect, or arbitrary frame allowances merely to silence reports. Enforcement
is an approved follow-up release, not an automatic side effect of this WP3
change.

## 8. Lifecycle, cleanup and keyless GitHub authentication

At each room's `expiresAt`, Firestore and Storage rules stop public reads. A room
in Trash is hidden immediately and receives `purgeAt` seven days later.
`.github/workflows/cleanup.yml` deletes Storage objects first, then ACL records,
the gallery manifest, and any legacy artwork documents after either deadline.
Destructive expiry starts only after a five-minute settlement interval, longer
than the trusted upload/finalization leases, and Firestore deletes use the
queried update-time precondition so a renewed record is not removed from a
stale cleanup page.
Precondition conflicts do not count as successful deletion. A malformed asset
retirement is quarantined as `invalid` and left for operator reconciliation so
it cannot poison all later valid cleanup work.

Production promotion and cleanup use GitHub OIDC through Google Cloud Workload
Identity Federation (WIF). They do not use a long-lived JSON key. Do not create
or restore a Firebase service-account-key secret.

Configure the external trust once:

1. Create a WIF pool and OIDC provider in project `virtualartplattform` for
   `https://token.actions.githubusercontent.com/`. Restrict its attribute
   condition to immutable owner ID `278525962`, repository ID `1315998556`,
   `refs/heads/main`, and one of these exact workflow/environment pairs:
   - `bbyw2hrnf6-boop/VirtualArtPlattform/.github/workflows/deploy.yml@refs/heads/main`
     with subject
     `repo:bbyw2hrnf6-boop/VirtualArtPlattform:environment:firebase-production`;
   - `bbyw2hrnf6-boop/VirtualArtPlattform/.github/workflows/cleanup.yml@refs/heads/main`
     with subject
     `repo:bbyw2hrnf6-boop/VirtualArtPlattform:environment:firebase-cleanup`;
   - `bbyw2hrnf6-boop/VirtualArtPlattform/.github/workflows/policy-deploy.yml@refs/heads/main`
     with subject
     `repo:bbyw2hrnf6-boop/VirtualArtPlattform:environment:firebase-policy-production`.
   Map `google.subject=assertion.sub` and the numeric owner/repository ID,
   `ref`, and `workflow_ref` claims before using them in conditions. Do not
   trust a mutable repository name alone, an organization, or all GitHub
   repositories broadly.
2. Create separate deploy, cleanup, and policy service accounts. Grant the exact GitHub
   WIF principals `roles/iam.workloadIdentityUser` only on their service
   accounts. The deploy identity needs only the Firebase Hosting/Functions and
   supporting Google Cloud permissions required by `deploy.yml`, including
   Cloud Scheduler job create/get/list/update/delete access for the declared
   recovery schedule (a reviewed `roles/cloudscheduler.admin` grant or an
   equivalent custom role). Keep `roles/cloudscheduler.serviceAgent` on the
   Google-managed Cloud Scheduler service agent only; never grant that
   service-agent role to the deploy identity. The cleanup
   identity needs Firestore read/delete plus Storage list/delete only for
   `virtualartplattform.firebasestorage.app`. The policy identity needs only
   Firebase Rules release/test/read permissions, Firestore index
   list/create/update readiness access, default-bucket discovery, and service
   usage. The workflow never passes `--force`; do not grant Owner.
3. Add these **repository or organization variables**. They must be available
   before any protected environment is entered because main `Verify` builds the
   immutable production artifact and the unprivileged deploy resolver validates
   it:
   - `VITE_FIREBASE_APPCHECK_SITE_KEY`;
   - `AURA_PUBLIC_APP_URL`;
   - `AURA_REPLY_TO`;
   - `AURA_LEGAL_FOOTER`;
   - optional `WP2_NOINDEX_PATH`, set to one exact pending `/spaces/{id}` or
     `/creators/{handle}` path.
4. Create and protect `firebase-production`, restrict it to `main`, require an
   independent reviewer, and add `FIREBASE_DEPLOY_SERVICE_ACCOUNT_EMAIL` plus
   `GCP_WORKLOAD_IDENTITY_PROVIDER`.
5. Create and protect `firebase-cleanup`, restrict it to `main`, and add
   `FIREBASE_CLEANUP_SERVICE_ACCOUNT_EMAIL` plus
   `GCP_WORKLOAD_IDENTITY_PROVIDER`. A common provider may instead be a shared
   repository/organization variable. Choose review rules compatible with
   whether scheduled cleanup should wait for a human.
6. Create and protect `firebase-policy-production`, restrict it to `main`,
   require an independent reviewer, and add
   `FIREBASE_POLICY_SERVICE_ACCOUNT_EMAIL` plus
   `GCP_WORKLOAD_IDENTITY_PROVIDER`. Keep this identity separate from the
   application deploy and cleanup identities.
7. Do not define environment-level overrides for the four production build
   variables. The artifact records their fingerprints, and a changed value at
   deploy time fails closed.
8. Protect `main` with the pull-request quality gate. Then retain one successful
   main artifact/run record, approve one production promotion, and manually run
   cleanup once before relying on either operational path.

Main `Verify` compiles and browser-smokes the exact release, generates and
validates `functions/functions.yaml`, runs the Firestore/Storage emulator
authorization matrix, and uploads separate digest-bound application and policy
artifacts.
Within the production release, only the protected deploy job receives
`id-token: write`; it deploys Functions and Hosting together without checkout,
application dependency installation, predeploy hooks, or a rebuild. It installs
only Firebase CLI `15.28.2` from its verified dedicated lock with lifecycle
scripts disabled. The Functions environment file is created with mode `0600`;
because artifact transport resets file modes, the privileged verifier restores
`0600` after download. A separate job then smokes production without a cloud
credential. Cleanup independently receives OIDC permission and mints a
short-lived scoped access token in its own environment. The complete release
sequence is recorded in
[WP2 — Deterministic Release Gate](audit/WP2-DETERMINISTIC-RELEASE-GATE.md).
The policy test and promotion contract is recorded in
[WP3 — Firebase Policy Gate](audit/WP3-FIREBASE-POLICY-GATE.md).

Firestore TTL is used only for Firestore-only managed-export checkpoints and
parts, short-lived completed account-deletion tombstones, and stale account-media
leases. Do not use it as a replacement for gallery cleanup: Firestore TTL cannot
remove related Storage objects or recursively delete subcollections.

## 9. Live verification

1. Promote the verified combined Functions and Hosting artifact, then promote
   its compatible policy artifact through the separately protected workflow.
2. Create a room with one small image and publish it.
3. Confirm an anonymous user under **Authentication → Users**.
4. Confirm one schema-v3 document under `galleries`.
5. Confirm `cover.webp` and `artworks/1.webp` under `published/{uid}/{galleryId}` in Storage.
6. Copy the share URL and open it in Chrome incognito and Safari private mode.
7. Confirm the pending room does not appear in Discover. Review its exact
   revision through the WP1 operator workflow, approve it, then confirm it
   appears and all images load.
8. Move the room to Trash, confirm the link closes, restore it, and confirm the same link reopens.
9. Create and verify an Email/Password account; then repeat with Google.
10. Publish one unlisted and one private room. Confirm unlisted is absent from Discover.
11. Invite a second verified email as Viewer, confirm it can enter the private room, and confirm an uninvited account cannot.
12. Run **GitHub Actions → Clean up expired galleries → Run workflow** and confirm zero or more successful deletions.
13. Open one owned room from Account, edit and update it, and confirm the original share URL now shows the revision.
14. Invite a second account as Editor and confirm it can update that same room but cannot manage access or delete it. Confirm a Viewer cannot edit.
15. Change and remove the account avatar through Account settings, then prove a
    direct authenticated Storage write to `profiles/{uid}/avatar.webp` is denied.
16. Exercise the managed account JSONL export and one isolated irreversible
    account deletion with forced interruption/scheduled resume; confirm Auth is
    removed last and only the documented pseudonymous evidence remains.

## 10. Clean Space URL delivery (WP5)

The canonical URL uses the existing Firestore publication ID:

`https://lieuva.com/spaces/{galleryId}`

No Firestore ID, collection, Storage path, callable name, ACL or revision
migration is involved. Main `Verify` prepares
`functions/generated/app-shell.html`, verifies it is byte-equal to the Hosting
`dist/index.html`, and includes both in one immutable release artifact.

### Current release order

1. Run the local gates:

   ```bash
   npm ci
   npm ci --prefix functions
   npm ci --prefix firebase-cli --ignore-scripts --no-audit --no-fund
   npm run check
   npm run check:functions
   npm run test:firebase-rules
   npm run test:browser-smoke:install
   npm run test:browser-smoke
   ```

2. Merge the reviewed revision to `main`. The `Verify` workflow reruns the
   non-build quality gate, then builds and smokes the exact production-configured
   Functions and Hosting artifact. It generates and validates
   `functions/functions.yaml`, records every file digest, strips Firebase
   predeploy hooks, and uploads the artifact for 30 days. The bundle has no
   `node_modules`; it carries dedicated lock metadata for the exact Firebase CLI
   instead.
3. Inspect the main Verify result, commit SHA, artifact ID, and archive digest.
   The automatic deploy resolves that exact successful push-to-main run. A
   manual deploy requires the full SHA of an unexpired successful main artifact.
4. The unprivileged resolver downloads and validates the artifact without WIF
   or a protected environment. Approve `firebase-production` only after this
   job passes.
5. The privileged job redownloads and rechecks the same bytes, authenticates
   with short-lived WIF credentials, and runs one combined
   `functions,hosting` deployment from the sanitized artifact. It performs no
   checkout, application dependency install, or build. It installs only the
   digest-bound Firebase CLI tree with lifecycle scripts disabled. Rules and
   indexes are not present in its Firebase config.
6. A separate unprivileged job redownloads the same artifact and smokes the live
   site without cloud credentials. Configure optional `WP2_NOINDEX_PATH` to
   include one exact pending Space or Creator in this check.
7. Inspect representative raw responses as well as the automated result:

   ```bash
   curl -i https://lieuva.com/spaces/PUBLIC_ID
   curl -i https://lieuva.com/spaces/UNLISTED_ID
   curl -i https://lieuva.com/spaces/PRIVATE_ID
   curl -i https://lieuva.com/spaces/does-not-exist
   curl -i https://lieuva.com/sitemap.xml
   ```

   Approved public HTML must contain current metadata and a self-canonical
   LIEUVA URL. Pending, unlisted, and private HTML must remain generic and
   `noindex`; missing Spaces return 404. The sitemap contains only currently
   approved, active, unexpired public URLs. Also verify the legacy `#/g/{id}`
   redirect, Auth actions, invitations, private access, PWA launch, refresh,
   back, and forward.

### Cache and privacy behavior

- Public Space HTML, cards and sitemap use a 60-second shared-cache lifetime and must revalidate.
- Unlisted/private/error responses use `private, no-store`.
- Public-to-private changes can remain in an already-populated edge cache for at most 60 seconds; protected media access is rechecked independently by `spaceCard`.
- The card endpoint never emits a Storage URL and refuses non-public content.

### Rollback

Manually dispatch the deploy workflow with the full SHA of a still-retained
previous successful-main artifact. The same validation, approval, combined
Functions/Hosting promotion, and credential-free smoke apply. Artifacts are
retained for 30 days. If the required artifact expired, revert the change on
`main` and let `Verify` produce a new reviewed artifact; do not rebuild old
bytes inside the deploy job.

If Firebase Hosting or the custom domain itself must be abandoned, the retained
GitHub Pages delivery remains the infrastructure fallback after traffic is
repointed. Do not delete Functions, Firestore documents, Storage objects, IDs,
revisions, or ACLs as a rollback mechanism. Existing `#/g/{id}` links retain
the durable publication ID and remain compatible with the legacy build.

## 11. Optional: migrate still-active legacy rooms

New rooms need no migration. To move old schema-v1 artwork Data URLs out of
Firestore, first export/backup Firestore, authenticate a named operator with
`gcloud`, and pass only a short-lived OAuth token to the guarded script:

```bash
gcloud auth login
gcloud config set project virtualartplattform
export FIREBASE_PROJECT_ID='virtualartplattform'
export FIREBASE_STORAGE_BUCKET='virtualartplattform.firebasestorage.app'
export GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"
node scripts/migrate-gallery-assets-to-storage.mjs --execute
unset GOOGLE_OAUTH_ACCESS_TOKEN
```

Without `--execute`, the script exits before any network request. Review the
operator identity, exact project and backup first. The script keeps legacy
artwork documents until their normal scheduled expiry cleanup, providing a
rollback window. Never print, persist or commit the access token.

## 12. Troubleshooting

- `storage/unauthorized`: direct gallery/avatar writes are intentionally denied;
  publish current `storage.rules` and use the matching trusted callable through
  the compatible client.
- `storage/bucket-not-found`: confirm Blaze and the exact default bucket name.
- CORS error: apply `storage.cors.json` and include the current origin.
- `firestore/permission-denied`: publish current `firestore.rules` to the same project.
- `auth/unauthorized-domain`: add the hostname under Authorized domains.
- Callable returns `failed-precondition` before deployment: register App Check,
  publish both rule files, configure the production variables, then promote the
  verified combined Functions and Hosting artifact.
- Callable returns `internal`, or its `europe-west1` endpoint returns HTTP 404:
  the Functions are not deployed. Complete sections 6, 8, and 10 and promote a
  verified main artifact; the email extension's SMTP setup remains independent
  of the room callable runtime.
- Cleanup/deploy reports a missing or invalid identity variable: confirm the
  full `GCP_WORKLOAD_IDENTITY_PROVIDER` resource name and the applicable
  `FIREBASE_CLEANUP_SERVICE_ACCOUNT_EMAIL` or
  `FIREBASE_DEPLOY_SERVICE_ACCOUNT_EMAIL` GitHub variable.
- WIF authentication returns `permission_denied`: verify the provider's exact
  repository/ref/workflow attribute condition and the service account's
  `roles/iam.workloadIdentityUser` binding. If authentication succeeds but an
  operation returns 403, inspect that identity's least-privilege Firebase,
  Firestore or Storage IAM grants; do not fall back to a JSON key or Owner.
- Share link has metadata but missing images: verify Storage rules, CORS, object expiry metadata, and object paths.

Official references: [Storage web setup](https://firebase.google.com/docs/storage/web/start), [Storage rules](https://firebase.google.com/docs/storage/security), [billing requirement](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024), [Anonymous Auth](https://firebase.google.com/docs/auth/web/anonymous-auth).
