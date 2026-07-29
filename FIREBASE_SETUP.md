# Firebase setup for AURA

Project: `virtualartplattform`

The web SDK configuration is already connected in `src/services/firebase.ts`. Firebase web API keys identify the project; access control is enforced by Authentication, Security Rules, and App Check.

## Required before publishing works

1. Upgrade the Firebase project to the **Blaze** plan. Since February 2026, Cloud Storage for Firebase requires Blaze, although no-cost quotas can still apply.
2. Open **Authentication → Sign-in method** and enable **Anonymous**.
3. Open **Authentication → Settings → Authorized domains** and add:
   - `bbyw2hrnf6-boop.github.io`
   - `localhost` for local development
4. Open **Firestore Database**, create the default database, and choose the permanent region carefully.
5. In **Firestore Database → Rules**, paste `firestore.rules` and publish it.
6. Open **Storage**, create the default bucket, then paste `storage.rules` into **Storage → Rules** and publish it.

Alternatively, after installing/authenticating the Firebase CLI, deploy both included rule files:

```bash
npx firebase-tools@latest login
npx firebase-tools@latest deploy --only firestore:rules,storage
```

## Ten-day retention

The app immediately stops listing and opening a gallery when its `expiresAt` timestamp is reached.

For automatic database cleanup, open the Google Cloud console for this project:

1. Firestore → Databases → select the default database.
2. Time-to-live → Create policy.
3. Collection group: `galleries`.
4. Timestamp field: `expiresAt`.

Firestore TTL deletion is asynchronous and can occur after the item has already disappeared from AURA. Configure a Cloud Storage lifecycle rule for the `gallery-assets/` prefix if uploaded image files must also be physically deleted after ten days.

## Recommended before public promotion

Enable Firebase App Check with reCAPTCHA Enterprise for the production GitHub Pages domain. First monitor App Check metrics, then enforce it for Authentication, Firestore, and Storage. A reCAPTCHA Enterprise site key is still needed before this can be wired into the client.

Set Google Cloud billing budgets and alerts even if expected usage stays inside no-cost quotas.
