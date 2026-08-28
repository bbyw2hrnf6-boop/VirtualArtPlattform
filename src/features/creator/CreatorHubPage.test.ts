import { describe, expect, it } from "vitest";
import { creatorHandleBase } from "../../services/creatorProfile";

describe("creatorHandleBase", () => {
  it("prefers the account nickname and makes it URL-safe", () => {
    expect(creatorHandleBase({ nickname: "Skipper Admin", displayName: "Other" }))
      .toBe("skipper-admin");
  });

  it("falls back to the email name and keeps the minimum handle length", () => {
    expect(creatorHandleBase({ email: "xy@example.com" })).toBe("xy-art");
  });

  it("removes accents and caps handles at 30 characters", () => {
    expect(creatorHandleBase({ displayName: "Émil Creator With A Very Long Studio Name" }))
      .toBe("emil-creator-with-a-very-long");
  });
});
