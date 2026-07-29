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
- `services/galleryRepository.ts` is the Firebase persistence boundary. It stores compressed artwork and gallery data in separate Firestore documents using invisible anonymous authentication, without Firebase Storage.
- `public/assets/demo/` contains the reused, optimized Danny Hirsch Blender room.
- `blender/templates/` contains exactly three editable `.blend` source blueprints; regenerate them with `blender --background --python blender/create_templates.py`.

The editor intentionally exposes only three templates, three wall finishes, three floors, three lighting modes, and four decorative objects.

## Firebase setup

See `FIREBASE_SETUP.md`. The Spark-plan setup uses Firestore only. A scheduled GitHub Action removes expired gallery and artwork documents daily without Firebase Storage or paid Firestore TTL.
