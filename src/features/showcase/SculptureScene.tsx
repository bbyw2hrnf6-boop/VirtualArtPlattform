import type { ComponentProps } from 'react';
import ObsidianScene, { type ShowcaseSceneConfig } from './ObsidianScene';
import { createPavilionNavigation, pavilionBounds } from './pavilionNavigation';
import data from './sculpture-pavilion.json';
const config: ShowcaseSceneConfig = {
  id:'sculpture-pavilion',title:'Sculpture Pavilion',rooms:data.rooms,
  bounds:pavilionBounds,size:[37,28,8],center:[5.5,0,-6],
  navigation:createPavilionNavigation,sculpture:true,assetVersion:'?v=2',
  roomAt:p=>p.z < -9 ? 2 : p.x > 10 ? 1 : 0,
};
export default function SculptureScene(props:ComponentProps<typeof ObsidianScene>){return <ObsidianScene {...props} config={config}/>;}
