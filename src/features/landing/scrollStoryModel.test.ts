import { describe, expect, it } from "vitest";
import {
  advanceStoryProgress,
  classifyDannyPart,
  isMarbleFloor,
  isMisplacedMarble,
  storyCamera,
  storyFrame,
} from "./scrollStoryModel";

describe("Danny scroll-story material contract", () => {
  it("treats the legacy vertical floor-alt mesh as a wall", () => {
    const part = classifyDannyPart({
      objectName: "ARCH_Floor_Alt",
      themeRole: "floor_alt",
      localY: 2.9,
    });
    expect(part).toBe("wall");
    expect(isMarbleFloor(part, "floor_alt", "Gallery_Backlit_Black_Marble")).toBe(false);
    expect(isMisplacedMarble(part, "floor_alt", "Gallery_Backlit_Black_Marble")).toBe(true);
  });

  it("keeps black marble on real floor tiles", () => {
    const part = classifyDannyPart({
      objectName: "ARCH_Floor_Tile_A",
      themeRole: "floor_tile_a",
      localY: 0.01,
    });
    expect(part).toBe("floor");
    expect(isMarbleFloor(part, "floor_tile_a", "Gallery_Polished_Black_Marble_A")).toBe(true);
  });

  it("keeps genuine artwork independent from architectural stages", () => {
    expect(classifyDannyPart({
      objectName: "SURFACE_DETAIL_01",
      themeRole: "surface_detail_locked",
    })).toBe("artwork");
  });
});

describe("Emil story progression", () => {
  it("builds floor before wall, wall before ceiling, then resolves to the visitor finale", () => {
    expect(storyFrame(0.28).floor).toBeGreaterThan(0);
    expect(storyFrame(0.28).wall).toBe(0);
    expect(storyFrame(0.38).wall).toBeGreaterThan(0);
    expect(storyFrame(0.38).ceiling).toBe(0);
    expect(storyFrame(0.49).ceiling).toBeGreaterThan(0);
    expect(storyFrame(0.92).finale).toBeGreaterThan(0);
  });

  it("flies one continuous 360-degree orbit after the art appears", () => {
    const start = storyCamera(0.66);
    const quarter = storyCamera(0.72);
    const half = storyCamera(0.78);
    const end = storyCamera(0.9);
    expect(quarter.position[0]).toBeGreaterThan(4);
    expect(half.position[2]).toBeLessThan(-5);
    expect(end.position[0]).toBeCloseTo(start.position[0], 6);
    expect(end.position[2]).toBeCloseTo(start.position[2], 6);
  });

  it("has no camera jump at the build/orbit hand-off", () => {
    const before = storyCamera(0.66 - 0.00001);
    const after = storyCamera(0.66 + 0.00001);
    expect(Math.abs(after.position[0] - before.position[0])).toBeLessThan(0.01);
    expect(Math.abs(after.position[2] - before.position[2])).toBeLessThan(0.01);
  });

  it("starts on the blueprint and resolves every final layer", () => {
    expect(storyFrame(0).chapter).toBe(0);
    expect(storyFrame(0).blueprint).toBe(1);
    const finale = storyFrame(1);
    expect(finale.chapter).toBe(5);
    expect(finale.floor).toBe(1);
    expect(finale.wall).toBe(1);
    expect(finale.ceiling).toBe(1);
    expect(finale.artwork).toBe(1);
    expect(finale.finale).toBe(1);
  });

  it("rate-limits aggressive scroll without overshooting the target", () => {
    const firstFrame = advanceStoryProgress(0, 1, 16.67);
    expect(firstFrame).toBeGreaterThan(0);
    expect(firstFrame).toBeLessThanOrEqual(0.5 * 0.01667 + 0.00001);

    let progress = 0;
    for (let frame = 0; frame < 240; frame += 1)
      progress = advanceStoryProgress(progress, 1, 16.67);
    expect(progress).toBeGreaterThan(0.99);
    expect(progress).toBeLessThanOrEqual(1);
  });

  it("is reversible and converges to a changed scroll target", () => {
    let progress = 0.8;
    for (let frame = 0; frame < 180; frame += 1)
      progress = advanceStoryProgress(progress, 0.2, 16.67);
    expect(progress).toBeCloseTo(0.2, 3);
  });
});
