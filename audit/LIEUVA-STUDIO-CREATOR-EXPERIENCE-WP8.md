# LIEUVA Studio Creator Experience — Work Package 8

Date: 2026-08-25  
Scope: premium Studio creator experience, mobile authoring, upload feedback, selection/editing clarity, Arrange/Walk continuity, accessibility and privacy-safe creator telemetry.  
Environment: local Vite implementation at `http://127.0.0.1:5174/`; no deploy, commit, push, Firebase mutation or DNS change was performed.

## 1. Verdict

**PASS WITH CONDITIONS**

LIEUVA Studio remains one shared authoring architecture and now presents that architecture more deliberately on compact screens. Mobile opens with a 64 px contextual tool peek instead of covering almost half of the room, the 3D canvas remains dominant, authoring actions remain available inside the same tool panel, selection has a clear completion action, Walk Preview restores the exact prior panel state, save scope is clearer, and artwork preparation has progress and recoverable failure feedback. All repository, Functions and release-gate suites pass and all performance budgets remain green.

The conditions are real-device checks at the exact 360×800 and 430×932 targets, OS-level reduced-motion verification, and a production upload/telemetry smoke test after a later authorized deployment.

## 2. Inputs and invariants

Implemented against:

- `AGENTS.md`
- `README.md`
- `audit/REPOSITORY-PRODUCT-BASELINE.md`
- `audit/FULL-PRODUCT-EXPERIENCE-AUDIT.md`
- `audit/LIEUVA-BRAND-CONTRACT.md`
- `audit/PUBLISH-UPDATE-RELEASE-GATE.md`
- `audit/LIEUVA-LANDING-CONVERSION-WP7.md`
- the actual current implementation

Preserved invariants:

- the existing `Studio` in `src/App.tsx` remains the single authoring surface;
- `GalleryScene` remains the shared renderer for Studio and the published experience;
- no parallel mobile draft, upload, selection, renderer, camera, Walk or publish system was created;
- existing draft recovery, history, Firebase repository, Storage compatibility, publication IDs, share URLs and ACL behavior remain unchanged;
- existing AURA technical identifiers remain unchanged;
- E remains look-down and R remains unbound for that action;
- no creator feature or rendering quality was removed to improve responsiveness or performance.

## 3. Architecture baseline

Confirmed before implementation:

- Studio state and workflow are owned by `Studio` in `src/App.tsx`.
- Draft undo/redo is centralized in `src/features/gallery/editor/useDraftHistory.ts`.
- draft persistence and recovery use `src/services/draftStorage.ts`.
- publish/update uses the existing state and repository path through `src/features/gallery/editor/publishState.ts` and `src/services/firebaseGalleryRepository.ts`.
- the renderer and shared interaction modes are in `src/features/gallery/GalleryScene.tsx`.
- visitor controls are shared through `src/features/gallery/VisitorControls.tsx`.
- keyboard behavior and hints are centralized in `src/features/gallery/visitorKeyboard.ts`.
- compact-layout detection is centralized in `src/utils/mobileLayout.ts`.
- privacy-safe telemetry uses `src/services/telemetry.ts` and the matching Functions allowlist in `functions/src/observability.ts`.

Architectural conclusion:

The current abstractions already support the required creator experience. The smallest coherent solution was adaptive presentation and state feedback inside the existing Studio, not a redesign or a second mobile editor.

## 4. Baseline usability findings

### Mobile obstruction

At 390×844 the tool panel initially opened at half height, covering roughly 46% of the viewport before the creator had selected anything. The room was present but did not feel like the primary workspace.

### Header compression

Undo, redo and AI curation competed with Account and Review & Publish inside the compact header. The actions remained technically available, but the hierarchy was weak and labels compressed quickly.

### Selection completion

Artwork and object inspectors exposed precise editing controls, but did not provide an explicit mobile completion action. Returning from detailed editing depended on understanding the panel rather than a clear `Done` action.

### Save meaning

The save indicator described state but not scope. A creator editing an already published Space could not immediately distinguish local draft work from live-revision work.

### Upload feedback

Artwork preparation exposed a generic busy message. Multi-file preparation did not show progress, and the creator funnel did not distinguish placement from upload completion or upload failure.

### Layout contract mismatch

JavaScript treated all viewports up to 900 px as compact, while the relevant CSS required both a narrow viewport and a coarse pointer. Narrow browsers, tablets with a fine pointer and some hybrid devices could therefore enter compact state without compact presentation.

