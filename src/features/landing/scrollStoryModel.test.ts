import { describe, expect, it } from "vitest";
import {
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
    const start = storyCamera(0.64);
    const quarter = storyCamera(0.7);
    const half = storyCamera(0.76);
    const end = storyCamera(0.88);
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
});
