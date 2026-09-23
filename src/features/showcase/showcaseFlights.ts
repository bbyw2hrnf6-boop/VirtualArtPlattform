import type { CameraFlight, FlightKey } from './cameraFlight';

const key = (at: number, position: number[], target: number[], label: string, fov = 55): FlightKey => ({ at, position, target, label, fov });

/** Authored Y-up rails. Interior bends pass through the shipped openings;
 * only the two explicit world portals cross a surface. */
const HOUSE_INTERIOR: FlightKey[] = [
  key(0, [-4.77,5.1,-5.1], [-4.77,5.1,-2.5], 'Through the front door', 68),
  key(1.5, [-4.77,5.1,-3], [-4.8,4.9,-1.3], 'At home', 68),
  key(3, [-4.85,5.1,-2.95], [-6,4.4,-2.2], 'Follow the light', 68),
  key(4, [-6,5.1,-2.95], [-6,4.2,-1], 'Down through the house', 68),
  key(5.5, [-6,3.65,-.4], [-6.7,3.4,.1], 'Down through the house', 68),
  key(6.4, [-6.05,3.4,.35], [-7.1,3.4,.3], 'Down through the house', 68),
  key(7.1, [-7.18,3.4,.35], [-7.18,2.6,-1.4], 'Down through the house', 68),
  key(8.6, [-7.18,1.85,-2.5], [-6,1.7,-3.1], 'Living in the forest', 68),
  key(9.4, [-7.12,1.7,-3.08], [-4.8,1.65,-2.9], 'Into the living room', 68),
  key(10.6, [-4.8,1.7,-3.08], [-4.7,1.6,-.4], 'Light, stone and linen', 68),
  key(12, [-4.75,1.7,-.75], [-.2,1.7,-.75], 'Open to the courtyard', 68),
  key(14, [.4,1.7,-.75], [5.3,1.6,-.75], 'Across the watercourt', 68),
  key(15.4, [4.1,1.7,-.75], [6,1.5,1.4], 'Beside the water', 68),
  key(16.8, [4.15,1.9,-.65], [.1,1.8,-.7], 'Back to the garden', 68),
  key(18, [.7,2,-.7], [.5,2.2,5], 'Two wings, one home', 68),
  key(20, [.3,4,8], [0,3,-.5], 'Architecture you can enter', 62),
  key(22, [-3,7.4,17], [0,3.1,-.2], 'Your world. Made walkable.', 58),
];
export const HOUSE_FLIGHT: CameraFlight = { duration: 38, keys: [
  key(0, [8,4.6,12], [0,3,-.5], 'Through the woodland', 62),
  key(2.5, [-10,7,12], [0,3.4,0], 'Two wings, one home', 60),
  key(5, [-12,7,-6], [-3,3.8,-1], 'Around the garden', 62),
  key(7, [-6.5,6,-8], [-4.77,5,-3.7], 'Forest entrance', 65),
  key(8.5, [-4.77,5.1,-5.1], [-4.77,5.1,-2.5], 'Through the front door', 68),
  key(9.5, [-4.77,5.1,-3], [-4.7,5.1,-.7], 'At home', 68),
  key(10.5, [-4.7,5.1,-.7], [4,5.1,-.7], 'Into the glass bridge', 68),
  key(12, [4.05,5.1,-.7], [6,4.7,0], 'Architect’s studio', 68),
  key(13, [4.15,5.1,-1.6], [6,4.7,0], 'Architect’s studio', 68),
  key(14, [4.05,5.1,-.7], [-4.7,5.1,-.7], 'Across the bridge', 68),
  key(16, [-.1,5.1,-.7], [-4.7,5.1,-.7], 'Across the bridge', 68),
  key(17, [-4.7,5.1,-.7], [-4.77,5.1,-3], 'At home', 68),
  key(18, [-4.77,5.1,-3], [-6,4.4,-2.2], 'Down through the house', 68),
  ...HOUSE_INTERIOR.filter(k=>k.at>=3).map(k => ({...k,at:k.at+16})),
] };

