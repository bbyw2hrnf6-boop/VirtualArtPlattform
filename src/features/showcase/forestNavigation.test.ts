import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createForestNavigation, forestCanStand } from './forestNavigation';
import { forestRooms } from './forestRooms';

describe('Forest Fold House continuous two-level circulation',()=>{
  const nav=createForestNavigation();
  it('starts every room outside furniture and walls',()=>{
    for(const room of forestRooms) expect(forestCanStand(new Vector3(...room.start)),room.id).toBe(true);
  });
  it('connects the upper hall to both wings and both floors without teleportation',()=>{
    const entry=new Vector3(...forestRooms[0].start);
    for(const room of forestRooms.slice(1)){
      const target=new Vector3(...room.start),path=nav.findPath(entry,target);
      expect(path,room.id).not.toBeNull();
      let current=entry.clone();
      for(const waypoint of path!){
        let iterations=0;
        while(Math.hypot(waypoint.x-current.x,waypoint.z-current.z)>.03&&iterations++<2000){
          const next=current.clone().lerp(waypoint,Math.min(1,.03/current.distanceTo(waypoint)));
          const previous=current.clone();nav.resolve(next,current);
          expect(Math.abs(next.y-previous.y),room.id).toBeLessThan(.06);
          expect(forestCanStand(next),room.id).toBe(true);current=next;
        }
        expect(iterations,room.id).toBeLessThan(2000);
      }
      expect(current.distanceTo(target),room.id).toBeLessThan(.08);
    }
  },30000);
  it('rejects water, roofs, furniture and shortcuts between floors',()=>{
    const entry=new Vector3(...forestRooms[0].start);
    for(const p of [new Vector3(4,1.52,4),new Vector3(-3,8.73,1),new Vector3(-6.4,5.1,2.15)]){
      expect(forestCanStand(p)).toBe(false);expect(nav.findPath(entry,p)).toBeNull();
    }
    const previous=new Vector3(.4,5.1,-.7),next=new Vector3(.4,1.7,-.7);
    nav.resolve(next,previous);expect(next.y).toBeCloseTo(5.1);
  });
});
