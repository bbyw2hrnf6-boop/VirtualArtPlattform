import { describe,it,expect } from 'vitest';
import { Vector3 } from 'three';
import { createPavilionNavigation,pavilionCanStand } from './pavilionNavigation';
const p=(x:number,y:number)=>new Vector3(x,1.75,-y);
describe('Sculpture Pavilion authored visitor route',()=>{
 it('connects A → B → C → A without crossing walls or sculptures',()=>{
  const nav=createPavilionNavigation();
  for(const [a,b] of [[p(-7,-1),p(14,-2)], [p(14,-2),p(12,18)], [p(12,18),p(-7,-1)]]){
   const route=nav.findPath(a,b);expect(route).not.toBeNull();let last=a;
   for(const next of route!){const n=Math.ceil(last.distanceTo(next)/.03);for(let i=0;i<=n;i++){const v=last.clone().lerp(next,i/n);expect(pavilionCanStand(v.x,-v.z)).toBe(true);}last=next;}
   expect(last.distanceTo(b)).toBeLessThan(.001);
  }
 });
 it('blocks roofless voids, sculpture bases, glass underside and outside walls',()=>{
  for(const [x,y] of [[9,8],[1,0],[-3,4],[-3,-4],[17,0],[8,15],[21,-3],[-13,0],[24,0],[0,8],[NaN,0]])expect(pavilionCanStand(x,y)).toBe(false);
 });
 it('collision substeps stop a long manual move before an exhibit',()=>{
  const nav=createPavilionNavigation(),from=p(8,11),to=p(8,19);nav.resolve(to,from);expect(-to.z).toBeLessThan(12.73);expect(pavilionCanStand(to.x,-to.z)).toBe(true);
 });
});
