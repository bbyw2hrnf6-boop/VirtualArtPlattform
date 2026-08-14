# Firebase setup for AURA — Firestore + Storage MVP

AURA uses Anonymous, Email/Password, and Google Authentication; Firestore for room metadata and access roles; and Firebase Storage for artwork images and room covers. Firebase requires the Blaze pay-as-you-go plan for Storage access as of 3 February 2026. No-cost quotas still apply, but configure billing alerts.

## Services

| Service | Purpose |
| --- | --- |
| Authentication | Guest identity plus Email/Password and Google accounts |
| Firestore | Gallery metadata, layout, visibility, ACL, Discover, expiry |
| Storage | Compressed artwork images and covers |
| GitHub Action | Physical cleanup after expiry |

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
   - `bbyw2hrnf6-boop.github.io`
   - any future custom domain

### Branded account email and AURA Preview Letter

The web app now requests a branded verification email from trusted Cloud
Functions. Newsletter consent is separate, optional, unchecked by default, and
stored server-side. One welcome edition is queued only on the first opt-in per
account. Client code cannot write email jobs or consent records.

Before deployment, choose a transactional email provider with SMTP support
(for example Postmark, Mailgun, SendGrid, or another provider you control),
verify the sending domain, and create a real sender address such as
`hello@your-aura-domain.example`. Do not use a personal mailbox password.

1. Install the official **Trigger Email from Firestore** extension:

   ```bash
   npx firebase-tools@latest ext:install firebase/firestore-send-email \
     --project virtualartplattform
   ```

2. During extension setup use:
   - Firestore collection: `mail`
   - SMTP connection URI: the provider's TLS SMTP URI
   - Default from address: a verified AURA sender
   - Default reply-to: the public support address
   - Users/templates collection: leave blank unless the extension explicitly requires a value
3. Deploy the repository's Cloud Functions:

   ```bash
   npx firebase-tools@latest deploy --only functions \
     --project virtualartplattform
   ```

4. Supply these prompted parameters with real public information:
   - `AURA_PUBLIC_APP_URL`: `https://bbyw2hrnf6-boop.github.io/VirtualArtPlattform`
   - `AURA_REPLY_TO`: the monitored support email
   - `AURA_LEGAL_FOOTER`: legal sender name and full postal address
5. In **Authentication → Templates → Email address verification**, set the
   custom action URL to:
   `https://bbyw2hrnf6-boop.github.io/VirtualArtPlattform/`
   Firebase appends `mode`, `oobCode`, and continuation parameters. The AURA
   route verifies the code and returns the visitor to the product.
6. Set the fallback Firebase sender name to **AURA**, use the same reply-to,
   and update the public-facing project name. The fallback is used only while
   the branded function is unavailable.
7. Publish the repository's current `firestore.rules` manually. No Storage-rule
   change is needed for email delivery.

The branded functions use the Admin SDK to create Firebase action links. Do
not call the Firestore `mail` collection from the browser. Marketing consent
must remain optional. Before sending recurring campaigns, replace the preview
data notice with final operator details, privacy policy, imprint/terms where
required, and obtain legal review for each target country.

Live email acceptance test:

1. Create a new Email/Password test account without ticking the letter box.
   Confirm exactly one branded verification email and no welcome letter.
2. Open the verification link and confirm the AURA result page completes the
   action and returns to the account.
3. Create another test account with the checkbox ticked. Confirm one
   verification email and one AURA Preview Letter.
4. Sign out and in again with the same account. Confirm no second welcome
   edition is sent.
5. Use the one-click unsubscribe link and confirm the Profile & settings toggle
   is off after reloading the account.
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

## 4. Publish rules manually

Firestore:

1. Open **Firestore Database → Rules**.
2. Replace everything with the repository's `firestore.rules`.
3. Select **Publish**.

Storage:

1. Open **Storage → Rules**.
2. Replace everything with the repository's `storage.rules`.
3. Select **Publish**.

Indexes:

1. Open **Firestore Database → Indexes → Composite**.
2. Create `galleries`: `visibility` ascending, `expiresAt` descending.
3. Create `galleries`: `schemaVersion` ascending, `expiresAt` descending.
4. Create `galleries`: `ownerId` ascending, `expiresAt` descending.
5. Deploy the collection-group `members.email` index from `firestore.indexes.json`; it lets invited Editors and Viewers find shared rooms in Account.
6. Wait until all indexes show **Enabled**. The exact repository set can be deployed without rules or data changes:

   ```bash
   npx firebase-tools@latest deploy --only firestore:indexes --project virtualartplattform
   ```

Storage rules read the matching Firestore gallery and ACL before returning an
image. The first Firebase Console publish may ask to enable cross-service
permissions; accept that prompt for this project.

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

- Upload requires Firebase Authentication and an owner-scoped path. New-room uploads require the owner; revision uploads also allow a current Editor.
- Storage objects remain immutable. Live edits create a new asset revision and atomically move the existing gallery manifest to it.
- Covers are below 1 MiB; artworks below 2 MiB.
- Only supported image MIME types are accepted.
- Guests can create only public ten-day publications.
- Verified accounts can create public, unlisted, or private account-preview rooms.
- Unlisted rooms are readable by direct link but omitted from Discover.
- Private room metadata and images require the owner or an invited verified email.
- Owner, editor, and viewer roles are stored in a gallery member subcollection; the owner is implicit.
- Owners and Editors may update content under the same gallery ID/share URL. Visibility, owner, expiry, and access settings stay unchanged during content updates. Only the owner may manage access or delete.
- White Cube and Nocturne accept up to eight works; Grand Forum accepts fourteen.
- Local drafts remain in IndexedDB and never require Firebase.

## 7. Lifecycle and cleanup

At each room's `expiresAt`, Firestore and Storage rules stop reads. `.github/workflows/cleanup.yml` later deletes Storage objects first, then ACL records, the gallery manifest, and any legacy artwork documents.

The `FIREBASE_SERVICE_ACCOUNT` GitHub secret needs minimum Firestore read/delete and Storage object-delete permission. Never grant Owner. Prefer Workload Identity Federation for a production deployment.

Do not enable Firestore TTL as a replacement without redesigning cleanup: Firestore TTL cannot remove related Storage objects.

## 8. Live verification

1. Deploy the web app after publishing both rule files.
2. Create a room with one small image and publish it.
3. Confirm an anonymous user under **Authentication → Users**.
4. Confirm one schema-v3 document under `galleries`.
5. Confirm `cover.webp` and `artworks/1.webp` under `published/{uid}/{galleryId}` in Storage.
6. Copy the share URL and open it in Chrome incognito and Safari private mode.
7. Confirm the room appears in Discover and all images load.
8. Test owner deletion from the original browser.
9. Create and verify an Email/Password account; then repeat with Google.
10. Publish one unlisted and one private room. Confirm unlisted is absent from Discover.
11. Invite a second verified email as Viewer, confirm it can enter the private room, and confirm an uninvited account cannot.
12. Run **GitHub Actions → Clean up expired galleries → Run workflow** and confirm zero or more successful deletions.
13. Open one owned room from Account, edit and update it, and confirm the original share URL now shows the revision.
14. Invite a second account as Editor and confirm it can update that same room but cannot manage access or delete it. Confirm a Viewer cannot edit.

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
