import { describe, expect, it } from "vitest";
import source from "./CreatorReportDialog.tsx?raw";

describe("Creator report dialog contract", () => {
  it("collects a specific allow-listed reason in an accessible modal", () => {
    for (const reason of ["spam", "harassment", "rights", "unsafe", "other"])
      expect(source).toContain(`value: "${reason}"`);
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("useDialogFocus(dialog, onClose)");
    expect(source).toContain("if (reason && !busy) onSubmit(reason)");
    expect(source).toContain('role="alert"');
  });
});
