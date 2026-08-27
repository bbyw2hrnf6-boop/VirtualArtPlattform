# LIEUVA Premium Visitor Experience — WP14

Date: 2026-08-27

## Verdict

PASS WITH CONDITIONS. The shared procedural visitor runtime now has calmer movement, route-aware Guided Tours, consistent controls, a recoverable first-entry guide, directory-to-artwork focus, and Grand Forum overview wayfinding. DannyHirschArts remains on its authored scene/runtime, but uses the same visitor control surface. Production Firebase data was not changed and nothing was deployed.

## Architecture and invariants

- `GalleryScene` remains the single procedural renderer for White Cube, Nocturne, Grand Forum, Studio Walk Preview and published procedural Spaces.
- `DannyDemoScene` keeps its authored GLB contract and uses the shared `VisitorControls` interaction surface.
- `VisitorControls` remains the shared Walk/Overview, Guided Tour, Focus View, Reset View and Artwork Directory interface.
- `createFirstPersonWalk` remains the shared keyboard, pointer, tap-to-walk and collision controller.
- Existing Firestore, Storage, publication, ACL, route, share-ID and GLB metadata contracts are unchanged.

## Implemented work

### Walk and camera

- Reduced desktop and touch look sensitivity to remove twitchy camera movement.
- Reduced keyboard/tap travel speed and separated acceleration from braking for a more deliberate gallery pace.
- Dampened blocked movement velocity so wall contact no longer produces repeated jitter.
- Preserved canvas-scoped keyboard handling, W/A/S/D movement, arrows, Q look-up and E look-down. R remains unbound.
- Preserved click/tap floor movement, drag look, pinch/scroll zoom and Escape behavior.

### First entry and controls

- Added a session-scoped first-entry guide to published procedural Spaces.
- The guide dismisses automatically, can be closed, and remains recoverable through a permanent `Controls` action.
- Desktop instructions use the actual keyboard contract. Touch instructions never mention WASD.
- Removed the duplicate persistent Walk movement label; Overview retains its compact orbit hint.
- Mobile controls use the existing safe-area-aware bottom surface and five equal actions with 44px targets.

### Guided Tour

- Preserved one tour state model and one control surface.
- Procedural routes now expand through the existing collision pathfinder between authored/generated stops, avoiding straight-line wall cuts.
- Intermediate route points are not presented as visitor stops; progress counts only meaningful stops.
- Previous/Next operates on meaningful stops and uses a short camera transition instead of teleporting.
- Reduced Motion resolves transitions immediately.
- Manual movement still visibly pauses the running tour through the existing shared state.

### Artwork discovery and directory

- Preserved subtle click/tap artwork focus and the accessible metadata card.
- Added `View in Space` to each available directory entry.
- Directory focus closes the dialog, restores Walk, and transitions to the selected artwork using the same generated artwork pose system.
- Dialog focus trapping and return-focus behavior remain provided by `useDialogFocus`.

### Grand Forum

- Reused the existing five-zone Grand Forum camera map.
- The map is now available in published Overview as well as Studio Arrange.
- Zone changes use the existing camera animation and real floor-plan camera definitions.

### Loading and entry

- Replaced the plain published-space loading string with a branded, responsive entry poster.
- The loading surface contains status text for assistive technology and no fake progress percentage.

## Accessibility

- All visitor actions remain native buttons with names, pressed/expanded state and visible focus.
- Keyboard instructions match real bindings.
- Touch copy is device-appropriate.
- Directory remains a modal dialog with focus management and Escape/close handling.
- First-entry help is supplemental; core controls remain usable after it disappears.
- Reduced Motion is respected for mode, artwork and tour transitions.

## Verification

- `npm run lint`: PASS.
- Root Vitest: PASS — 45 files, 272 tests.
- Production TypeScript/Vite build: PASS.
- Functions Vitest: PASS — 6 files, 45 tests.
- Functions TypeScript build: PASS.
- Added regression coverage for the shared action inventory, E/Q keyboard copy and touch-only copy.
- Existing keyboard regression confirms E looks down and R is unbound.

## Performance

- No new renderer, scene, loader or duplicate control architecture was introduced.
- Route generation reuses the already-created collision pathfinder and only runs when a tour/focus pose set is requested.
- No renderer/scene duplication was introduced. JS budgets pass; CSS remains within the existing warning-only policy and is reported by the final build.

## Remaining conditions and risks

- DannyHirschArts keeps authored tour poses and a separate authored rendering runtime by design; visual parity still depends on its GLB and metadata.
- Real-device iOS Safari and Android Chrome tactile testing remains an external condition.
- Production telemetry validation requires deployment and consented real traffic; no production deployment was authorized.
- Full production-space testing depends on authenticated/private production fixtures and was intentionally not performed here.
- Localhost public-Space QA exposed an external Firebase Storage `storage/retry-limit-exceeded` response for legacy sample images. The visitor fallback remained usable and the error did not originate in the new controls; production Storage/CORS verification remains required.

## Browser QA

- PASS at 1920x1080, 1440x1000, 390x844 and 360x800.
- White Cube, Nocturne and Grand Forum Studio scenes rendered with no horizontal overflow; mobile canvases retained the available viewport beneath the 64px header.
- Shared Walk Preview controls, touch-only guidance, 44px controls, Guided Tour start/pause/step/skip and recovery of the Controls guide were verified.
- A clean published White Cube URL loaded with the branded entry, shared controls and no initial console warning. Artwork Directory opened, returned focus, and `View in Space` closed the dialog and restored the Walk surface.
- Published Grand Forum loaded, changed to Overview, exposed five named camera zones, and preserved the shared control surface.
- The two localhost Storage retries for legacy sample images produced the existing accessible image fallback and are recorded above as external verification.

## WP14 completion

WP14 is complete locally. The repository is ready for WP15, with production deployment, production Storage verification and real-device testing remaining explicit external conditions.
