# Firebase setup for AURA — Spark-plan MVP

AURA uses Firebase Authentication and Cloud Firestore for anonymous ten-day publishing. It deliberately does **not** use Firebase Storage, Cloud Functions, or managed Firestore TTL, allowing the current demo to operate within the Spark-plan free quota while usage remains low.

Official references:

- [Add Firebase to a web app](https://firebase.google.com/docs/web/setup)
- [Anonymous Authentication for web](https://firebase.google.com/docs/auth/web/anonymous-auth)
- [Cloud Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
- [Manage Firestore indexes](https://firebase.google.com/docs/firestore/query-data/indexing)
- [Firestore usage and limits](https://firebase.google.com/docs/firestore/quotas)
- [Firestore pricing and free quota](https://firebase.google.com/docs/firestore/pricing)
- [Managed Firestore TTL](https://firebase.google.com/docs/firestore/ttl)
- [Firebase App Check for web](https://firebase.google.com/docs/app-check/web/recaptcha-provider)

## Services used

| Service | Required | Purpose |
| --- | --- | --- |
| Firebase Authentication | Yes | Invisible anonymous publisher identity and owner deletion. |
| Cloud Firestore | Yes | Gallery metadata, compressed artwork documents, Discover, and expiry timestamps. |
| Cloud Storage | No | Intentionally unused in this MVP. |
| Managed Firestore TTL | No | Requires billing for TTL deletes; replaced by access rules plus scheduled GitHub cleanup. |
| Cloud Functions | No | Intentionally unused in this MVP. |

## 1. Confirm the Firebase project

The committed web-client configuration and `.firebaserc` currently target:

```text
Project ID: virtualartplattform
Auth domain: virtualartplattform.firebaseapp.com
```

Firebase web configuration values are public client identifiers and appear in the built JavaScript. A service-account private key is different: it is a secret and must never be committed or included in the browser configuration.

If you create a replacement project:

1. Register a web app in **Firebase Console → Project settings → Your apps**.
2. Replace the configuration in `src/services/firebase.ts`.
3. Replace the default project ID in `.firebaserc`.
4. Complete every setup and deployment step below against that same project.

## 2. Enable Anonymous Authentication

1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Select **VirtualArtPlattform**.
3. Open **Authentication → Sign-in method**.
4. Enable **Anonymous** and save.
5. Open **Authentication → Settings → Authorized domains**.
6. Confirm these hosts exist:

   ```text
   localhost
   bbyw2hrnf6-boop.github.io
   ```

Add any preview or custom-domain hostname before using it. Enter only the hostname, not `https://` or the `/VirtualArtPlattform/` path.

## 3. Create Cloud Firestore

1. Open **Firestore Database**.
2. Choose **Create database**.
3. Create the default database in **Standard edition**.
4. Choose a region near the expected audience. Treat this as a long-term architecture decision.
5. Start in production mode; the repository rules will replace the initial restrictive rules.

Do not enable Cloud Storage for the current Firestore-only architecture.

## 4. Publish rules and index exemptions

### Firebase Console method

1. Open **Firestore Database → Rules**.
2. Replace the editor contents with the complete contents of `firestore.rules`.
3. Select **Publish**.

The console does not provide an equally convenient way to import the complete `firestore.indexes.json`. Use the CLI for the index exemptions, or configure equivalent single-field exemptions manually.

### Firebase CLI method

From the project root:

```bash
npx firebase-tools@latest login
npx firebase-tools@latest projects:list
npx firebase-tools@latest deploy --only firestore:rules,firestore:indexes --project virtualartplattform
```

Check the project name shown before approving the deploy. The command publishes:

- `firestore.rules`
- `firestore.indexes.json`
- the large-field index exemptions for `coverSrc`, gallery `artworks`, gallery `decor`, and artwork `src`

Do not exempt `expiresAt`: Discover and cleanup query that field.

### Automatic GitHub deployment

`.github/workflows/deploy.yml` now deploys `firestore.rules` and `firestore.indexes.json` to `virtualartplattform` before it publishes the matching web build. The Pages job is blocked if the rules deployment or its credentials fail, so the client and its security contract cannot silently drift apart again.

The `FIREBASE_SERVICE_ACCOUNT` repository secret is shared by the rules deployment and scheduled cleanup workflows. Its Google Cloud identity needs the narrow data-cleanup permissions documented below plus **Firebase Rules Admin** (`roles/firebaserules.admin`) and **Cloud Datastore Index Admin** (`roles/datastore.indexAdmin`).

### What the current rules enforce

- Only authenticated Firebase users can create galleries or artwork documents; the app signs publishers in anonymously.
- The stored `ownerId` must match the authenticated user.
- Unexpired galleries and their artwork documents are publicly readable.
- Client updates are disabled after publication.
- Only the original anonymous owner can manually delete through the web client.
- White Cube and Nocturne accept up to eight artwork metadata entries.
- Grand Forum accepts up to fourteen artwork metadata entries.
- A published gallery accepts up to eight decorative object placements.
- Public artwork metadata may include the frame choices `black`, `white`, `oak`, or `none`. Hidden works and editor lock state are never published.
- `expiresAt` must be in the future and less than eleven days from the write, while the application sets it to ten days.
- Artwork image data is limited to fewer than 780,000 data-URL characters.

These are MVP validation rules, not abuse prevention. See [Production hardening](#production-hardening).

## 5. Understand the ten-day lifecycle

Every publication writes the same `expiresAt` timestamp to its gallery document and artwork documents.

At ten days:

1. Firestore rules stop public reads as soon as `expiresAt` is no longer later than the request time.
2. The Discover query excludes the record.
3. The share URL stops resolving to an accessible exhibition.
4. The scheduled GitHub Action later deletes the expired documents physically.

This separates **access expiry** from **physical cleanup**. The GitHub schedule can be delayed without exposing an expired gallery because the rules already deny it.

Do not configure a managed Firestore TTL policy for this Spark-plan setup. Firebase documents that TTL deletes require billing and do not use the free delete quota. If the project later moves to Blaze, managed TTL on `expiresAt` can replace the GitHub cleanup, but it must be configured separately for both the `galleries` and `galleryArtworks` collection groups.

## 6. Configure deployment credentials and free scheduled cleanup

`.github/workflows/cleanup.yml` runs at `03:23 UTC` each day and can also be started manually. It calls `scripts/cleanup-expired.mjs` through the Firestore REST API.

The script queries in batches of 500 artwork documents and 100 gallery documents, deleting with bounded concurrency and repeating until no expired records remain.

### Create the GitHub secret

1. Open **Firebase Console → Project settings → Service accounts**.
2. Select **Generate new private key** and download the JSON file.
3. Confirm the JSON's `project_id` is `virtualartplattform`.
4. Open the GitHub repository.
5. Go to **Settings → Secrets and variables → Actions**.
6. Select **New repository secret**.
7. Name it exactly:

   ```text
   FIREBASE_SERVICE_ACCOUNT
   ```

8. Paste the complete JSON file contents as the value and save.
9. Delete the downloaded local JSON after the secret has been stored safely.
10. Open **Actions → Deploy to GitHub Pages → Run workflow** and confirm the Firestore deployment job is green.
11. Open **Actions → Clean up expired galleries → Run workflow**.
12. Confirm the cleanup log ends with a deletion count rather than an authentication or permission error.

Never commit, screenshot, paste into chat, or email the service-account JSON. Firebase CLI logs can also contain authentication session data; keep `firebase-debug.log` files out of Git.

### Service-account safety

- Never grant the cleanup identity an Owner role.
- Reduce its IAM permissions to the minimum Firestore read/delete access needed by cleanup plus `roles/firebaserules.admin` and `roles/datastore.indexAdmin` needed by deployment.
- Rotate the key immediately if it may have been exposed, and remove unused keys in Google Cloud IAM.
- For a longer-lived production deployment, replace the JSON key with [GitHub OpenID Connect and Google Workload Identity Federation](https://github.com/google-github-actions/auth#workload-identity-federation).
- Confirm the secret belongs to the intended Firebase project before every migration or repository copy; the cleanup script uses the project ID inside that secret.

GitHub schedules are best-effort maintenance. Monitor the Action periodically and run it manually after extended repository inactivity.

## 7. Firestore data model

### `galleries/{galleryId}`

Stores exhibition metadata and layout:

- title and artist
- template, materials, ceiling, and lighting
- artwork metadata and placement, with image `src` removed
- decorative object placement
- small cover image
- anonymous `ownerId`
- `publishedAt`, `expiresAt`, and `schemaVersion`

### `galleryArtworks/{assetId}`

Stores one compressed artwork data URL plus:

- parent gallery ID
- anonymous owner ID
- artwork index
- publication and expiry timestamps
- schema version

This split keeps the gallery document below Firestore's 1 MiB document limit. It is still a demo-oriented storage strategy: a production service should use purpose-built object storage, moderation, signed delivery, and lifecycle controls.

## 8. Verify the complete setup

After rules, indexes, and Authentication are ready:

1. Run the app locally with `npm ci` and `npm run dev`.
2. Upload one small test image and publish a gallery.
3. Confirm an anonymous user appears under **Authentication → Users**.
4. Confirm one `galleries` document and its `galleryArtworks` documents appear in Firestore.
5. Open the generated share link in a private browser window.
6. Return to the home page and confirm the gallery appears in Discover.
7. From the original browser, test manual deletion.
8. Run the cleanup Action manually and confirm it authenticates successfully, even if it deletes zero documents.

Do not change a live record's expiry casually when testing. The deployed rules disable client updates, and server-side changes can make a gallery immediately inaccessible.

## 9. Troubleshooting

### `auth/unauthorized-domain`

Add the current hostname under **Authentication → Settings → Authorized domains**. For GitHub Pages, authorize `bbyw2hrnf6-boop.github.io`, not the repository path.

### `Missing or insufficient permissions`

- First distinguish **local draft save** from **publication**: drafts save to IndexedDB without Firebase. This message comes from the public Firestore publication step; the editable room remains in the browser.
- Confirm Anonymous Authentication is enabled.
- Confirm `firestore.rules` was deployed to the same project used by `src/services/firebase.ts`.
- Confirm the current rules include the optional artwork `frame` field. An older deployed rule set rejects framed exhibitions even if the web app is current.
- Confirm the gallery payload remains within the 8/8/14 artwork and eight-object limits.
- Confirm the artwork data URL is below 780,000 characters.

The GitHub Pages workflow deploys the matching rules and indexes before the web bundle. Confirm its **Deploy Firestore rules and indexes** job is green. For a manual recovery deploy, an authenticated project owner can run:

```bash
npx firebase-tools@latest login
npx firebase-tools@latest projects:list
npx firebase-tools@latest deploy --only firestore:rules,firestore:indexes --project virtualartplattform
```

Then publish a new one-artwork room and open its share link in a private window. Do not loosen the rules to `allow write: if true`; that would remove ownership and payload protection.

### Discover query fails or requests an index

Deploy `firestore.indexes.json` and ensure `expiresAt` still has its normal ascending/descending single-field index.

### Cleanup reports invalid credentials

Recreate `FIREBASE_SERVICE_ACCOUNT` as the complete JSON object. Do not wrap it in extra quotes or store only the private-key field.

### Cleanup reports permission denied

Confirm the service account belongs to the correct project and has sufficient Firestore IAM permissions. Server credentials bypass client Security Rules and are governed by Google Cloud IAM.

### Spark quota is exhausted

On the Spark plan, requests that exceed the available quota fail until quota is available again. Review usage in Firebase/Google Cloud, remove unintended public write access, and do not solve abuse simply by enabling billing.

## 10. Current quotas and limits

As documented by Firebase at the time this guide was updated, the single free Firestore database includes:

- 1 GiB stored data
- 50,000 document reads per day
- 20,000 document writes per day
- 20,000 document deletes per day
- 10 GiB outbound transfer per month

Always check [Firestore usage and limits](https://firebase.google.com/docs/firestore/quotas) and [Firestore pricing](https://firebase.google.com/docs/firestore/pricing) for current values.

AURA-specific limits:

- White Cube: eight artworks
- Nocturne: eight artworks
- Grand Forum: fourteen artworks
- Eight decorative object placements per published gallery
- Artwork resized to at most 1200 px on the longest side
- Same-origin fast-sandbox artwork embedded before publication
- Artwork data URL shorter than 780,000 characters
- Ten-day public availability

This Firestore image approach is suitable for concept validation, not high-traffic production.

## Production hardening

Before enabling unrestricted public publishing:

- Enable and enforce Firebase App Check.
- Add rules-emulator tests for ownership, expiry, schema validation, query constraints, and payload limits.
- Add cross-document ownership/linkage checks or move publication behind a trusted backend.
- Add rate limiting, moderation, content validation, and abuse monitoring through a trusted backend.
- Replace anonymous-only ownership with artist accounts and a recovery path.
- Move original media to purpose-built object storage with safe upload and lifecycle rules.
- Add monitoring, budget alerts, incident response, and tested backup/export procedures.
- Replace long-lived service-account JSON with Workload Identity Federation.
