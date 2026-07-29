# AURA — Virtual Art Platform MVP

A lightweight React + Three.js application for creating and sharing interactive virtual exhibitions. It is a standalone project and uses hash-based routes plus relative assets, so it can be hosted from any GitHub Pages repository path.

## Run locally

```bash
npm install
npm run dev
```

## Production

```bash
npm run build
npm run preview
```

Push `main` to GitHub and enable **Settings → Pages → GitHub Actions**. The included workflow builds and deploys `dist/`.

## Architecture

- `features/gallery/` owns gallery types, blueprints, and the Three.js renderer.
- `services/galleryRepository.ts` is the Firebase persistence boundary. It uploads artwork to Storage and gallery documents to Firestore using invisible anonymous authentication.
- `public/assets/demo/` contains the reused, optimized Danny Hirsch Blender room.
- `blender/templates/` contains exactly three editable `.blend` source blueprints; regenerate them with `blender --background --python blender/create_templates.py`.

The editor intentionally exposes only three templates, three wall finishes, three floors, three lighting modes, and four decorative objects.

## Firebase setup

1. In Firebase Authentication, enable the **Anonymous** sign-in provider.
2. Create the default Cloud Firestore database.
3. Create/enable Cloud Storage for Firebase.
4. Deploy `firestore.rules` and `storage.rules` with `firebase deploy --only firestore:rules,storage` or paste them into their respective Rules tabs.
5. Add `bbyw2hrnf6-boop.github.io` to Authentication → Settings → Authorized domains.
6. In Google Cloud Firestore, create a TTL policy for collection group `galleries` and timestamp field `expiresAt`.

Gallery documents are discoverable for exactly ten days. Firestore TTL removes expired documents asynchronously; use a Cloud Storage lifecycle rule for `gallery-assets/` if the corresponding image files should also be physically deleted after ten days.
