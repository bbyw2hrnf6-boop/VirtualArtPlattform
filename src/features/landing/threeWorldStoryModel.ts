export const WORLD_STORY_DURATION = 48;
export const WORLD_CHAPTERS = [
  {id:'obsidian',name:'Obsidian',heading:'A world within the work.',copy:'Enter an exhibition shaped around art, light and atmosphere.',start:0,end:12,cover:'/assets/showcases/obsidian/cover.webp'},
  {id:'sculpture-pavilion',name:'Sculpture Pavilion',heading:'Give form another dimension.',copy:'Move around objects. Discover materials, scale and the space between.',start:12,end:26,cover:'/assets/showcases/sculpture-pavilion/cover.webp?v=2'},
  {id:'forest-fold-house',name:'Forest Fold House',heading:'Imagine it. Then walk inside.',copy:'From galleries and sculptural worlds to architecture you can enter. Individually authored, beyond the Studio.',start:26,end:48,cover:'/assets/showcases/forest-fold-house/cover.webp?v=3'},
] as const;
export function worldFrame(progress: number) {
  const p=Math.max(0,Math.min(1,progress)), time=p*WORLD_STORY_DURATION;
  const index=time<12?0:time<26?1:2, chapter=WORLD_CHAPTERS[index];
  const local=(time-chapter.start)/(chapter.end-chapter.start);
  return {index,local,chapter,portal:index<2?Math.max(0,(local-.985)/.015):0};
}
