import { describe, expect, it } from "vitest";
import {
  advanceStoryProgress,
  classifyDannyPart,
  isMarbleFloor,
  isMisplacedMarble,
  storyCamera,
  storyFrame,
  storyScrollProgress,
  visibleStoryEyebrow,
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
  it("renumbers the five visible compact chapters without legacy gaps", () => {
    const legacyEyebrows = [
      "01 · Blueprint",
      "02 · Build",
      "04 · Artwork",
      "06 · Camera and visitor",
      "08 · DannyHirschArts",
    ];
    expect(legacyEyebrows.map(visibleStoryEyebrow)).toEqual([
      "01 · Blueprint",
      "02 · Build",
      "03 · Artwork",
      "04 · Camera and visitor",
      "05 · DannyHirschArts",
    ]);
  });

  it("keeps reduced-motion visitors at chapter one instead of auto-entering the room", () => {
    expect(storyScrollProgress(8_000, 2_000, 6_000, true)).toBe(0);
    expect(storyFrame(storyScrollProgress(8_000, 2_000, 6_000, true)).chapter).toBe(0);
    expect(storyScrollProgress(5_000, 2_000, 6_000)).toBe(0.5);
  });

  it("builds floor before wall, wall before ceiling, then resolves to the visitor finale", () => {
    expect(storyFrame(0.15).floor).toBeGreaterThan(0);
    expect(storyFrame(0.15).wall).toBe(0);
    expect(storyFrame(0.24).wall).toBeGreaterThan(0);
    expect(storyFrame(0.24).ceiling).toBe(0);
    expect(storyFrame(0.33).ceiling).toBeGreaterThan(0);
    expect(storyFrame(0.92).finale).toBeGreaterThan(0);
  });

  it("flies one continuous 360-degree orbit after the art appears", () => {
    const start = storyCamera(0.64);
    const quarter = storyCamera(0.6925);
    const half = storyCamera(0.745);
    const end = storyCamera(0.85);
    expect(quarter.position[0]).toBeGreaterThan(4);
    expect(half.position[2]).toBeLessThan(-5);
    expect(end.position[0]).toBeCloseTo(start.position[0], 6);
    expect(end.position[2]).toBeCloseTo(start.position[2], 6);
  });

  it("has no camera jump at the build/orbit hand-off", () => {
    const before = storyCamera(0.64 - 0.00001);
    const after = storyCamera(0.64 + 0.00001);
    expect(Math.abs(after.position[0] - before.position[0])).toBeLessThan(0.01);
    expect(Math.abs(after.position[2] - before.position[2])).toBeLessThan(0.01);
  });

  it("starts on the blueprint and resolves every final layer", () => {
    expect(storyFrame(0).chapter).toBe(0);
    expect(storyFrame(0).blueprint).toBe(1);
    const finale = storyFrame(1);
    expect(finale.chapter).toBe(7);
    expect(finale.floor).toBe(1);
    expect(finale.wall).toBe(1);
    expect(finale.ceiling).toBe(1);
    expect(finale.artwork).toBe(1);
    expect(finale.finale).toBe(1);
  });

  it("settles from the orbit to a stable visitor-height finale", () => {
    const result = storyCamera(0.96);
    const finale = storyCamera(1);
    expect(result.position[1]).toBeCloseTo(1.75, 6);
    expect(finale.position).toEqual(result.position);
    expect(finale.target).toEqual(result.target);
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
