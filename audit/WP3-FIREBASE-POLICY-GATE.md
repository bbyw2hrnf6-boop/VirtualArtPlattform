# WP3 — Firebase Policy Gate

Status: implemented in the repository; production promotion has not been run.

## Executable authorization proof

`npm run test:firebase-rules` starts only the Firestore and Storage emulators for
the demo project `demo-lieuva-rules`. It never receives cloud credentials. The
suite uses exact `@firebase/rules-unit-testing@5.0.2`, Firebase CLI `15.28.2`,
Node `22.23.2`, and Java `21.0.12.1+1` in CI.

The 27-test matrix covers signed-out, anonymous-provider, unverified, verified
owner, editor, viewer, revoked-member, and outsider contexts. It exercises
public/unlisted/private and active/expired/archived/legacy reads; bounded list
queries; trusted-only gallery manifests and internal collections; profile and
newsletter boundaries; exact publication/revision permits; stale, aborted,
forged, extra-metadata, MIME, path, index, size, overwrite, and deletion cases;
Storage ACL parity; recursive denial of managed-export checkpoints/parts; and
default-deny paths.

The gallery list rule now requires all three query-provable public conditions:
`discoverEligible == true`, `lifecycleStatus == active`, and a future
`expiresAt`. Direct schema-v1/v2 URLs remain readable under their compatibility
contract, but old records missing explicit lifecycle approval are not listed.

## Immutable, approved promotion

On a successful push to `main`, `.github/workflows/ci.yml` creates a second,
policy-only artifact named `lieuva-policy-{sha}-{run_id}`. Its manifest binds the
full commit SHA, Verify run, exact Node/npm/Firebase CLI versions, production
project and bucket, and SHA-256/size for this allowlist:

- `firestore.rules`
- `storage.rules`
- `firestore.indexes.json`
- sanitized policy-only `firebase.json`
- `firebase-cli/package.json`
- `firebase-cli/package-lock.json`

`.github/workflows/policy-deploy.yml` is manual-only and main-only. Its
unprivileged job resolves one successful push-to-main `ci.yml` run and its exact
live artifact ID/digest, checks out that immutable SHA, downloads by run and
artifact ID, and verifies every byte. Only then can a reviewer approve the
`firebase-policy-production` environment.

The privileged job does not check out application source or run repository
scripts. It redownloads the same artifact, repeats a built-in allowlist, digest,
config, and full registry/SHA-512 lock check, installs dependencies with lifecycle
scripts disabled, and authenticates with short-lived WIF credentials. It never
uses a JSON service-account key.

Promotion is ordered:

1. Add repository indexes/field overrides without `--force`.
2. Poll the Firestore Admin API until every required resource is `READY`.
3. Promote Firestore and Storage rules.
4. Fetch both active Rules API releases and all index and TTL resources.
5. Require exact rule-source hashes, required-index parity, no undeclared
   production field override or TTL policy, and `ACTIVE` state for every
   declared TTL override; record ruleset
   IDs, hashes, tool version, retained extra-index count, revision, run, and
   approval-reference hash in the workflow summary.

Extra production indexes are deliberately retained. Their deletion can break a
rollback or older client, so it requires a separate reviewed migration.

## Required GitHub/GCP controls

Create `firebase-policy-production`, restrict it to `main`, require an
independent reviewer, and provide environment variables
`GCP_WORKLOAD_IDENTITY_PROVIDER` and
`FIREBASE_POLICY_SERVICE_ACCOUNT_EMAIL`. Bind a dedicated least-privilege policy
service account only to the exact repository ID, owner ID, main ref,
`policy-deploy.yml` workflow ref, and environment subject documented in
`FIREBASE_SETUP.md`.

The identity needs Rules release/test/read operations, Firestore index
list/create/update/readiness operations, default-bucket discovery, and service
usage. The checked-in command never supplies `--force`. Do not reuse the
Functions/Hosting deploy or cleanup service accounts and never grant Owner.

## Known platform boundary

Ordinary custom Storage metadata is restricted with an exact key allowlist.
Firebase consumes the reserved `firebaseStorageDownloadTokens` metadata key
before Storage Rules evaluate `request.resource.metadata`; the emulator test
documents that Rules cannot reject an attacker-selected value. Therefore Rules
alone are not proof against token URLs. New gallery bytes now use the
server-owned upload callable and browser writes to `published/**` are denied,
closing the pre-finalization token race. The guarded historical migration scrubs
old download-token, cache, and raw `uploaderId` metadata from every matching
object, including orphans, with metageneration preconditions and resumable
two-pass verification.

The Firestore emulator also does not enforce production composite indexes. The
protected live readiness/parity check closes that evidence gap for promotion;
a dedicated Firebase staging project remains advisable for query execution
before open registration.