export const WORLD_FLIGHTS: Record<string, CameraFlight> = {
  obsidian: { duration: 12, keys: [
    key(0,[1.5,1.85,-1.5],[6,1.8,-7.5],'A place for art',62),
    key(2.5,[6.5,2,-1.9],[9,1.8,-6.5],'Botanical origins',62),
    key(4.5,[10.5,1.9,-3.3],[14,1.8,-4],'Through light and stone',62),
    key(6,[12.5,1.85,-3.4],[17,1.8,-7.97],'Living matter',62),
    key(8,[16,1.8,-5.5],[17,1.8,-7.97],'A world within the work',60),
    key(10,[17,1.8,-6.6],[17,1.8,-8.5],'The image becomes a doorway',60),
    key(12,[17,1.8,-7.88],[17,1.8,-8.5],'Step into another world',60),
  ] },
  'sculpture-pavilion': { duration: 14, keys: [
    key(0,[-7,1.85,-1.8],[1,1.9,0],'Art becomes form',62),
    key(2,[-3,2.15,-2],[1,2.1,0],'Rooted silence',62),
    key(4,[3.5,2.4,-2.6],[1,2.1,0],'Space around the work',62),
    key(6,[6,2.2,.5],[1,2,0],'Stone, bronze and daylight',62),
    key(8,[1,2,3],[-3,1.9,4],'Living form',62),
    key(10,[-6,1.85,1.8],[-12.8,1.85,0],'Another door opens',62),
    key(11.5,[-9,1.85,0],[-14,1.85,0],'From sculpture to architecture',62),
    key(14,[-12.85,1.85,0],[-14,1.85,0],'Welcome home',62),
  ] },
  'forest-fold-house': { duration: 22, keys: HOUSE_INTERIOR },
};

export const ENTRY_FLIGHTS: Record<string, CameraFlight> = {
  obsidian: { duration: 26, landAtEnd: true, keys: [
    key(0,[1.5,1.75,-1.5],[6,1.8,-7.97],'Botanical origins',62),
    key(4,[7,1.9,-1.6],[6,1.8,-7.97],'Through light and stone',62),
    key(7,[10.5,1.85,-3.4],[15,1.8,-4],'Through light and stone',64),
    key(10,[13.6,1.85,-3.4],[17,1.8,-7.97],'Living matter',64),
    key(14,[19.5,1.9,-2.8],[21,1.8,-4],'Living matter',62),
    key(17,[23,1.85,-3.3],[28,1.8,-7.97],'Future nature',64),
    key(21,[28,1.9,-2],[31,1.8,-4],'Future nature',62),
    key(26,[31,1.75,-4],[33.97,1.8,-4],'Your visit begins',60),
  ] },
  'sculpture-pavilion': { duration: 28, landAtEnd: true, keys: [
    key(0,[-7,1.75,-1.8],[1,2,0],'Sculpture atrium',64),
    key(4,[-1.5,2.15,-2.5],[1,2.1,0],'Rooted silence',64),
    key(7,[5,2.3,-2],[1,2,0],'Rooted silence',64),
    key(10,[8,2.1,0],[17,2.7,0],'Into the glass gallery',64),
    key(13,[13,2,2.5],[17,2.7,0],'Aerial bloom',64),
    key(15,[18.4,2.1,3.4],[17,2.7,0],'Light held in glass',64),
    key(17,[19.5,2.1,0],[17,2.7,0],'Aerial bloom',64),
    key(19,[18,2,-4],[17,2.7,0],'Aerial bloom',64),
    key(21,[17,2,-7],[15,2.2,-13],'Through the next doorway',64),
    key(24,[17,2,-12],[8,2,-15],'The kinetic hall',64),
    key(28,[13,1.75,-11.9],[8,1.8,-15],'Your visit begins',60),
  ] },
  'forest-fold-house': HOUSE_FLIGHT,
};

export type TourStop = { label: string; position: number[]; target: number[] };
export const SHOWCASE_STOPS: Record<string, TourStop[]> = {
  obsidian: [
    {label:'Canopy of Tomorrow',position:[6,1.75,-6],target:[6,1.8,-7.97]},
    {label:'Glass Fern',position:[9,1.75,-2],target:[9,1.8,-.03]},
    {label:'Tidal Memory',position:[17,1.75,-6],target:[17,1.8,-7.97]},
    {label:'Terra Bloom',position:[15,1.75,-2],target:[15,1.8,-.03]},
    {label:'Symbiotic Horizons',position:[28,1.75,-6],target:[28,1.8,-7.97]},
    {label:'Living Stone',position:[31.5,1.75,-4],target:[33.97,1.8,-4]},
  ],
  'sculpture-pavilion': [
    {label:'Rooted Silence',position:[-1.7,1.75,-2],target:[1,1.8,0]},
    {label:'Tidal Bronze',position:[-5,1.75,-2],target:[-3,1.7,-4]},
    {label:'Growth Fold',position:[-5,1.75,2],target:[-3,1.5,4]},
    {label:'Aerial Bloom',position:[14,1.75,2.5],target:[17,2.7,0]},
    {label:'Gentle Engine',position:[2.5,1.75,-12],target:[8,1.8,-15]},
  ],
};
