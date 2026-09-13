import { MathUtils } from 'three';

export const WALK_FOV_MIN = 40;
export const WALK_FOV_MAX = 90;
export const defaultWalkFov = (compact: boolean) => compact ? 78 : 62;
export const defaultWalkPace = (templateId: string) => templateId === 'pavilion' ? 1.25 : 1;
export const clampWalkFov = (value: number) => MathUtils.clamp(value, WALK_FOV_MIN, WALK_FOV_MAX);

/** Camera-session preferences, never draft/profile data. Native disclosure keeps
 * focus/keyboard input out of the canvas without making exploration modal. */
export function createWalkPreferences(canvas: HTMLCanvasElement, defaultPace: number, onChange: () => void) {
  const initialFov = defaultWalkFov(window.matchMedia('(max-width: 767px), (pointer: coarse)').matches);
  let fov = initialFov, pace = defaultPace;
  const panel = document.createElement('details');
  panel.className = 'walk-preferences';
  panel.hidden = true;
  panel.innerHTML = `<summary>View &amp; pace</summary><div>
    <label>Field of view <output></output><input type="range" min="40" max="90" step="1" aria-label="Field of view"></label>
    <label>Walking speed <output></output><input type="range" min="0.5" max="2" step="0.25" aria-label="Walking speed"></label>
    <small>Higher = wider / faster.<br>Only for this room session.</small>
    <button type="button">Reset settings</button></div>`;
  const [fovInput, paceInput] = panel.querySelectorAll('input');
  const [fovOutput, paceOutput] = panel.querySelectorAll('output');
  const render = () => {
    fovInput.value = String(fov); paceInput.value = String(pace);
    fovOutput.value = `${Math.round(fov)}°`; paceOutput.value = `${pace}×`;
    canvas.dataset.walkFov = String(fov); canvas.dataset.walkPace = String(pace);
  };
  const update = () => { render(); onChange(); };
  fovInput.oninput = () => { fov = clampWalkFov(Number(fovInput.value)); update(); };
  paceInput.oninput = () => { pace = MathUtils.clamp(Number(paceInput.value), .5, 2); update(); };
  panel.querySelector('button')!.onclick = () => { fov = initialFov; pace = defaultPace; update(); };
  panel.onkeydown = (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation(); panel.open = false;
    panel.querySelector('summary')!.focus();
  };
  canvas.parentElement!.appendChild(panel);
  render();
  return {
    fov: () => fov,
    pace: () => pace,
    setFov: (value: number) => { fov = clampWalkFov(value); render(); },
    show: (visible: boolean) => { panel.hidden = !visible; if (!visible) panel.open = false; },
    dispose: () => panel.remove(),
  };
}
