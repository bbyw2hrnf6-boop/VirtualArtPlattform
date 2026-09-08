import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { catalogObject, DECOR_CATALOG, FLOOR_OPTIONS, WALL_OPTIONS } from "./designCatalog";
import { createDemoCollectionDraft } from "./editor/demoCollection";
import { DECOR_FOOTPRINTS, findAvailableDecorPlacement, validateDraftPlacements } from "./editor/placementValidation";
import { createDesignObject } from "./scene/designObjects";
import { prepareGalleryDraftForPublication, validateGalleryDraft } from "../../services/galleryValidation";
import type { DecorId } from "./types";

describe("design catalog compatibility", () => {
  it("offers unique identities, while every choice survives client publication validation", () => {
    expect(new Set(DECOR_CATALOG.map(item => item.id)).size).toBe(DECOR_CATALOG.length);
    const base = createDemoCollectionDraft("white-cube");
    base.artworks = base.artworks.map(item => ({ ...item, src: "data:image/webp;base64,YQ==" }));
    for (const change of [
      ...WALL_OPTIONS.map(([wall]) => ({ wall })),
      ...FLOOR_OPTIONS.map(([floor]) => ({ floor })),
      ...DECOR_CATALOG.map(({ id: type }) => ({ decor: [{ id: "test-object", type, x: 3, z: 2, rotation: 0, scale: 1 }] })),
    ]) {
      const draft = { ...base, ...change };
      expect(validateGalleryDraft(draft)).toMatchObject(change);
      const payload = prepareGalleryDraftForPublication(draft);
      expect(payload).toMatchObject(change);
    }
  });

  for (const type of ["lounge-chair", "stone-table", "light-column"] satisfies DecorId[]) it(`${type} geometry fits its collision footprint at any rotation, within a 6000 triangle budget`, () => {
    const object = createDesignObject(type)!;
    const [width, depth] = DECOR_FOOTPRINTS[type];
    expect(object.children.length).toBeLessThanOrEqual(2);
    const bounds = new THREE.Box3().setFromObject(object);
    expect(Math.max(Math.abs(bounds.min.x), bounds.max.x)).toBeLessThanOrEqual(width / 2);
    expect(Math.max(Math.abs(bounds.min.z), bounds.max.z)).toBeLessThanOrEqual(depth / 2);
    expect(bounds.min.y).toBeGreaterThanOrEqual(-.001);
    let triangles = 0;
    const materials = new Set<THREE.Material>();
    object.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      triangles += (child.geometry.index?.count ?? child.geometry.attributes.position.count) / 3;
      expect(child.geometry.getAttribute("normal").count).toBe(child.geometry.getAttribute("position").count);
      expect(child.geometry.getAttribute("uv").count).toBe(child.geometry.getAttribute("position").count);
      expect(Array.from(child.geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
      materials.add(child.material);
    });
    expect(triangles).toBeLessThan(6000);
    expect(materials.size).toBeLessThanOrEqual(2);
    for (const rotation of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
      const draft = createDemoCollectionDraft("white-cube");
      const item = findAvailableDecorPlacement(draft, { id: "test", type, x: 0, z: 0, scale: 1.8, rotation });
      expect(item).not.toBeNull();
      expect(validateDraftPlacements({ ...draft, decor: [item!] })).toEqual([]);
    }
  });
});


it("selects existing objects and legacy equivalents instead of inserting visual duplicates", () => {
  const item = { id: "legacy", type: "ficus" as const, x: 3, z: 2, rotation: 0, scale: 1 };
  expect(catalogObject([item], "monstera")).toBe(item);
  expect(catalogObject([item], "olive")).toBeUndefined();
  const bench = { ...item, type: "gallery-bench" as const };
  expect(catalogObject([bench], "leather-bench")).toBe(bench);
});
