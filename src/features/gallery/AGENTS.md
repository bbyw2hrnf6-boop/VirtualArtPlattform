# Studio and visitor scope

Read this for the shared Three.js scene, Studio editor, placement, Walk or template work.

- Do not recreate the renderer, PMREM environment, controls or complete scene for selection, transform or mode changes.
- One placement validator remains authoritative for click, drag, sliders, auto-arrange, restore and publication. Reject invalid geometry transactionally.
- Preserve draft recovery, undo/redo, visible local-vs-live state, reduced motion, keyboard focus, touch access and non-WebGL artwork access.
- Movement targets must be reachable using the existing collider/navigation data. Keep Arrange and Walk session state distinct from persisted artwork data.
- Run `npm run check`; add browser smoke and desktop/mobile visual review for scene or UI behavior.
