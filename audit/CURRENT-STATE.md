# LIEUVA current boundary

Use `git status`, `git log`, the GitHub workflow and `/release.json` for the actual checked-out or live revision. This file records active product boundaries and open work; it is not a release diary.

## Product now

LIEUVA provides the landing story, Explore, Creator Hub/profiles, account/access management, three-template Studio, local drafts and recovery, artwork/room editing, Arrange, Walk Preview, publication review, canonical Space sharing and the Danny reference exhibition.

Studio remains the product authoring boundary. Its templates are White Cube, Warm Gallery (`nocturne`) and Grand Forum (`pavilion`). Obsidian, Sculpture Pavilion and Forest Fold House are separate, read-only bespoke showcases: they share visitor controls and non-WebGL image fallbacks, but do not create Studio templates, Firebase publications or schema migrations.

All three bespoke showcases offer guided visits. Obsidian and Sculpture open with skippable 26/28-second flights; Forest offers a 38-second flight through real entries and stairs. The homepage links directly to the opt-in 48-second three-world film/scroll with matched painting/door portals. Its next world warms in advance, avoiding a loading pause at normal portal cuts; at most two film contexts are mounted. Reduced motion uses free Walk and static chapters. See [showcase direction](../src/features/showcase/README.md) for camera ownership, loading and qualification boundaries.

Legacy AURA/gallery identifiers and existing publication identities remain compatible. `/spaces/{galleryId}` delivers the same existing identity; it never permits cosmetic renaming of collections, paths, keys, callable parameters, routes or GLB metadata.

## Non-negotiable quality and release boundary

- Preserve drafts, recovery, undo/redo, placement validation, reduced motion, accessibility and desktop/mobile Walk behavior.
- The shared renderer, controls and PMREM environment survive editor-only interactions. Animation and automatic motion stop for reduced-motion users.
- Public assets are production input. Source Blender files, licensed originals and final masters remain retained; diagnostics and exploratory output remain ignored.
- Main CI validates a digest-checked immutable production artifact before deployment. The four expensive bespoke GPU walkthroughs are an owner-approved advisory software-renderer job only; all other functional, security, route and dependency checks remain release-blocking.
- The detailed showcase release allowance is 320 MiB and 5,000 files. This is a reviewed delivery ceiling, not permission to reduce visual quality or silently raise other budgets.

## External evidence still needed

The controlled pilot needs physical iOS Safari and Android Chrome qualification for upload, recovery, Walk, reduced motion, memory and touch comfort; deployed rule/index parity; live authenticated visibility/access checks with cleanup; operational App Check, mail, moderation and abuse handling; legal/operator approval; and production monitoring, search-console and rollback exercises.

Two known production cleanup items remain operator-owned: explicitly demote or remove the indexed QA Space `lieuva-sample-collection-pavilion-test-dad82647f0d041b8` and Creator handle `skippertestadmin`; reduce the existing Gen2 principal's project-level `roles/editor` under the procedure in `FIREBASE_SETUP.md`. Local changes do not alter live data or IAM.

## Priorities

1. Run the physical-device gate before claiming mobile performance.
2. Keep mobile orientation and artwork access ahead of additional cinematic or generative work; see [mobile direction](./MOBILE-EXPERIENCE-AND-AI-DIRECTION.md).
3. Do not add remote AI without consent, data preview, retention/cost controls, proposal review and deterministic validation.
4. Decompose dense app, renderer and Functions modules behind characterization tests.
5. Keep public assets referenced and generated outputs out of Git.
