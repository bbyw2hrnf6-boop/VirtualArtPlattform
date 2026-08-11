export const VISITOR_KEYBOARD_CODES: ReadonlySet<string> = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyQ",
  "KeyE",
]);

export const VISITOR_LOOK_CODES: ReadonlySet<string> = new Set([
  "KeyQ",
  "KeyE",
  "ArrowUp",
  "ArrowDown",
]);

export const VISITOR_KEYBOARD_HINT =
  "W/S move · A/D strafe · Q/E or ↑↓ look · ←→ turn";

export function visitorLookDirection(keys: Pick<ReadonlySet<string>, "has">) {
  return (
    (keys.has("KeyQ") || keys.has("ArrowUp") ? 1 : 0) -
    (keys.has("KeyE") || keys.has("ArrowDown") ? 1 : 0)
  );
}
