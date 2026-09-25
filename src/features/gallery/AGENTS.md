# Studio and visitor scope

Read this for the shared Three.js scene, Studio editor, placement, Walk or template work.

- Do not recreate the renderer, PMREM environment, controls or complete scene for selection, transform or mode changes.
- One placement validator remains authoritative for click, drag, sliders, auto-arrange, restore and publication. Reject invalid geometry transactionally.
- Preserve draft recovery, undo/redo, visible local-vs-live state, reduced motion, keyboard focus, touch access and non-WebGL artwork access.
- Public Space entry offers **Enter 3D** and **View works** as equal paths; choosing works does not create a WebGL scene. Renderer failure opens the complete directory.
- On WebGL context loss, suspend scene motion and interaction while retaining the mounted visitor runtime. Keep the directory open until a post-restore frame is confirmed; a failed recovery stays on the artwork path without an automatic retry loop.
- Movement targets must be reachable using the existing collider/navigation data. Keep Arrange and Walk session state distinct from persisted artwork data.
- Run `npm run check`; add browser smoke and desktop/mobile visual review for scene or UI behavior.
