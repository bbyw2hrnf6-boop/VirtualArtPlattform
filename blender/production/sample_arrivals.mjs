// Node samples the same centripetal Three.js curve used by GalleryScene.
// This is asset authoring, independent of browser automation.
import { readFileSync, writeFileSync } from 'node:fs';
import { CatmullRomCurve3, Vector3 } from 'three';
const paths = JSON.parse(readFileSync(new URL('../../src/features/gallery/scene/roomIntroductions.json', import.meta.url)));
const ease = t => t < .14 ? t*t/(.28*.86) : t > .86 ? 1-(1-t)**2/(.28*.86) : (t-.07)/.86;
const result = {};
for (const [room, path] of Object.entries(paths)) {
  const curve = new CatmullRomCurve3(path.positions.map(p => new Vector3(...p)), false, 'centripetal', .38);
  const looks = new CatmullRomCurve3(path.looks.map(p => new Vector3(...p)), false, 'centripetal', .38);
  const seconds = Math.max(6.5, curve.getLength()/1.075), frames = Math.ceil(seconds*24);
  result[room] = { fps:24, seconds, length:curve.getLength(), frames:Array.from({length:frames+1}, (_, i) => ({
    position:curve.getPointAt(ease(i/frames)).toArray(), look:looks.getPointAt(ease(i/frames)).toArray(),
  })) };
}
writeFileSync(new URL('./v3/arrival-samples.json', import.meta.url), JSON.stringify(result));
console.log(Object.fromEntries(Object.entries(result).map(([room, path]) => [room, {seconds:path.seconds, metres:path.length}])));
