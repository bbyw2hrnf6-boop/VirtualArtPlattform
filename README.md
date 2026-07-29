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

The editor intentionally exposes only three templates, five curated wall finishes, four floors, three ceiling finishes, three lighting modes, and four decorative objects. Decorative objects can be dragged directly in the room or moved by clicking an empty floor position; sliders remain available for precision.

## Visitor experience

Published exhibitions open with a room-specific cinematic introduction that guides the camera through architecture and artwork before settling at visitor height. Visitors can then walk with WASD or the arrow keys, drag to look around, or click a point on the floor to walk there automatically. Clicking an artwork opens its artist-supplied information card; the card closes when the visitor turns away. Walk mode uses an enclosed, fully finished room, while Overview mode provides an optional rotating presentation view.

## Firebase setup

See `FIREBASE_SETUP.md`. The Spark-plan setup uses Firestore only. A scheduled GitHub Action removes expired gallery and artwork documents daily without Firebase Storage or paid Firestore TTL.
