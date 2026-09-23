# Functions scope

Read this only for `functions/`, Firebase rules, or server-delivery work. The server owns publication permits, access, visibility, lifecycle, canonical delivery and administrator authority; do not recreate those decisions in the client.

- Preserve callable names, Firestore/Storage paths and request/response fields as compatibility contracts.
- Keep authorization, quotas, App Check and lifecycle decisions server-side. Never infer admin authority from email or custom claims; use the existing `siteAdmins/{uid}` registry.
- Read `FIREBASE_SETUP.md` for release/live changes. For a narrower contract, choose one file from `audit/README.md`; do not load all audit documents.
- Run `npm run check:functions` after Functions changes. Run `npm run test:firebase-rules` for rules, schema, storage or access changes. Do not deploy or alter live rules without explicit authorization.
- Generated `functions/lib/`, `functions/functions.yaml` and app-shell output are build products; edit `functions/src/` and source scripts instead.
