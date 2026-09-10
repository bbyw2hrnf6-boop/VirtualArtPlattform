import { Vector3 } from 'three';

/** Fit every room corner to the actual portrait canvas, keeping an aerial view. */
export function fitArrangeCamera(width: number, depth: number, height: number, aspect: number, viewDirection = new Vector3(.08, .7, 1)) {
  const target = new Vector3(0, height * .3, 0);
  const direction = viewDirection.clone().normalize();
  const right = new Vector3(0, 1, 0).cross(direction).normalize();
  const up = direction.clone().cross(right);
  const tanY = Math.tan(24 * Math.PI / 180), tanX = tanY * Math.max(.3, aspect);
  let distance = 0;
  for (const x of [-width / 2, width / 2]) for (const y of [0, height]) for (const z of [-depth / 2, depth / 2]) {
    const corner = new Vector3(x, y, z).sub(target);
    distance = Math.max(distance, corner.dot(direction) + Math.max(Math.abs(corner.dot(right)) / tanX, Math.abs(corner.dot(up)) / tanY) * 1.12);
  }
  return { target, distance, position: direction.multiplyScalar(distance).add(target) };
}
