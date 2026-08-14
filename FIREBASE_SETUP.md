# Firebase setup for AURA — Firestore + Storage MVP

AURA uses Anonymous Authentication, Firestore for gallery metadata, and Firebase Storage for artwork images and room covers. Firebase requires the Blaze pay-as-you-go plan for Storage access as of 3 February 2026. No-cost quotas still apply, but configure billing alerts.

## Services

| Service | Purpose |
| --- | --- |
| Authentication | Invisible anonymous publisher identity |
| Firestore | Gallery metadata, layout, Discover, expiry |
| Storage | Compressed artwork images and covers |
| GitHub Action | Physical cleanup after expiry |

New publications use schema v2. Existing schema-v1 galleries and `galleryArtworks` documents remain readable; new rooms do not create them.

## 1. Confirm the project

The app targets project `virtualartplattform` and bucket `virtualartplattform.firebasestorage.app`. Firebase web configuration is public client configuration. Never commit or paste a service-account key.

## 2. Authentication

1. Open **Firebase Console → Authentication → Sign-in method**.
2. Enable **Anonymous**.
3. Under **Authentication → Settings → Authorized domains**, add:
   - `localhost`
   - `bbyw2hrnf6-boop.github.io`
   - any future custom domain

## 3. Blaze and Storage bucket

1. Open **Usage and billing → Details & settings**.
2. Select **Modify plan → Blaze** and connect a Google Cloud billing account.
3. Create Google Cloud budget alerts, for example 1 €, 5 €, and 20 €. Alerts do not hard-stop spending.
4. Return to Firebase Console and open **Storage**.
5. Select **Get started**.
6. Create the default bucket `virtualartplattform.firebasestorage.app`.
7. Choose the same or nearest compatible location as Firestore. This location is difficult to change later.
8. Start with production rules. Never use public test-mode rules.

## 4. Publish rules manually

Firestore:

1. Open **Firestore Database → Rules**.
2. Replace everything with the repository's `firestore.rules`.
3. Select **Publish**.

Storage:

1. Open **Storage → Rules**.
2. Replace everything with the repository's `storage.rules`.
3. Select **Publish**.

The GitHub Pages workflow intentionally does not deploy Firebase rules. If you later choose the CLI:

```bash
npx firebase-tools@latest login
npx firebase-tools@latest deploy --only firestore:rules,firestore:indexes,storage --project virtualartplattform
```

## 5. Apply CORS once

The app reads Storage files as bounded blobs so Safari can release memory predictably. From the repository root:

```bash
gcloud auth login
gcloud config set project virtualartplattform
gcloud storage buckets update gs://virtualartplattform.firebasestorage.app \
  --cors-file=storage.cors.json
```

Add any future custom origin to `storage.cors.json`, then rerun the last command.

## 6. Security contract

- Upload requires Firebase Authentication and an owner-scoped path.
- New objects are immutable.
- Covers are below 1 MiB; artworks below 2 MiB.
- Only supported image MIME types are accepted.
- Public reads end after the ten-day expiry stored in object metadata.
- Firestore publications are immutable; only the owner may delete.
- White Cube and Nocturne accept up to eight works; Grand Forum accepts fourteen.
- Local drafts remain in IndexedDB and never require Firebase.

## 7. Lifecycle and cleanup

At ten days, Firestore and Storage rules stop public reads. `.github/workflows/cleanup.yml` later deletes Storage objects first, then the gallery manifest and any legacy artwork documents.

The `FIREBASE_SERVICE_ACCOUNT` GitHub secret needs minimum Firestore read/delete and Storage object-delete permission. Never grant Owner. Prefer Workload Identity Federation for a production deployment.

Do not enable Firestore TTL as a replacement without redesigning cleanup: Firestore TTL cannot remove related Storage objects.

## 8. Live verification

1. Deploy the web app after publishing both rule files.
2. Create a room with one small image and publish it.
3. Confirm an anonymous user under **Authentication → Users**.
4. Confirm one schema-v2 document under `galleries`.
5. Confirm `cover.webp` and `artworks/1.webp` under `published/{uid}/{galleryId}` in Storage.
6. Copy the share URL and open it in Chrome incognito and Safari private mode.
7. Confirm the room appears in Discover and all images load.
8. Test owner deletion from the original browser.
9. Run **GitHub Actions → Clean up expired galleries → Run workflow** and confirm zero or more successful deletions.

## Optional: migrate still-active legacy rooms

New rooms need no migration. To move old schema-v1 artwork Data URLs out of Firestore, first export/backup Firestore, then run the guarded script manually:

```bash
FIREBASE_SERVICE_ACCOUNT='{"...":"complete service account JSON"}' \
FIREBASE_STORAGE_BUCKET='virtualartplattform.firebasestorage.app' \
node scripts/migrate-gallery-assets-to-storage.mjs --execute
```

Without `--execute`, the script exits before any network request. Review credentials, project and backup first. The script keeps legacy artwork documents until their normal scheduled expiry cleanup, providing a rollback window. Do not place the service-account JSON in a shell-history file or commit it.

## 9. Troubleshooting

- `storage/unauthorized`: publish current `storage.rules`; confirm the authenticated UID matches the object path.
- `storage/bucket-not-found`: confirm Blaze and the exact default bucket name.
- CORS error: apply `storage.cors.json` and include the current origin.
- `firestore/permission-denied`: publish current `firestore.rules` to the same project.
- `auth/unauthorized-domain`: add the hostname under Authorized domains.
- Share link has metadata but missing images: verify Storage rules, CORS, object expiry metadata, and object paths.

Official references: [Storage web setup](https://firebase.google.com/docs/storage/web/start), [Storage rules](https://firebase.google.com/docs/storage/security), [billing requirement](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024), [Anonymous Auth](https://firebase.google.com/docs/auth/web/anonymous-auth).
