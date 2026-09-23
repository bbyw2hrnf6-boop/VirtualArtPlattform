import type { CameraFlight, FlightKey } from './cameraFlight';

const key = (at: number, position: number[], target: number[], label: string, fov = 55): FlightKey => ({ at, position, target, label, fov });

/** Metres in the shipped Y-up scenes. Deliberate cinematic shell crossings
 * belong only to these rails; guided visits use the collision/navigation graph. */
export const HOUSE_FLIGHT: CameraFlight = { duration: 36, keys: [
  key(0, [8,4.6,12], [0,3,-.5], 'Through the woodland', 62),
  key(5, [-3,7,14], [0,3.4,0], 'Two wings, one home', 55),
  key(9, [-5,7.2,8], [0,4,-.6], 'Above the watercourt', 58),
  key(12, [.4,5.1,2.8], [3.8,5.1,-.7], 'Into the glass bridge'),
  key(15, [2.7,5.1,-.7], [6,4.8,0], 'The architect’s studio'),
  key(18, [5.6,5.05,1.7], [4,4.8,-1], 'A place to create', 58),
  key(21, [.2,5.1,-.7], [-5,4.8,1], 'Across the bridge'),
  key(24, [-4.2,5.1,1.4], [-6.3,4.5,2], 'Quiet above the forest', 58),
  key(27, [-4.45,1.7,-.5], [-5.7,1.2,2], 'Living in the canopy', 58),
  key(30, [4.05,1.7,-.7], [5.6,1,1], 'Beside the water', 58),
  key(33, [4,3,9], [0,2.7,0], 'Back into the garden', 58),
  key(36, [-3,8,18], [0,3.1,-.2], 'Forest Fold House', 55),
] };

export const WORLD_FLIGHTS: Record<string, CameraFlight> = {
  obsidian: { duration: 22, keys: [
    key(0,[1.5,1.8,-1.5],[6,1.8,-6.5],'A place for art'),
    key(5,[4,2.1,-2],[7,1.8,-7.9],'Botanical origins',52),
    key(9,[9,1.9,-3],[16,1.8,-4],'Through light and stone'),
    key(13,[14,1.85,-3],[17,1.8,-7.97],'Living matter'),
    key(17,[17,1.8,-5],[17,1.8,-7.97],'A world inside an image',50),
    key(22,[17,1.8,-7.85],[17,1.8,-8.5],'Into the artwork',45),
  ] },
  'sculpture-pavilion': { duration: 20, keys: [
    key(0,[-7,1.8,-1.8],[1,1.8,0],'Art becomes form'),
    key(4,[-4,2.15,-2.6],[1,2.1,0],'Rooted silence',52),
    key(8,[3.5,2.4,-3],[1,2.2,0],'Space around the work',52),
    key(12,[5.5,2.5,2],[1,2,0],'Stone, bronze and daylight'),
    key(16,[-.5,2.2,-3.2],[-3,1.7,-4],'Enter another dimension',50),
    key(20,[-2.9,1.7,-3.95],[-3.3,1.7,-4.6],'Through the bronze',45),
  ] },
  'forest-fold-house': { duration: 22, keys: [
    key(0,[.4,5.1,-.7],[4,5.1,-.7],'Form becomes a home'),
    key(4,[4.15,5.1,-1.6],[6,4.5,0],'A place to imagine',58),
    key(8,[-4.2,5.1,1.4],[-6.4,4.5,2.2],'Rooms with a view',58),
    key(12,[-4.45,1.7,-.5],[-5.7,1.2,2],'Life in the forest',58),
    key(16,[4.05,1.7,-.7],[5.6,1,1],'Architecture you can enter',58),
    key(19,[4,4,10],[0,2.5,0],'Beyond the Studio',58),
    key(22,[-3,8,18],[0,3.1,-.2],'Your world. Made walkable.',55),
  ] },
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
