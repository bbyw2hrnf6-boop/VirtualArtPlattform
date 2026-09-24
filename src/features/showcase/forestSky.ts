import { Color, DataTexture, DataUtils, EquirectangularReflectionMapping, HalfFloatType, LinearFilter, LinearSRGBColorSpace, RGBAFormat, Vector3 } from 'three';

/** A static woodland sky, shared by the visible background and reflection
 * capture. Values are authored/interpolated in linear light, including the
 * restrained HDR solar glow, rather than brightening the mastered room bake. */
export function createForestSky() {
  const width = 256, height = 128, sun = new Vector3(-14, 15, 16).normalize();
  const make = (night: boolean) => {
    const data = new Uint16Array(width * height * 4);
    const horizon = new Color(night ? '#263342' : '#dfdfcb');
    const zenith = new Color(night ? '#061326' : '#5c94c5');
    const ground = new Color(night ? '#080e0b' : '#3f4338');
    const glow = new Color('#fff0bd'), color = new Color(), direction = new Vector3();
    for (let y = 0; y < height; y++) {
      // Matches Three's equirectUv: v = asin(direction.y) / PI + .5.
      const elevation = ((y + .5) / height - .5) * Math.PI;
      const up = Math.sin(elevation), radius = Math.cos(elevation);
      for (let x = 0; x < width; x++) {
        const azimuth = ((x + .5) / width - .5) * Math.PI * 2;
        direction.set(radius * Math.cos(azimuth), up, radius * Math.sin(azimuth));
        color.copy(horizon).lerp(up >= 0 ? zenith : ground, Math.pow(Math.abs(up), up >= 0 ? .6 : .28));
        if (!night && up > 0) {
          const strength = .85 * Math.pow(Math.max(0, direction.dot(sun)), 96);
          color.r += glow.r * strength; color.g += glow.g * strength; color.b += glow.b * strength;
        }
        const offset = (y * width + x) * 4;
        data[offset] = DataUtils.toHalfFloat(color.r);
        data[offset + 1] = DataUtils.toHalfFloat(color.g);
        data[offset + 2] = DataUtils.toHalfFloat(color.b);
        data[offset + 3] = DataUtils.toHalfFloat(1);
      }
    }
    const texture = new DataTexture(data, width, height, RGBAFormat, HalfFloatType);
    texture.name = night ? 'Forest blue-hour sky' : 'Forest sunny afternoon sky';
    texture.mapping = EquirectangularReflectionMapping;
    texture.colorSpace = LinearSRGBColorSpace;
    texture.minFilter = texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
    return texture;
  };
  const day = make(false), night = make(true);
  return { day, night, dispose() { day.dispose(); night.dispose(); } };
}
