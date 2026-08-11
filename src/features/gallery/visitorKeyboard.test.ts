import { describe, expect, it } from "vitest";
import {
  VISITOR_KEYBOARD_CODES,
  VISITOR_KEYBOARD_HINT,
  visitorLookDirection,
} from "./visitorKeyboard";

describe("visitor keyboard contract", () => {
  it("uses E for look down and leaves R unbound", () => {
    expect(visitorLookDirection(new Set(["KeyE"]))).toBe(-1);
    expect(visitorLookDirection(new Set(["KeyR"]))).toBe(0);
    expect(VISITOR_KEYBOARD_CODES.has("KeyE")).toBe(true);
    expect(VISITOR_KEYBOARD_CODES.has("KeyR")).toBe(false);
    expect(VISITOR_KEYBOARD_HINT).toContain("Q/E");
    expect(VISITOR_KEYBOARD_HINT).not.toContain("Q/R");
  });

  it("keeps the existing movement and arrow look controls", () => {
    ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowLeft", "ArrowRight"].forEach(
      (code) => expect(VISITOR_KEYBOARD_CODES.has(code)).toBe(true),
    );
    expect(visitorLookDirection(new Set(["KeyQ"]))).toBe(1);
    expect(visitorLookDirection(new Set(["ArrowUp"]))).toBe(1);
    expect(visitorLookDirection(new Set(["ArrowDown"]))).toBe(-1);
  });
});
