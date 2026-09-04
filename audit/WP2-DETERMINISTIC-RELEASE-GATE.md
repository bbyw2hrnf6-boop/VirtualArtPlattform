# WP2 — Deterministic Release Gate

Date: 2026-09-03

Local repository implementation: **complete**

External GitHub/GCP setup and first production run: **still required**

Production mutation by WP2 implementation: **none**

## Scope and compatibility

WP2 adds a locked verification path, an immutable main-branch release artifact,
keyless GitHub authentication, one combined Firebase promotion, a separate
credential-free production smoke, performance regression ceilings, and isolated
client/Functions test and build outputs.

It does not rename or migrate any AURA/Firebase identifier, collection,
document, Storage path, callable Function, route, publication ID, or legacy
contract. Historical audit and performance baseline documents remain dated
snapshots and were not rewritten.

## Local commands

Use Node `22.23.2` from `.nvmrc`, npm `10.9.8`, and the committed lockfiles:

```bash
npm ci
npm ci --prefix functions
npm run check
npm run check:functions
npm run test:browser-smoke:install
npm run test:browser-smoke
```

`npm run check` runs lint, the client-scoped Vitest suite, Node script tests,
the Firebase CLI lock tests and validator, the TypeScript/Vite production
build, Space-shell preparation, and the performance gate.
`npm run check:functions` runs source-scoped tests, Functions script tests,
explicit test typechecking, a clean production-only emit, and its output
verifier. Playwright loads the built home and Create Space surfaces in the
locked Chromium version and fails on browser errors.

Production variables can be checked locally without network access or printing
their values:

```bash
npm run preflight:production -- \
  --project-id virtualartplattform \
  --origin https://lieuva.com \
  --functions all \
  --mail-mode disabled
```

The deployed read-only check is:

```bash
npm run smoke:production -- \
  --base-url https://lieuva.com \
  --project-id virtualartplattform \
  --noindex-path /spaces/EXACT_PENDING_ID
```

The final option is optional. The smoke makes five or six bounded,
unauthenticated requests, follows no redirects, sends no credential, and never
calls a mutating path.

## Verify and immutable artifact

`.github/workflows/ci.yml` runs its locked quality gate for pull requests,
pushes to `main`, and manual dispatches. It uses commit-SHA-pinned actions,
exact Node `22.23.2`, both lockfiles, read-only repository permission, bounded
timeouts, and per-ref concurrency.

Pull-request and manual runs execute lint, client tests, script tests, Functions
checks, a preview build, and Chromium smoke. A successful push to
`main` runs the same non-build quality checks, then the dependent
`production-artifact` job performs the production-configured release build:

1. validate the repository/organization production variables;
2. install both locked dependency trees and reject lockfile drift;
3. compile and verify Functions;
4. generate `functions/functions.yaml` with the locked Firebase Functions
   discovery binary and validate its exact reviewed endpoints and parameters;
5. build Hosting with the production App Check and telemetry configuration;
6. browser-smoke those exact built bytes;
7. validate the dedicated Firebase CLI lock, install CLI `15.28.2` with
   lifecycle scripts disabled, and verify its binary;
8. assemble and verify `artifacts/wp2-release/`;
9. upload `lieuva-production-{SHA}-{VERIFY_RUN_ID}` for 30 days and record its
   artifact ID and archive digest.

The release bundle is allowlisted and bounded to 5,000 files and 250 MiB. It
contains:

- built Hosting `dist/`;
- production-only `functions/lib/*.js`;
- validated `functions/functions.yaml`;
- `functions/generated/app-shell.html`, byte-equal to `dist/index.html`;
- Functions package and lock files plus the three legacy AURA parameters in a
  project environment file created with mode `0600` before artifact upload;
- root package/lock metadata and the dedicated Firebase CLI package/lock
  metadata used to bind the toolchain;
- a generated `.firebaserc` for `virtualartplattform`;
- the bounded production-smoke implementation;
- sanitized `firebase.json` containing only Functions and Hosting targets; and
- `lieuva-release-manifest.json` with SHA, tool versions, configuration
  fingerprints, exact paths, sizes, and SHA-256 for every bundled file.

The uploaded artifact contains no `node_modules`, TypeScript source, test,
source map, Firestore rule/index, Storage rule, or build hook. Both Functions
and Hosting `predeploy` entries are removed from the bundled Firebase config.
Symlinks, special files, extra paths, changed bytes, missing files, unsafe
parameter defaults, unexpected Function exports, or an unsafe Firebase CLI lock
fail artifact creation or validation. The generated discovery manifest is
removed from the checkout after bundling; the verified copy remains in the
artifact.

