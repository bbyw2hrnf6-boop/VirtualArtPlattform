# Firebase setup for AURA — Spark plan

The app deliberately does not use Firebase Storage. Compressed WebP artwork files are stored as separate Firestore documents so the MVP can remain on the no-cost Spark plan.

## Required

1. Authentication → Sign-in method → enable **Anonymous**.
2. Authentication → Settings → Authorized domains → add `bbyw2hrnf6-boop.github.io` and `localhost`.
3. Create the default Cloud Firestore database.
4. Firestore → Rules → paste and publish `firestore.rules`.
5. Deploy `firestore.indexes.json` with the Firebase CLI, or create single-field index exemptions for the large fields listed in that file.

```bash
npx firebase-tools@latest login
npx firebase-tools@latest deploy --only firestore:rules,firestore:indexes
```

Do not enable Cloud Storage and do not create a paid Firestore TTL policy for this Spark-plan version.

## Free daily cleanup through GitHub Actions

The app stops displaying and opening each gallery exactly ten days after publication. `.github/workflows/cleanup.yml` additionally deletes expired gallery and artwork documents once per day.

Create the required GitHub secret:

1. Firebase Console → Project settings → Service accounts.
2. Select **Generate new private key** and download the JSON file.
3. Do not commit the JSON file and do not send it through chat or email.
4. GitHub repository → Settings → Secrets and variables → Actions.
5. New repository secret.
6. Name: `FIREBASE_SERVICE_ACCOUNT`.
7. Value: paste the entire JSON file contents.
8. Save, then run Actions → Clean up expired galleries → Run workflow once to verify it.

## MVP limits

- Firestore limits each document to 1 MiB, so artwork is resized to at most 1200 px and compressed below approximately 780 KB.
- Maximum eight artworks per gallery.
- Firestore's Spark allowance currently includes 1 GiB stored data, 50,000 reads/day, 20,000 writes/day, and 10 GiB outbound transfer/month.
- If those limits are exceeded, Firebase pauses that product until the quota resets or the project moves to Blaze.
- This Firestore image approach is suitable for concept validation, not a high-traffic production marketplace.
