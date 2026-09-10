import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, Mesh, Plane, Vector3, type Object3D, type WebGLRenderer } from 'three';

/** Reveal existing geometry without stretching its authored UVs or rebuilding it. */
export function createStoryArchitecture(scene: Object3D, renderer: WebGLRenderer, floor: Mesh, walls: Object3D[], width: number, depth: number, height: number) {
  renderer.localClippingEnabled = true;
  const exposure = renderer.toneMappingExposure;
  const floorPlane = new Plane(new Vector3(0, 0, -1), -depth / 2 - 1);
  const wallPlane = new Plane(new Vector3(0, -1, 0), -1);
  const points: number[] = [];
  const corners = [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]];
  corners.forEach(([x, z], i) => points.push(x, .025, z, corners[(i + 1) % 4][0], .025, corners[(i + 1) % 4][1]));
  // The White Cube's two authored angled wings, projected onto the plan.
  for (const side of [-1, 1]) {
    const cx = side * width * .34, cz = -depth * .17, length = depth * .31 / 2;
    const dx = Math.sin(side * -.34) * length, dz = Math.cos(.34) * length;
    points.push(cx - dx, .025, cz - dz, cx + dx, .025, cz + dz);
  }
  const ink = new LineBasicMaterial({ color: '#ddcba4', transparent: true });
  const outline = new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points, 3)), ink);
  outline.userData.noWalkCollision = true; scene.add(outline);
  const bind = () => {
    for (const root of [floor, ...walls]) root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material.clippingPlanes) continue;
        material.clippingPlanes = [root === floor || material.userData.surfaceRole === 'floor' ? floorPlane : wallPlane];
        material.clipShadows = true; material.needsUpdate = true;
      }
    });
  };
  return { bind, update(floorReveal: number, wallsReveal: number, light: number) {
    floorPlane.constant = -depth / 2 - .1 + (depth + .3) * floorReveal;
    wallPlane.constant = -.2 + (height + 1) * wallsReveal;
    outline.visible = wallsReveal < 1; ink.opacity = 1 - wallsReveal;
    // Exposure brings the daylight in gently without changing the comparison shots.
    renderer.toneMappingExposure = exposure * (.6 + .4 * light);
  } };
}
