import { describe, expect, it } from "vitest";
import { shouldUseFirebaseVerificationFallback } from "./verificationFallback";

describe("verification email fallback", () => {
  it.each([
    "functions/not-found",
    "functions/unimplemented",
    "functions/failed-precondition",
  ])("uses Firebase delivery when branded delivery is unavailable (%s)", (code) => {
    expect(shouldUseFirebaseVerificationFallback(code)).toBe(true);
  });

  it.each(["functions/unauthenticated", "functions/internal", "functions/permission-denied"])(
    "does not hide actionable delivery errors (%s)",
    (code) => {
      expect(shouldUseFirebaseVerificationFallback(code)).toBe(false);
    },
  );
});
