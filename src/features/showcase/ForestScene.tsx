import type { ComponentProps } from 'react';
import ObsidianScene, { type ShowcaseSceneConfig } from './ObsidianScene';
import { createForestNavigation, forestBounds, forestEyeHeight } from './forestNavigation';
import { forestRooms } from './forestRooms';
const config:ShowcaseSceneConfig={
  id:'forest-fold-house',title:'Forest Fold House',rooms:forestRooms,
  bounds:forestBounds,size:[20,18,8],center:[0,0,-.5],
  navigation:createForestNavigation,architecture:true,eyeHeight:forestEyeHeight,assetVersion:'?v=5',
  roomAt:p=>p.x>2.8?(p.y>3?3:5):p.x>-.9?(p.y>3?2:7):p.y>3?(p.z>.05?1:p.x>-4&&p.z<-1.5?6:0):4,
};
export default function ForestScene(props:ComponentProps<typeof ObsidianScene>){return <ObsidianScene {...props} config={config}/>;}
