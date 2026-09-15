/** Metres in the Obsidian plan: x east, y north. Visitor radius 22 cm. */
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
