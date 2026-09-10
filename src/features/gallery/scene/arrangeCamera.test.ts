import { expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { TEMPLATES } from '../templates';
import { fitArrangeCamera } from './arrangeCamera';

it('keeps every room corner within portrait and landscape framing', () => {
  for (const room of TEMPLATES) for (const aspect of [.45,.6,1,1.8]) {
    const [w,d]=room.dimensions,h=room.height;
    const pose=fitArrangeCamera(w,d,h,aspect);
    const camera=new PerspectiveCamera(48,aspect,.1,500);
    camera.position.copy(pose.position);camera.lookAt(pose.target);camera.updateMatrixWorld();
    for (const x of [-w/2,w/2]) for(const y of [0,h]) for(const z of [-d/2,d/2]) {
      const projected=new Vector3(x,y,z).project(camera);
      expect(Math.abs(projected.x)).toBeLessThan(1);
      expect(Math.abs(projected.y)).toBeLessThan(1);
    }
  }
});
