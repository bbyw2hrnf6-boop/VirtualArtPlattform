import { describe, expect, it } from "vitest";
import {
  boundedModerationSourceReports,
  creatorPostModerationCaseId,
  creatorPostReportId,
  creatorReportPrincipal,
  creatorReportIntakePatch,
  highestModerationPriority,
  moderationPriorityForReason,
} from "./moderationPolicy.js";

describe("moderation intake policy", () => {
  it("uses stable, target-scoped report and case IDs", () => {
    expect(creatorPostReportId("reporter", "target", "post")).toHaveLength(64);
    expect(creatorPostReportId("reporter", "target", "post"))
      .toBe(creatorPostReportId("reporter", "target", "post"));
    expect(creatorPostReportId("other", "target", "post"))
      .not.toBe(creatorPostReportId("reporter", "target", "post"));
    expect(creatorPostModerationCaseId("target", "post"))
      .toBe(creatorPostModerationCaseId("target", "post"));
  });

  it("lets an authenticated account report without requiring a Creator profile", () => {
    expect(creatorReportPrincipal("account-1", undefined)).toBe("account:account-1");
    expect(creatorReportPrincipal("account-1", "legacy-creator-1")).toBe("legacy-creator-1");
  });

  it("never lets repeat intake overwrite operator-owned fields", () => {
    const patch = creatorReportIntakePatch({
      status: "resolved",
      caseId: "existing-case",
      reportCount: 3,
      decisionCode: "no-violation",
      assignedOperatorId: "operator-1",
    }, "other", "computed-case");
    expect(patch).toMatchObject({ reason: "other", reportCount: 4, schemaVersion: 2 });
    expect(patch).not.toHaveProperty("status");
    expect(patch).not.toHaveProperty("caseId");
    expect(patch).not.toHaveProperty("decisionCode");
    expect(patch).not.toHaveProperty("assignedOperatorId");
  });

  it("initializes legacy/new reports without trusting malformed counters", () => {
    expect(creatorReportIntakePatch(undefined, "spam", "case-1")).toMatchObject({
      status: "open",
      caseId: "case-1",
      reportCount: 1,
    });
    expect(creatorReportIntakePatch({ reportCount: -10 }, "spam", "case-1")).toMatchObject({
      status: "open",
      caseId: "case-1",
      reportCount: 1,
    });
  });

  it("escalates priority and bounds source report IDs", () => {
    expect(moderationPriorityForReason("unsafe")).toBe("urgent");
    expect(moderationPriorityForReason("rights")).toBe("high");
    expect(highestModerationPriority("high", "standard")).toBe("high");
    expect(highestModerationPriority("standard", "urgent")).toBe("urgent");
    expect(boundedModerationSourceReports(["r1", "r1"], "r2", 2)).toEqual(["r1", "r2"]);
    expect(boundedModerationSourceReports(["r1", "r2"], "r3", 2)).toEqual(["r1", "r2"]);
  });
});
