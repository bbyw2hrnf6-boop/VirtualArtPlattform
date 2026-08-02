import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  normalizeDannyLight,
  selectDannyAuthoredLights,
} from "./dannyLighting";

const authoredNames = [
  "Botanical_Spot_East",
  "Botanical_Spot_West",
  "Cove_Fill_01",
  "Cove_Fill_02",
  "Cove_Fill_03",
  "Cove_Fill_04",
  "Cove_Fill_05",
  "Cove_Fill_06",
  "Cove_Fill_07",
  "Cove_Fill_08",
  "Demo_Contact_Ambient_Fill",
  "Demo_Private_Ambient_Fill",
  "Demo_Private_Pendant_Light",
  "Demo_Room_Spot_01",
  "Demo_Room_Spot_02",
  "Demo_Room_Spot_03",
  "Demo_Room_Spot_04",
  "Demo_Room_Spot_05",
  "Demo_Waterfall_Wash",
  "Gallery_Ambient_Fill",
  "Surface_Spot_01",
  "Surface_Spot_02",
  "Surface_Spot_03",
  "Surface_Spot_04",
  "Surface_Spot_05",
  "Surface_Spot_06",
  "Threshold_Spot",
  "WARTROBE_Spot_1",
  "WARTROBE_Spot_2",
];

function authoredLights() {
  return authoredNames.map((name) => {
    const light = new THREE.SpotLight("#ffc18f", 20_000);
    light.name = name;
    return light;
  });
}

describe("Danny lighting", () => {
  it("spreads the low-tier budget across the exhibition", () => {
    const selection = selectDannyAuthoredLights(authoredLights(), "low");
    const names = selection.active.map((light) => light.name);

    expect(selection.budget).toBe(8);
    expect(names).toEqual(
      expect.arrayContaining([
        "Gallery_Ambient_Fill",
        "Demo_Private_Ambient_Fill",
        "Demo_Contact_Ambient_Fill",
        "Surface_Spot_01",
        "Surface_Spot_03",
        "Surface_Spot_05",
        "WARTROBE_Spot_1",
      ]),
    );
    expect(names).not.toContain("WARTROBE_Spot_2");
  });

  it.each([
    ["balanced", 12],
    ["high", 14],
  ] as const)("enforces the %s tier budget", (tier, budget) => {
    const selection = selectDannyAuthoredLights(authoredLights(), tier);

    expect(selection.budget).toBe(budget);
    expect(selection.active).toHaveLength(budget);
    expect(selection.active.filter((light) => /Surface_Spot/.test(light.name)))
      .toHaveLength(6);
  });

  it("reduces active lights when adaptive quality drops", () => {
    const lights = authoredLights();

    expect(selectDannyAuthoredLights(lights, "high").active).toHaveLength(14);
    expect(selectDannyAuthoredLights(lights, "low").active).toHaveLength(8);
    expect(lights.filter((light) => light.visible)).toHaveLength(8);
  });

  it("neutralizes and caps artwork spotlights", () => {
    const light = new THREE.SpotLight("#ff8b52", 20_000);
    light.name = "Surface_Spot_01";
    const original = light.color.clone();
    const neutral = new THREE.Color("#fffdf8");
    const distance = (a: THREE.Color, b: THREE.Color) =>
      Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

    normalizeDannyLight(light);

    expect(light.intensity).toBe(4.8);
    expect(distance(light.color, neutral)).toBeLessThan(
      distance(original, neutral),
    );
  });
});
