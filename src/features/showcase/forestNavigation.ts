import { Vector3 } from 'three';
import colliders from './forest-colliders.json';

export const forestBounds = { minX: -8.4, maxX: 8, minZ: -8.5, maxZ: 5.4 };
export const forestEyeHeight = 1.7;
const radius = .25;
const within = (x:number,y:number,a:number,b:number,c:number,d:number) => x>=a&&x<=c&&y>=b&&y<=d;

/** Plan XY is east/north; browser XYZ is east/up/south. Stairs use continuous
 * tread envelopes, so camera motion does not bob across the twenty risers. */
export function forestHeights(x:number,y:number, clearance=radius):number[] {
  const heights:number[]=[];
  const west=within(x,y,-7.7,-3.7,-1.3,3.7);
  const east=within(x,y,3.3,-1.2,7.7,3.7);
  const stairBay=within(x,y,-7.7,-.8,-5.5,2.7);
  if(stairBay) {
    if(y<=.2) heights.push(1.7);
    else if(x<=-6.7) heights.push((2.7-y)*.68);
    else if(x>=-6.5) heights.push(1.7+(y-.2)*.68);
  } else if(west||east) heights.push(0,3.4);
  // Door thresholds and the entire dry route are continuous with the slabs.
  if(within(x,y,-1.6,.1,3.6,1.5)) heights.push(0);
  if(within(x,y,-1.6,0,3.6,1.4)) heights.push(3.4);
  if(within(x,y,-5.05,3.6,-4.5,8.25)) heights.push(3.4);
  if(within(x,y,-8.1,-5.15,-1.2,-3.7)) heights.push(0);
  return [...new Set(heights)].filter(z=>!colliders.obstacles.some(o=>Math.abs(o.level-z)<.3&&
    within(x,y,o.bounds[0]-clearance,o.bounds[1]-clearance,o.bounds[2]+clearance,o.bounds[3]+clearance)));
}

function stand(x:number,y:number,z:number) {
  if(!Number.isFinite(x+y+z))return false;
  const heights=forestHeights(x,y);
  if(!heights.some(h=>Math.abs(h-z)<.025))return false;
  // Clearance to the void, pond and bridge edges as well as solid colliders.
  return Array.from({length:8},(_,i)=>i*Math.PI/4).every(a=>
    forestHeights(x+Math.cos(a)*radius,y+Math.sin(a)*radius,0).some(h=>Math.abs(h-z)<.23));
}
export function forestCanStand(p:Vector3) {return stand(p.x,-p.z,p.y-forestEyeHeight);}

export function createForestNavigation() {
  const surface = (x:number,y:number,previousZ:number) => forestHeights(x,y)
    .filter(z=>Math.abs(z-previousZ)<.23&&stand(x,y,z)).sort((a,b)=>Math.abs(a-previousZ)-Math.abs(b-previousZ))[0];
  const clear=(a:Vector3,b:Vector3)=>{
    const n=Math.max(1,Math.ceil(a.distanceTo(b)/.065));let h=a.y-forestEyeHeight;
    for(let i=1;i<=n;i++) {
      const t=i/n;const z=surface(a.x+(b.x-a.x)*t,-a.z-(b.z-a.z)*t,h);
      if(z===undefined||Math.abs(z-(a.y+(b.y-a.y)*t-forestEyeHeight))>.13)return false;
      h=z;
    }
    return Math.abs(h-(b.y-forestEyeHeight))<.06;
  };
  const vertices:Vector3[]=[];const cells=new Map<string,number[]>();
  const step=.16;const key=(x:number,y:number)=>`${x},${y}`;
  for(let iy=0;iy<=86;iy++)for(let ix=0;ix<=102;ix++) {
    const x=-8.32+ix*step,y=-5.28+iy*step;
    for(const h of forestHeights(x,y))if(stand(x,y,h)) {
      const ids=cells.get(key(ix,iy))??[];ids.push(vertices.length);cells.set(key(ix,iy),ids);
      vertices.push(new Vector3(x,h+forestEyeHeight,-y));
    }
  }
  const edges=vertices.map(p=>{
    const ix=Math.round((p.x+8.32)/step),iy=Math.round((-p.z+5.28)/step),ids:number[]=[];
    for(const dx of [-1,0,1])for(const dy of [-1,0,1]) {
      if(!dx&&!dy)continue;
      for(const j of cells.get(key(ix+dx,iy+dy))??[])if(Math.abs(vertices[j].y-p.y)<.23&&clear(p,vertices[j]))ids.push(j);
    }
    return ids;
  });
  const nearest=(p:Vector3)=>vertices.map((v,id)=>({id,d:v.distanceToSquared(p)})).filter(v=>v.d<1).sort((a,b)=>a.d-b.d).find(v=>clear(p,vertices[v.id]))?.id;
  return {
    resolve(next:Vector3,previous:Vector3) {
      let x=previous.x,y=-previous.z,h=previous.y-forestEyeHeight;
      const dx=next.x-x,dy=-next.z-y,n=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.045));
      for(let i=0;i<n;i++) {
        let z=surface(x+dx/n,y+dy/n,h);
        if(z!==undefined){x+=dx/n;y+=dy/n;h=z;continue;}
        z=surface(x+dx/n,y,h);if(z!==undefined){x+=dx/n;h=z;}
        z=surface(x,y+dy/n,h);if(z!==undefined){y+=dy/n;h=z;}
      }
      next.set(x,h+forestEyeHeight,-y);return next.distanceToSquared(previous)>1e-8;
    },
    findPath(from:Vector3,to:Vector3):Vector3[]|null {
      // Floor hit includes a few millimetres of authored finish.
      const heights=forestHeights(to.x,-to.z);const h=heights.sort((a,b)=>Math.abs(a+forestEyeHeight-to.y)-Math.abs(b+forestEyeHeight-to.y))[0];
      if(h===undefined||Math.abs(h+forestEyeHeight-to.y)>.25)return null;
      const target=new Vector3(to.x,h+forestEyeHeight,to.z);
      if(!forestCanStand(target)||!forestCanStand(from))return null;
      if(clear(from,target))return [target];
      const start=nearest(from),goal=nearest(target);if(start===undefined||goal===undefined)return null;
      const open=new Set([start]),closed=new Set<number>(),cost=new Map([[start,0]]),parents=new Map<number,number>();
      while(open.size) {
        let id=-1,score=Infinity;
        for(const i of open){const f=cost.get(i)!+vertices[i].distanceTo(target);if(f<score){score=f;id=i;}}
        if(id===goal){
          const route=[target];let at=id;while(at!==start){route.unshift(vertices[at].clone());at=parents.get(at)!;}route.unshift(from.clone());
          const result:Vector3[]=[];at=0;while(at<route.length-1){let next=route.length-1;while(next>at+1&&!clear(route[at],route[next]))next--;result.push(route[next]);at=next;}return result;
        }
        open.delete(id);closed.add(id);
        for(const j of edges[id]){if(closed.has(j))continue;const c=cost.get(id)!+vertices[id].distanceTo(vertices[j]);if(c<(cost.get(j)??Infinity)){cost.set(j,c);parents.set(j,id);open.add(j);}}
      }
      return null;
    },
  };
}