## 5. Implemented adaptive Studio

### One Studio, adaptive presentation

`Studio` still owns the same draft, history, selection, upload, Arrange, Walk, publish and recovery state. Only presentation and missing feedback were extended.

Compact Studio now:

- starts in `peek` rather than `half`;
- exposes a 64 px contextual handle over the bottom safe area;
- expands to the existing half/full panel states on demand;
- uses the same underlying sections and callbacks as desktop;
- keeps the 3D room visible while no detailed edit is active;
- aligns the CSS compact breakpoint with `usesCompactInteractionLayout()`.

Desktop retains the persistent 300 px authoring panel and the full header action set.

## 6. Mobile hierarchy and controls

At compact widths:

- the header retains brand, save state, Account and Review & Publish;
- Undo, Redo and Curate with AI move into a `Studio actions` region in the existing tool panel;
- the same callbacks and disabled states are reused—there is no duplicate history or curation logic;
- Account retains a readable label when signed out;
- touch targets for new controls are at least 44 px high;
- tool and visitor controls use a quieter dark surface so artwork and room remain visually dominant;
- safe-area padding remains active.

The tool handle is contextual:

- `Add & customize` with no active selection;
- `Artwork · {title}` for artwork;
- `Object · {type}` for decor.

Long labels truncate safely without causing horizontal overflow.

## 7. Selection and inspector clarity

Artwork and decor selection continue to use the existing draft IDs and placement controls.

Added:

- stronger selected-row treatment in the existing lists;
- `Done editing artwork` and `Done editing object` actions;
- one shared close-selection callback that clears selection notices/errors;
- automatic return to the compact peek state after completing an edit.

Browser evidence at 390×844:

- selecting `Cliff Study` changed the handle to `Artwork · Cliff Study`;
- the selected item remained pressed and visibly highlighted;
- the completion target measured 337×44 px;
- completing the edit cleared selection and returned the panel to `peek`.

## 8. Arrange and Walk continuity

The existing `GalleryScene` and shared Walk controls remain unchanged.

The compact transition now records the exact prior sheet state, including `peek`. It no longer changes a prior peek state into half on return.

Verified sequence:

1. open the panel to `half`;
2. enter Walk Preview;
3. authoring panel collapses out of the active interface;
4. shared visitor controls appear;
5. return to Arrange;
6. the tool panel returns to the exact prior `half` state.

The Walk accessibility tree presents `Drag to look · Tap floor to walk · Pinch to zoom` on the compact viewport. It does not expose a mobile WASD instruction.

## 9. Save and live-edit clarity

The existing autosave/recovery implementation is unchanged.

The header status now has two semantic parts:

- scope: `Draft` or `Live edits`;
- state: `Checking…`, `Saving…`, `Saved`, `Save issue` or `Ready`.

Compact presentation hides the scope label when space is extremely constrained but preserves the complete live-region semantics. Desktop shows both scope and state.

No publish/update state, revision behavior, publication linkage, draft key or recovery key was changed.

## 10. Artwork preparation and failure recovery

The existing image preparation and placement path remains in use.

Added:

- per-file progress state (`Preparing n of total`);
- a native progress element;
- explicit success, partial-success and failure telemetry outcomes;
- a top-level preparation failure message that states the existing Project remains unchanged;
- progress cleanup in the existing `finally` path.

An unsuccessful preparation does not clear existing artworks or draft state. Existing JPG/PNG/WebP normalization and Storage-backed media compatibility remain protected by the release-gate suite.

## 11. Controls and accessibility

- E is the centralized look-down binding in `src/features/gallery/visitorKeyboard.ts`.
- R is not bound to look-down.
- keyboard controls remain scoped to the focused 3D application.
- native buttons, field labels, pressed states, status regions and dialog semantics were retained.
- new mobile actions use labelled regions and grouped history controls.
- upload progress has an explicit accessible label.
- the publish review remained fully reachable and closable at 390×844.
- global reduced-motion CSS and the existing `GalleryScene` runtime `matchMedia('(prefers-reduced-motion: reduce)')` branches remain intact.

The connected browser harness could not change OS media preferences, so reduced-motion behavior was verified through the actual CSS/runtime contract. A physical OS-level pass remains required.

## 12. Privacy-safe creator telemetry

The existing consent-gated telemetry boundary was extended with:

- `artwork_upload_failed`
- `artwork_placed`
- `walk_preview_exited`

The events accept low-cardinality template, source, count, outcome and reason properties. Artwork title/content supplied to the client boundary is removed by the existing property sanitizer.