## Artifact resolution and production promotion

`.github/workflows/deploy.yml` accepts only a successful `Verify` caused by a
push to `main`, or a manual full 40-character SHA with such a successful run.
It has three separated jobs.

### 1. Unprivileged resolution and validation

`resolve-release` has only Actions/content read permission and no GitHub
environment or cloud identity. It proves the exact workflow path, event,
branch, source repository, SHA, successful conclusion, unique unexpired
artifact name, artifact ID, and archive digest. Automatic deployment also
refuses a SHA that is no longer current `main`.

It checks out the verified SHA only to obtain its validator, downloads only the
resolved artifact ID with digest mismatch set to error, and revalidates the
complete allowlist, file hashes, project, tool versions, sanitized config,
Functions discovery manifest, production parameter values, and configuration
fingerprints. It exports the artifact identity and release-manifest SHA-256 to
the privileged job.

### 2. Privileged combined deploy

`deploy` targets the protected `firebase-production` environment and alone has
`id-token: write`. It does not check out source, install application
dependencies, or rebuild. It redownloads the exact artifact ID and uses an
inline verifier—not code from the artifact—to recheck every file/digest,
expected manifest field, configuration fingerprint, sanitized Firebase config,
discovery manifest, WIF variable shape, and the CLI lock's registry and SHA-512
integrity contract. It then installs only the digest-bound Firebase CLI
dependency tree with npm `10.9.8` and lifecycle scripts disabled. Before WIF
authentication it only reads the installed CLI package JSON to confirm the
version; the Firebase CLI itself first executes after authentication. Because
artifact transport does not preserve the original mode, the privileged
verifier explicitly restores the Functions environment file to `0600` after
download.

After one final automatic-main check, it runs one pinned Firebase CLI command
from the artifact directory:

```text
deploy --only functions,hosting
```

Functions and Hosting—including `pinTag` rewrites—therefore use the same
verified bundle and promotion. Firestore rules, Firestore indexes, and Storage
rules are absent and cannot be deployed by this artifact. No predeploy hook can
rebuild or mutate its contents. The deployment summary records SHA, Verify run,
artifact name/digest, CLI version, and target set.

### 3. Credential-free production smoke

`smoke-production` runs only after promotion. It has no cloud identity and only
Actions read permission. It redownloads the same artifact, checks the release
manifest digest, and runs the bundled public smoke against `https://lieuva.com`
with up to six bounded attempts. `WP2_NOINDEX_PATH`, when configured, adds an
exact pending Space or Creator noindex check.

## Variables and environments

| Scope required by workflow | Name | Purpose |
| --- | --- | --- |
| Repository or organization | `VITE_FIREBASE_APPCHECK_SITE_KEY` | Production build input; real public site key |
| Repository or organization | `AURA_PUBLIC_APP_URL` | Exact public origin, `https://lieuva.com` |
| Repository or organization | `AURA_REPLY_TO` | Valid monitored reply address |
| Repository or organization | `AURA_LEGAL_FOOTER` | Final non-placeholder legal sender footer, 20–500 characters |
| Repository or organization, optional | `WP2_NOINDEX_PATH` | Exact `/spaces/{id}` or `/creators/{handle}` smoke target |
| `firebase-production` environment | `FIREBASE_DEPLOY_SERVICE_ACCOUNT_EMAIL` | Dedicated deploy identity |
| `firebase-cleanup` environment | `FIREBASE_CLEANUP_SERVICE_ACCOUNT_EMAIL` | Dedicated cleanup identity |
| Both environments, or shared repository/organization | `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full WIF provider resource name |

The four build/configuration values must be repository or organization
variables: artifact creation and unprivileged resolution deliberately do not
attach to `firebase-production`. Do not define conflicting environment-level
overrides; fingerprint checks will reject them. `WP2_NOINDEX_PATH` must also be
repository/organization scoped because the smoke job has no environment.

The deploy and cleanup service-account emails belong in their respective
protected environments. A common WIF provider can be shared at repository or
organization scope, or the same variable name can be configured separately in
both environments. Workflow constants fix project `virtualartplattform`, Node
`22.23.2`, npm `10.9.8`, Firebase CLI `15.28.2`, telemetry mode `functions`,
telemetry environment `production`, and production origin
`https://lieuva.com`.

