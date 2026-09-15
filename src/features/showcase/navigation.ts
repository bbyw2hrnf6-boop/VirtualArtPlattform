import { createPlanarCollisionSystem } from '../gallery/scene/runtimeQuality';

/** Metres in the Obsidian plan: x east, y north. Visitor radius 25 cm. */
export function canStand(x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < .25 || x > 33.75 || y < .25 || y > 7.75) return false;
  if ([12, 22].some(wall => Math.abs(x - wall) < .38 && (y < 2.75 || y > 5.25))) return false;
  return ![6, 17, 28].some(bench => Math.abs(x - bench) < 1.85 && Math.abs(y - 4) < .63);
}

export function moveSafely(x: number, y: number, dx: number, dy: number): [number, number] {
  // Substeps prevent tunnelling on slow devices; slide along colliders.
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / .08));
  for (let i = 0; i < steps; i++) {
    if (canStand(x + dx / steps, y)) x += dx / steps;
    if (canStand(x, y + dy / steps)) y += dy / steps;
  }
  return [x, y];
}

/** Shared Space path planning, with the authored Obsidian partitions/benches.
 * The same clearance used by keyboard substeps also governs tap destinations. */
export const obsidianBounds = { minX: .25, maxX: 33.75, minZ: -7.75, maxZ: -.25 };

export function createObsidianNavigation() {
  const navigation = createPlanarCollisionSystem([
    ...[12, 22].flatMap(x => [
      { minX: x - .13, maxX: x + .13, minZ: -8, maxZ: -5.5 },
      { minX: x - .13, maxX: x + .13, minZ: -2.5, maxZ: 0 },
    ]),
    ...[6, 17, 28].map(x => ({ minX: x - 1.6, maxX: x + 1.6, minZ: -4.38, maxZ: -3.62 })),
  ], .25, obsidianBounds);
  return {
    ...navigation,
    resolve(next: Parameters<typeof navigation.resolve>[0], previous: Parameters<typeof navigation.resolve>[1]) {
      const [x, y] = moveSafely(previous.x, -previous.z, next.x - previous.x, previous.z - next.z);
      next.set(x, previous.y, -y);
      return next.distanceToSquared(previous) > 1e-8;
    },
  };
}
