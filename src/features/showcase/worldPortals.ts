/** Matched first frames are rendered from the next world's actual camera rail.
 * The aperture lives in world space; screen UVs keep the incoming view stable. */
export const WORLD_PORTALS: Record<string, { position: number[]; size: number[]; rotation: number; next: string }> = {
  obsidian: {position:[17,1.8,-7.94],size:[3.5,2.3],rotation:0,next:'sculpture-pavilion'},
  'sculpture-pavilion': {position:[-12.91,1.74,0],size:[2.86,3.38],rotation:Math.PI/2,next:'forest-fold-house'},
};
export const portalPreview = (id: string, compact: boolean) => `/assets/showcases/cinematic/${id}-${compact?'mobile':'desktop'}.webp`;
