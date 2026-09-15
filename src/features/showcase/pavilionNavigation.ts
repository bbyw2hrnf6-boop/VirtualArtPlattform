import { Vector3 } from 'three';

/** Same metric envelope as the Blender plan. World z is minus plan northing. */
export const pavilionBounds = { minX: -12.73, maxX: 23.73, minZ: -19.73, maxZ: 7.73 };
const clearance = Array.from({length:16},(_,i)=>[.28*Math.cos(i*Math.PI/8),.28*Math.sin(i*Math.PI/8)]);
const plinths = [[1,0,1.29],[-3,4,.95],[-3,-4,.95]];
const plaques = [[-.3,0],[-4.3,4],[-4.3,-4],[15.7,0],[3.9,15]];
function inside(x: number, y: number) {
  const round = (cx: number, cy: number, w: number, h: number) => {
    const dx = Math.max(0, Math.abs(x - cx) - (w / 2 - 3));
    const dy = Math.max(0, Math.abs(y - cy) - (h / 2 - 3));
    return dx * dx + dy * dy <= 9;
  };
  return x*x/100+y*y/64 <= 1 || round(17,0,14,12) || round(8,15,24,10)
    || (x>=7 && x<=13 && Math.abs(y)<=2) || (x>=1.5 && x<=5.5 && y>=6 && y<=12)
    || (x>=15 && x<=19 && y>=4 && y<=12) || (x>=-12.96 && x<=-8 && Math.abs(y)<=1.5);
}
export function pavilionCanStand(x: number, y: number, margin = 0): boolean {
  if (!Number.isFinite(x+y) || !inside(x,y)) return false;
  for (const [dx,dy] of clearance) if (!inside(x+dx*(1+margin/.28),y+dy*(1+margin/.28))) return false;
  if (plinths.some(([cx,cy,r]) => Math.hypot(x-cx,y-cy)<r+margin)) return false;
  if ((x-17)**2/(2.1+margin)**2 + y*y/(1.7+margin)**2 < 1) return false;
  if (Math.abs(x-8)<4.13+margin && Math.abs(y-15)<2.28+margin) return false;
  if (Math.abs(x-21)<1.51+margin && Math.abs(y+3)<.73+margin) return false;
  // Small freestanding object labels are real obstacles too.
  return !plaques.some(([cx,cy])=>Math.abs(x-cx)<.5+margin && Math.abs(y-cy)<.42+margin);
}
export function createPavilionNavigation() {
  const clear = (a: Vector3,b: Vector3) => {
    const n=Math.ceil(a.distanceTo(b)/.04);
    for(let i=0;i<=n;i++) {
      const t=n?i/n:0;
      // Extra clearance covers the distance between samples, including diagonal corners.
      if(!pavilionCanStand(a.x+(b.x-a.x)*t,-a.z-(b.z-a.z)*t,i>0&&i<n?.025:0))return false;
    }
    return true;
  };
  const step=.4, width=95, height=73;
  const point=(id:number,y=1.75)=>new Vector3(-13+(id%width)*step,y,8-Math.floor(id/width)*step);
  const grid=Uint8Array.from({length:width*height},(_,id)=>{const p=point(id);return Number(pavilionCanStand(p.x,-p.z));});
  const vertices=Array.from(grid.keys()).filter(i=>grid[i]).map(id=>({id,p:point(id)}));
  const nearest=(p:Vector3)=>vertices.map(v=>({id:v.id,d:v.p.distanceToSquared(p)})).sort((a,b)=>a.d-b.d).find(v=>clear(p,point(v.id,p.y)))?.id??-1;
  return {
    resolve(next:Vector3,previous:Vector3) {
      let x=previous.x,y=-previous.z;const dx=next.x-x,dy=-next.z-y;const n=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.07));
      for(let i=0;i<n;i++){if(pavilionCanStand(x+dx/n,y))x+=dx/n;if(pavilionCanStand(x,y+dy/n))y+=dy/n;}
      next.set(x,previous.y,-y);return next.distanceToSquared(previous)>1e-8;
    },
    findPath(from:Vector3,to:Vector3):Vector3[]|null {
      if(!pavilionCanStand(to.x,-to.z))return null;
      if(clear(from,to))return [to.clone()];
      const start=nearest(from),goal=nearest(to);if(start<0||goal<0)return null;
      const goalPoint=point(goal),heuristic=Float64Array.from({length:grid.length},(_,id)=>point(id).distanceTo(goalPoint));
      const open=new Set([start]),closed=new Set<number>(),cost=new Map([[start,0]]),parent=new Map<number,number>();
      while(open.size){
        let id=-1,score=Infinity;
        for(const i of open){const f=cost.get(i)!+heuristic[i];if(f<score){score=f;id=i;}}
        if(id===goal){
          const route=[to.clone()];let j=id;while(j!==start){route.unshift(point(j,from.y));j=parent.get(j)!;}route.unshift(from.clone());
          const smooth:Vector3[]=[];let at=0;while(at<route.length-1){let next=route.length-1;while(next>at+1&&!clear(route[at],route[next]))next--;smooth.push(route[next]);at=next;}return smooth;
        }
        open.delete(id);closed.add(id);
        for(const dy of [-1,0,1])for(const dx of [-1,0,1]){
          if(!dx&&!dy)continue;const col=id%width+dx,row=Math.floor(id/width)+dy;if(col<0||col>=width||row<0||row>=height)continue;
          const j=row*width+col;if(!grid[j]||closed.has(j)||!clear(point(id),point(j)))continue;
          const c=cost.get(id)!+Math.hypot(dx,dy)*step;if(c<(cost.get(j)??Infinity)){parent.set(j,id);cost.set(j,c);open.add(j);}
        }
      }
      return null;
    },
  };
}