Regression evidence confirms:

- `artwork_placed` and `walk_preview_exited` pass the client and server allowlists;
- a supplied private artwork title is not emitted;
- no account ID, Space ID, media URL or artwork content was added to these events.

## 13. Browser QA

### Desktop — 1280×720 connected browser

- header: 68 px;
- authoring panel: 300×652 px;
- interactive 3D area: 965×652 px;
- no horizontal overflow;
- project details, upload, materials, Arrange, Walk Preview and publish actions remained present;
- White Cube, Nocturne and Grand Forum all reached `3D Space ready` using the same Studio application;
- no browser console errors or warnings.

### Mobile — 390×844 connected browser

- header: 64 px;
- initial tool peek: 64 px;
- unobstructed 3D height above the peek: 716 px, approximately 85% of the full viewport;
- interactive scene canvas: 390×780 px behind the adaptive overlay;
- half panel: approximately 388 px / 46% viewport height when explicitly opened;
- no horizontal overflow;
- Account and Review & Publish remained reachable;
- selecting, editing and completing an artwork passed;
- Walk Preview and return-to-Arrange state restoration passed;
- publish review opened, showed the account gate and closed without a stuck modal;
- no browser console errors or warnings.

### 360×800 and 430×932

The implementation uses the same width-based compact contract for both targets, has no fixed mobile minimum width, preserves safe-area padding and passed the 390 px boundary with zero overflow. The connected browser harness exposed fixed 390×844 and 1280×720 canvases and could not provide the two additional exact viewport sizes. Exact visual checks at 360×800 and 430×932 therefore remain a stated real-device condition rather than an inferred pass.

## 14. Visual refinement passes

### Pass 1 — hierarchy

- made the room the initial mobile focus;
- moved secondary creator actions into the existing tool surface;
- clarified Draft versus Live edits;
- added contextual selection and upload feedback.

### Pass 2 — browser refinement

- aligned JavaScript and CSS compact breakpoints after reproducing their mismatch;
- reduced the peek to 64 px;
- refined panel gradients, borders, shadows and selected states;
- tightened header/account behavior without reducing action targets;
- verified the resolved mobile and desktop compositions after the adjustment.

## 15. Performance and verification

All commands ran from `/Users/uhorizon/Documents/VirtualArtPlattform`.

### Baseline before WP8

- total JS gzip: 523,020 / 550,000 bytes
- total CSS gzip: 31,453 / 35,000 bytes
- largest lazy JS gzip: 180,266 / 195,000 bytes
- entry JS gzip: 105,857 / 120,000 bytes

### Final

- `npm run check`: PASS — 33 test files, 225 tests, lint, TypeScript, production build and budgets
- `npm run check:functions`: PASS — 5 test files, 36 tests and TypeScript build
- `npm run test:release-gate`: PASS — 8 test files, 71 tests
- `npm run check:performance`: PASS
- `git diff --check`: PASS

Final budgets:

- total JS gzip: 523,476 / 550,000 bytes (+456)
- total CSS gzip: 31,926 / 35,000 bytes (+473)
- largest lazy JS gzip: 180,266 / 195,000 bytes (+0)
- entry JS gzip: 106,310 / 120,000 bytes (+453)

All performance budgets remain green. The shared `GalleryScene` lazy chunk did not increase.

## 16. Files changed

- `src/App.tsx`
- `src/styles/mobileExperience.css`
- `src/services/telemetry.ts`
- `src/services/telemetry.test.ts`
- `functions/src/observability.ts`
- `functions/src/observability.test.ts`
- `audit/LIEUVA-STUDIO-CREATOR-EXPERIENCE-WP8.md`

## 17. Remaining conditions and risks

1. Run exact visual/touch QA on iOS Safari and Android Chrome at 360×800, 390×844 and 430×932.
2. Verify OS-level reduced motion and dynamic preference changes on a physical device.
3. Run a production smoke test with real local JPG, PNG, WebP and HEIC uploads after an authorized deployment; confirm Storage upload and recovery under a throttled connection.
4. Validate the new consented creator events in the production observability pipeline after deployment.
5. Test the signed-in `Live edits` label and revision update flow in the external Firebase environment; deterministic publish/update behavior remains covered by the release-gate suite.

## 18. Completion statement

Work Package 8 is locally complete with the stated real-device and production-environment conditions. The repository is ready for product-owner review and the external checks above. No Work Package 9 work was started.