No long-lived Firebase service-account JSON is used. Cleanup runs from current
`main` in the separate `firebase-cleanup` environment and mints a short-lived
token scoped to Datastore and Storage read/write APIs.

Production preflight has two explicit modes. `required` rejects empty,
malformed, or placeholder mail URL, reply-to, and legal-footer values.
`disabled` requires bounded placeholder sender values, records the mode in the
immutable schema-v2 release manifest, and still permits Functions and Hosting
promotion. The mail Functions repeat validation at runtime and fail closed
before queuing delivery. Activating mail requires replacing the placeholders
and changing every committed workflow `WP2_MAIL_MODE` constant to `required`.

## Performance targets and release ceilings

All values are gzip-compressed bytes measured from built `dist` JavaScript and
CSS.

| Metric | Product target | Enforced release ceiling |
| --- | ---: | ---: |
| Total JavaScript | 560,000 | 575,000 |
| Total CSS | 43,000 | 54,000 |
| Largest lazy JavaScript chunk | 195,000 | 195,000 |
| Entry JavaScript | 115,000 | 305,000 |
| Entry CSS | 32,500 | 32,500 |

Crossing a release ceiling always fails the build. Missing a stricter product
target prints an open-target warning and becomes fatal only with
`LIEUVA_STRICT_PERFORMANCE_BUDGET=1`. Release ceilings freeze the current
shipped envelope against regression; they do not mark the product targets
complete.

## Test/build separation

- Root Vitest discovers only `src/**/*.test.{ts,tsx}` and
  `src/**/*.spec.{ts,tsx}`.
- Functions Vitest discovers only `functions/src/**/*.test.ts` and
  `functions/src/**/*.spec.ts`, never compiled output.
- The Functions build cleans `lib`, excludes tests, emits JavaScript only, and
  rejects any file set that differs from production source.
- A separate no-emit config retains strict Functions test typechecking.
- `firebase.json` `functions.ignore` protects ordinary local Firebase use; the
  immutable artifact's allowlist and sanitized config are the production
  boundary.

## Dependency watch

The dedicated `firebase-tools` `15.28.2` lock currently audits at zero high or
critical advisories and eight moderate transitive advisories. It is an
ephemeral, lifecycle-script-disabled deployment CLI rather than application or
server runtime code; that bounded exposure is accepted for WP2. Monitor normal
upstream releases and upgrade the pinned lock deliberately. Do not use npm's
downgrade-style force fix. Known moderate transitive advisories in the Functions
dependency tree remain tracked for WP3.

## Traceability and rollback

The evidence chain is commit SHA → successful main `Verify` run → artifact ID
and GitHub archive digest → release-manifest SHA-256 → per-file SHA-256 → WIF
promotion summary → credential-free smoke result. The privileged job deploys
the verified bytes; it does not reproduce them.

The combined Firebase CLI command removes the intentional split-version window,
but Firebase promotion is not a transactional multi-resource commit. A failure
or failed final smoke still needs operator rollback. Manually dispatch the
deploy workflow with a still-retained previous successful-main SHA. If its
30-day artifact expired, revert on `main` and let `Verify` create a new reviewed
artifact. Never roll back by changing Firestore IDs, collections, Storage
paths, ACLs, or legacy AURA names. Rules/index rollback remains separate.

## External setup still required

1. Protect `main` by requiring the `Verify` workflow's `Locked quality gate`
   before merge.
2. Create and protect `firebase-production` and `firebase-cleanup`; restrict
   both to `main`, require an independent reviewer for `firebase-production`,
   and choose cleanup review rules compatible with unattended scheduled runs.
3. Create the GitHub OIDC WIF provider. Restrict claims to immutable owner ID
   `278525962`, repository ID `1315998556`, `refs/heads/main`, and the exact
   workflow/environment subject pairs documented in `FIREBASE_SETUP.md`.
4. Bind the exact WIF principals to separate least-privilege deploy and cleanup
   service accounts. Do not grant Owner and do not create JSON keys.
5. Add the variables at the scopes in the table, without shadowing the
   production build values. Configure an exact pending noindex fixture where
   operationally safe.
6. Run a main `Verify`; retain its run URL, artifact ID, archive digest, SHA,
   and release manifest. Approve one production promotion and confirm the
   credential-free smoke.
7. Manually run cleanup once, inspect its bounded deletion summary, and record
   the recovery/escalation owner for WIF, deploy, smoke, and rollback failures.

Primary references: [Google Cloud WIF for deployment pipelines](https://cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines), [Google GitHub authentication action](https://github.com/google-github-actions/auth), and [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
