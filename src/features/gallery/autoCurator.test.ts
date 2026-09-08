import { describe, expect, it } from "vitest";
import { composeGallery, curationCirculationClear, curationSignature, type CurationScope, type CurationStyle } from "./autoCurator";
import { TEMPLATES } from "./templates";
import { createDemoCollectionDraft } from "./editor/demoCollection";
import { createGalleryDraft } from "./editor/draftDefaults";
import { validateDraftPlacements } from "./editor/placementValidation";

for (const template of TEMPLATES) describe(`${template.id} curation`, () => {
  it("produces varied, valid compositions with unique objects and clear circulation over 120 seeds", () => {
    let draft = createDemoCollectionDraft(template.id);
    const recent: string[] = [];
    const palettes = new Set<string>();
    const objects = new Set<string>();
    for (let seed = 0; seed < 120; seed++) {
      const scope: CurationScope = seed % 3 === 0 ? "all" : seed % 3 === 1 ? "room" : "objects";
      const style: CurationStyle = (["auto", "quiet", "warm", "bold"] as const)[seed % 4];
      const before = structuredClone(draft);
      const result = composeGallery(draft, template, { seed, scope, style, recent: recent.slice(-12) });
      expect(draft).toEqual(before);
      expect(validateDraftPlacements(result.draft)).toEqual([]);
      expect(result.report.signature).not.toBe(curationSignature(draft));
      expect(recent).not.toContain(result.report.signature);
      expect(new Set(result.draft.decor.map(item => item.type)).size).toBe(result.draft.decor.length);
      expect(result.draft.decor.length).toBeGreaterThanOrEqual(3);
      expect(result.draft.decor.length).toBeLessThanOrEqual(6);
      expect(result.draft.decor.every(item => curationCirculationClear(item, template))).toBe(true);
      if (scope !== "all") expect(result.draft.artworks).toEqual(draft.artworks);
      if (scope === "objects") for (const key of ["wall", "floor", "lighting", "ceiling"] as const) expect(result.draft[key]).toBe(draft[key]);
      // Authored ceiling system and all work identities/metadata survive each variation.
      expect(result.draft.ceiling).toBe(draft.ceiling);
      expect(result.draft.artworks.map(({ id, src, title }) => ({ id, src, title }))).toEqual(draft.artworks.map(({ id, src, title }) => ({ id, src, title })));
      recent.push(result.report.signature);
      palettes.add(`${result.draft.wall}|${result.draft.floor}`);
      result.draft.decor.forEach(item => objects.add(item.type));
      draft = result.draft;
    }
    expect(palettes.size).toBeGreaterThan(25);
    expect(objects.size).toBe(12);
  });

  it("furnishes an empty room, and preserves locked or hidden works even when they come last", () => {
    const empty = composeGallery(createGalleryDraft(template.id), template, { seed: 7 });
    expect(empty.draft.decor.length).toBeGreaterThanOrEqual(3);
    const draft = createDemoCollectionDraft(template.id);
    draft.artworks[1].hidden = true;
    draft.artworks[2].locked = true;
    for (let seed = 0; seed < 30; seed++) {
      const result = composeGallery(draft, template, { seed, scope: "all" });
      expect(result.draft.artworks.slice(1)).toEqual(draft.artworks.slice(1));
      expect(validateDraftPlacements(result.draft)).toEqual([]);
    }
  });

  it("reproduces a design with a seed without treating generated object IDs as variety", () => {
    const draft = createDemoCollectionDraft(template.id);
    const first = composeGallery(draft, template, { seed: 91 });
    expect(composeGallery(draft, template, { seed: 91 }).report.signature).toBe(first.report.signature);
    expect(composeGallery(draft, template, { seed: 91, recent: [first.report.signature] }).report.signature).not.toBe(first.report.signature);
  });
});

it("keeps an invalid locked draft intact when safe curation is impossible", () => {
  const draft = createDemoCollectionDraft("white-cube");
  draft.artworks[0] = { ...draft.artworks[0], x: 100, locked: true };
  const original = structuredClone(draft);
  expect(() => composeGallery(draft, TEMPLATES[0], { seed: 1, scope: "all" })).toThrow(/No safe new composition/);
  expect(draft).toEqual(original);
});
