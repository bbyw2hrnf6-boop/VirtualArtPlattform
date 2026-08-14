import { describe, expect, it } from "vitest";
import { normalizeAccountProfile } from "./accountService";

describe("normalizeAccountProfile", () => {
  it("normalizes a clear public identity", () => {
    expect(
      normalizeAccountProfile({
        displayName: "  Danny   Hirsch  ",
        nickname: " danny.hirsch ",
      }),
    ).toEqual({ displayName: "Danny Hirsch", nickname: "danny.hirsch" });
  });

  it("rejects nicknames that cannot be represented by the profile rules", () => {
    expect(() =>
      normalizeAccountProfile({
        displayName: "Danny Hirsch",
        nickname: "danny hirsch",
      }),
    ).toThrow(/nickname/i);
  });

  it("requires a visible profile name", () => {
    expect(() =>
      normalizeAccountProfile({ displayName: "   ", nickname: "" }),
    ).toThrow(/profile name/i);
  });
});
