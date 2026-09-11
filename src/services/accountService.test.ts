import { describe, expect, it } from "vitest";
import { accountErrorMessage, normalizeAccountProfile } from "./accountService";

describe("administrator account deletion guidance", () => {
  it("explains the owner handoff instead of incorrectly requesting repeated sign-in", () => {
    expect(accountErrorMessage({ code: "functions/failed-precondition", details: { reason: "active-site-admin-membership" } })).toContain("appoint another owner first");
    expect(accountErrorMessage({ code: "functions/failed-precondition", details: { reason: "invalid-site-admin-membership" } })).toContain("operator review");
    expect(accountErrorMessage({ code: "functions/failed-precondition" })).toContain("sign in again");
  });
});

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
