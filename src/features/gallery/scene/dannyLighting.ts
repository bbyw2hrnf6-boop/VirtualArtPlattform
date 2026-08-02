import * as THREE from "three";

type DannyQualityTier = "low" | "balanced" | "high";

function lightPriority(light: THREE.Light, lowTier = false) {
  const name = light.name.toLowerCase();
  const index = Number(name.match(/(\d+)$/)?.[1] ?? 0);
  if (name.includes("gallery_ambient_fill")) return 120;
  if (name.includes("demo_private_ambient_fill")) return 116;
  if (name.includes("demo_contact_ambient_fill")) return 115;
  if (name.includes("threshold_spot")) return 112;
  if (name.includes("wartrobe_spot"))
    return lowTier && index > 1 ? 80 : 110;
  if (name.includes("surface_spot")) {
    if (lowTier) return index % 2 === 1 ? 112 - index : 86 - index;
    return 108 - index;
  }
  if (name.includes("demo_room_spot")) return 90;
  if (name.includes("demo_waterfall_wash")) return 88;
  if (name.includes("botanical_spot")) return 84;
  if (name.includes("demo_private_pendant")) return 82;
  if (name.includes("cove_fill")) return 70;
  return 60;
}

export function normalizeDannyLight(light: THREE.Light) {
  const name = light.name.toLowerCase();
  const illuminatesArtwork =
    name.includes("surface_spot") ||
    name.includes("threshold_spot") ||
    name.includes("wartrobe_spot");
  const maximum = name.includes("ambient_fill")
    ? 4.2
    : name.includes("cove_fill")
      ? 3.2
      : name.includes("botanical")
        ? 5.2
        : illuminatesArtwork
          ? 4.8
          : 6.2;
  light.intensity = Math.min(light.intensity * 0.045, maximum);
  if (illuminatesArtwork)
    light.color.lerp(new THREE.Color("#fffdf8"), 0.68);
  return light.intensity;
}

export function selectDannyAuthoredLights(
  lights: THREE.Light[],
  tier: DannyQualityTier,
) {
  const budget = tier === "low" ? 8 : tier === "high" ? 14 : 12;
  const ordered = [...lights].sort(
    (a, b) =>
      lightPriority(b, tier === "low") -
      lightPriority(a, tier === "low"),
  );
  ordered.forEach((light, index) => {
    light.visible = index < budget;
  });
  return {
    active: ordered.filter((light) => light.visible),
    budget,
  };
}
