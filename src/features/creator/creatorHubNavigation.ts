export type CreatorHubSection = "home" | "feed" | "spaces" | "profile" | "notifications";

export const CREATOR_HUB_TARGETS = [
  { id: "creator-home", section: "home" },
  { id: "creator-feed", section: "feed" },
  { id: "creator-activity", section: "notifications" },
  { id: "creator-spaces", section: "spaces" },
  { id: "creator-profile", section: "profile" },
] as const satisfies ReadonlyArray<{ id: string; section: CreatorHubSection }>;

const sectionByTarget = new Map<string, CreatorHubSection>([
  ...CREATOR_HUB_TARGETS.map(({ id, section }) => [id, section] as const),
]);

function hashTarget(hash: string) {
  const fragment = hash.includes("#") ? hash.slice(hash.indexOf("#") + 1) : hash;
  const target = fragment.split(/[?&]/, 1)[0];
  try {
    return decodeURIComponent(target).trim().toLowerCase();
  } catch {
    return target.trim().toLowerCase();
  }
}

export function creatorHubTargetFromHash(hash: string) {
  const target = hashTarget(hash);
  return sectionByTarget.has(target) ? target : null;
}

export function creatorHubSectionFromHash(hash: string): CreatorHubSection {
  return sectionByTarget.get(hashTarget(hash)) ?? "home";
}

export function creatorHubSectionAtViewportAnchor(
  targets: ReadonlyArray<{ section: CreatorHubSection; top: number }>,
  anchor: number,
): CreatorHubSection {
  const positioned = targets.filter(({ top }) => Number.isFinite(top));
  if (!positioned.length) return "home";

  // Browser sub-pixel rounding can leave a scroll-margin target 1–3 px below
  // the computed sticky offset. Treat that as reached so the active tab does
  // not briefly fall back to the previous section.
  const passed = positioned.filter(({ top }) => top <= anchor + 4);
  if (passed.length) {
    return passed.reduce((closest, target) => target.top > closest.top ? target : closest).section;
  }

  return positioned.reduce((closest, target) => target.top < closest.top ? target : closest).section;
}
