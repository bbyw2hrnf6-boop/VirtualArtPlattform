import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const functionsSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const clientSource = readFileSync(
  new URL("../../src/services/accountService.ts", import.meta.url),
  "utf8",
);

function exportedBlock(name: string, nextMarker: string) {
  const start = functionsSource.indexOf(`export const ${name}`);
  const end = functionsSource.indexOf(nextMarker, start + 1);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return functionsSource.slice(start, end);
}

describe("managed account export integration", () => {
  it("keeps the legacy callable authenticated but fails it closed before expensive work", () => {
    const legacy = exportedBlock("exportAuraAccountData", "function accountExportStateForRequest");
    expect(functionsSource).toContain("function immediateAccountExportRetired(): boolean {\n  return true;\n}");
    expect(legacy).toContain("enforceAppCheck: true");
    expect(legacy).toContain("requireAccount(request.auth)");
    const retirement = legacy.indexOf("The immediate account export is retired");
    expect(retirement).toBeGreaterThan(-1);
    expect(retirement).toBeLessThan(legacy.indexOf("getAuth().getUser(uid)"));
    expect(retirement).toBeLessThan(legacy.indexOf("accountQueryDocuments"));
  });

  it("routes the product client exclusively through the managed callable", () => {
    expect(clientSource).toContain('"manageAuraAccountExport"');
    expect(clientSource).not.toContain('"exportAuraAccountData"');
  });

  it("resumes owned partitions with legacy Firestore document IDs", () => {
    expect(functionsSource).toContain(
      "const galleryId = parsePersistedGalleryDocumentId(position[0]);",
    );
    expect(functionsSource).not.toContain(
      "const galleryId = parseGalleryId(position[0]);",
    );
  });
});
