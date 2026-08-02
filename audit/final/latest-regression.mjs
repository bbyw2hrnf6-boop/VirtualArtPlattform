import { mkdir, readFile, writeFile } from 'node:fs/promises';

const endpoint = 'http://127.0.0.1:9333';
const baseUrl = 'http://127.0.0.1:5174';
const outDir = new URL('./', import.meta.url);
await mkdir(outDir, { recursive: true });

const target = await fetch(`${endpoint}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });

let sequence = 0;
let stage = 'bootstrap';
const pending = new Map();
const events = new Map();
const diagnostics = [];
socket.addEventListener('message', ({ data }) => {
  const message = JSON.parse(String(data));
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'warn'].includes(message.params.type)) {
    diagnostics.push({ stage, type: message.params.type, message: message.params.args.map((arg) => arg.value ?? arg.description ?? arg.type).join(' ') });
  }
  if (message.method === 'Runtime.exceptionThrown') diagnostics.push({ stage, type: 'exception', message: message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text });
  if (message.method === 'Log.entryAdded' && ['error', 'warning'].includes(message.params.entry.level)) diagnostics.push({ stage, type: message.params.entry.level, message: message.params.entry.text, url: message.params.entry.url });
  const listeners = events.get(message.method);
  if (listeners) listeners.splice(0).forEach((resolve) => resolve(message.params));
});

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
function once(method, timeout = 7000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${method}`)), timeout);
    const listeners = events.get(method) ?? [];
    listeners.push((value) => { clearTimeout(timer); resolve(value); });
    events.set(method, listeners);
  });
}
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function evaluate(expression) {
  const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result.value;
}
async function waitFor(expression, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return true;
    await wait(200);
  }
  return false;
}
async function viewport(width, height, mobile = false) {
  await command('Emulation.clearDeviceMetricsOverride').catch(() => undefined);
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height });
}
async function navigate(path, delay = 700) {
  const loaded = once('Page.loadEventFired').catch(() => null);
  await command('Page.navigate', { url: `${baseUrl}${path}` });
  await loaded;
  await wait(delay);
}
async function reload(delay = 800) {
  const loaded = once('Page.loadEventFired').catch(() => null);
  await command('Page.reload');
  await loaded;
  await wait(delay);
}
async function screenshot(name) {
  const image = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(new URL(`${name}.png`, outDir), Buffer.from(image.data, 'base64'));
}

await Promise.all([command('Page.enable'), command('Runtime.enable'), command('Log.enable'), command('DOM.enable')]);
const report = { runAt: new Date().toISOString(), target: baseUrl, checks: [], diagnostics };
const check = (name, pass, details) => report.checks.push({ name, pass: Boolean(pass), details });

await command('Storage.clearDataForOrigin', { origin: baseUrl, storageTypes: 'all' });

stage = 'landing-desktop';
await viewport(1440, 1000);
await navigate('/#/', 600);
await evaluate(`new Promise((resolve) => { try { localStorage.clear(); } catch {} const request = indexedDB.deleteDatabase('aura-gallery-editor'); request.onsuccess = () => resolve(true); request.onerror = request.onblocked = () => resolve(false); })`);
await evaluate(`scrollTo(0, 0)`);
report.landingDesktop = await evaluate(`({
  h1: document.querySelector('h1')?.innerText,
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  heroImage: document.querySelector('.hero-gallery-visual img')?.naturalWidth,
  showcaseImages: [...document.querySelectorAll('.room-showcase img')].map((image) => ({ src: image.getAttribute('src'), width: image.naturalWidth, complete: image.complete }))
})`);
check('desktop landing and real room showcase render', report.landingDesktop.overflowX === 0 && report.landingDesktop.heroImage > 0 && report.landingDesktop.showcaseImages.length === 3, report.landingDesktop);
await screenshot('regression-landing-desktop');

stage = 'landing-mobile';
await viewport(390, 844, true);
await evaluate(`scrollTo(0, 0)`);
await wait(250);
report.landingMobile = await evaluate(`({
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  hero: document.querySelector('.hero')?.getBoundingClientRect().toJSON(),
  ctas: [...document.querySelectorAll('.hero-actions button')].map((button) => ({ text: button.innerText, rect: button.getBoundingClientRect().toJSON() }))
})`);
check('mobile landing has no overflow and 44px hero actions', report.landingMobile.overflowX === 0 && report.landingMobile.ctas.every((item) => item.rect.height >= 44), report.landingMobile);
await screenshot('regression-landing-mobile');

stage = 'template-picker';
await viewport(1440, 1000);
await navigate('/#/create', 650);
report.picker = await evaluate(`({
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  previewImages: [...document.querySelectorAll('.template-preview img')].map((image) => ({ src: image.getAttribute('src'), width: image.naturalWidth, height: image.naturalHeight, complete: image.complete })),
  miniRooms: document.querySelectorAll('.template-preview .mini-room').length
})`);
check('picker uses three actual distinct renderer images', report.picker.overflowX === 0 && report.picker.previewImages.length === 3 && new Set(report.picker.previewImages.map((item) => item.src)).size === 3 && report.picker.previewImages.every((item) => item.complete && item.width > 500) && report.picker.miniRooms === 0, report.picker);
await screenshot('regression-template-picker');

stage = 'editor-arrange';
await navigate('/#/create/white-cube', 700);
await waitFor(`document.querySelector('.gallery-scene')?.dataset.captureReady === 'true'`, 10000);
await wait(500);
await evaluate(`(() => { const canvas = document.querySelector('.gallery-scene canvas'); window.__qaCanvas = canvas; canvas.dataset.qaIdentity = 'latest-regression'; })()`);
await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: 880, y: 480, button: 'left', buttons: 1, clickCount: 1 });
for (const x of [920, 960, 1000, 1040]) await command('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: 480, button: 'left', buttons: 1 });
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 1040, y: 480, button: 'left', buttons: 0, clickCount: 1 });
await wait(1200);
const arrangeCamera = await evaluate(`document.querySelector('.gallery-scene')?.dataset.cameraPosition`);
report.arrange = await evaluate(`({
  hash: location.hash,
  view: document.querySelector('.gallery-scene')?.dataset.editorView,
  mode: document.querySelector('.gallery-scene')?.dataset.sceneMode,
  editing: document.querySelector('.gallery-scene')?.dataset.editing,
  rendererPersistent: document.querySelector('.gallery-scene')?.dataset.rendererPersistent,
  canvasPersistent: window.__qaCanvas === document.querySelector('.gallery-scene canvas'),
  camera: document.querySelector('.gallery-scene')?.dataset.cameraPosition,
  controls: [...document.querySelectorAll('[data-scene-mode-option]')].map((button) => ({ mode: button.dataset.sceneModeOption, pressed: button.getAttribute('aria-pressed') }))
})`);
check('direct template opens stable Arrange renderer', report.arrange.hash === '#/create/white-cube' && report.arrange.view === 'arrange' && report.arrange.mode === 'arrange' && report.arrange.editing === 'enabled' && report.arrange.canvasPersistent && report.arrange.rendererPersistent === 'true', report.arrange);
await screenshot('regression-editor-arrange-desktop');

stage = 'editor-walk';
await evaluate(`document.querySelector('[data-scene-mode-option="walk-preview"]')?.click()`);
await waitFor(`document.querySelector('.gallery-scene')?.dataset.transition === 'idle' && document.querySelector('.gallery-scene')?.dataset.sceneMode === 'walk'`, 3000);
report.walkPreview = await evaluate(`({
  view: document.querySelector('.gallery-scene')?.dataset.editorView,
  mode: document.querySelector('.gallery-scene')?.dataset.sceneMode,
  editing: document.querySelector('.gallery-scene')?.dataset.editing,
  interaction: document.querySelector('.gallery-scene canvas')?.dataset.interaction,
  canvasPersistent: window.__qaCanvas === document.querySelector('.gallery-scene canvas'),
  hint: document.querySelector('.gallery-scene .scene-hint')?.innerText,
  camera: document.querySelector('.gallery-scene')?.dataset.cameraPosition
})`);
check('Walk Preview reuses canvas and locks scene editing', report.walkPreview.view === 'walk-preview' && report.walkPreview.mode === 'walk' && report.walkPreview.editing === 'disabled' && report.walkPreview.interaction === 'walk' && report.walkPreview.canvasPersistent && report.walkPreview.hint.includes('EDITING LOCKED'), report.walkPreview);
await screenshot('regression-editor-walk-desktop');
await evaluate(`document.querySelector('[data-scene-mode-option="arrange"]')?.click()`);
await waitFor(`document.querySelector('.gallery-scene')?.dataset.transition === 'idle' && document.querySelector('.gallery-scene')?.dataset.sceneMode === 'arrange'`, 3000);
report.arrangeRestored = await evaluate(`({
  camera: document.querySelector('.gallery-scene')?.dataset.cameraPosition,
  editing: document.querySelector('.gallery-scene')?.dataset.editing,
  canvasPersistent: window.__qaCanvas === document.querySelector('.gallery-scene canvas')
})`);
const cameraDelta = (left, right) => left.split(',').reduce((sum, value, index) => sum + Math.abs(Number(value) - Number(right.split(',')[index])), 0);
report.arrangeRestored.cameraDelta = cameraDelta(arrangeCamera, report.arrangeRestored.camera);
check('Arrange restores its camera and editing state', report.arrangeRestored.cameraDelta < .1 && report.arrangeRestored.editing === 'enabled' && report.arrangeRestored.canvasPersistent, report.arrangeRestored);

stage = 'publish-cover';
await evaluate(`[...document.querySelectorAll('button')].find((button) => button.innerText.toLowerCase().includes('review & publish'))?.click()`);
await waitFor(`document.querySelector('.publish-cover-review img')?.naturalWidth > 0`, 5000);
report.publishCover = await evaluate(`(() => {
  const image = document.querySelector('.publish-cover-review img');
  if (!image) return { visible: false };
  const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 36;
  const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, 48, 36);
  const pixels = context.getImageData(0, 0, 48, 36).data; let minimum = 255; let maximum = 0; let total = 0; let totalSquared = 0; let count = 0;
  for (let index = 0; index < pixels.length; index += 16) { const value = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3; minimum = Math.min(minimum, value); maximum = Math.max(maximum, value); total += value; totalSquared += value * value; count += 1; }
  const mean = total / count; const deviation = Math.sqrt(totalSquared / count - mean * mean);
  return { visible: true, sourcePrefix: image.src.slice(0, 24), natural: [image.naturalWidth, image.naturalHeight], variance: { minimum, maximum, deviation }, lastCapture: document.querySelector('.gallery-scene')?.dataset.lastCapture, alt: image.alt };
})()`);
check('publish review shows a non-blank captured room cover', report.publishCover.visible && report.publishCover.sourcePrefix.startsWith('data:image/') && report.publishCover.natural[0] >= 500 && report.publishCover.variance.maximum - report.publishCover.variance.minimum > 40 && report.publishCover.variance.deviation > 8 && Boolean(report.publishCover.lastCapture), report.publishCover);
await screenshot('regression-publish-cover');
await evaluate(`document.querySelector('[aria-label="Close publish review"]')?.click()`);

stage = 'direct-recovery';
await evaluate(`(() => { const input = document.querySelector('.studio-title input[aria-label="Gallery title"]'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, 'Direct recovery QA'); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await waitFor(`document.querySelector('.draft-save-status')?.innerText === 'Saved locally'`, 5000);
await reload(700);
await waitFor(`Boolean(document.querySelector('.recovery-dialog'))`, 5000);
report.directRecovery = await evaluate(`({
  hash: location.hash,
  pickerVisible: Boolean(document.querySelector('.template-grid')),
  studioVisible: Boolean(document.querySelector('.studio')),
  recoveryVisible: Boolean(document.querySelector('.recovery-dialog')),
  summary: document.querySelector('.recovery-dialog')?.innerText,
  focused: Boolean(document.activeElement?.closest('.recovery-dialog'))
})`);
check('direct-template refresh immediately offers recovery', report.directRecovery.hash === '#/create/white-cube' && !report.directRecovery.pickerVisible && report.directRecovery.studioVisible && report.directRecovery.recoveryVisible && report.directRecovery.focused, report.directRecovery);
await screenshot('regression-direct-recovery');
await evaluate(`[...document.querySelectorAll('.recovery-dialog button')].find((button) => button.innerText.toLowerCase().includes('recover'))?.click()`);
await wait(500);
report.recoveredTitle = await evaluate(`document.querySelector('.studio-title input[aria-label="Gallery title"]')?.value`);
check('recovered direct-template title is exact', report.recoveredTitle === 'Direct recovery QA', report.recoveredTitle);

stage = 'editor-mobile';
await viewport(390, 844, true);
await wait(350);
report.editorMobile = await evaluate(`({
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  view: document.querySelector('.gallery-scene')?.dataset.editorView,
  sheet: document.querySelector('.tool-panel')?.className,
  switchRect: document.querySelector('.builder-scene-controls')?.getBoundingClientRect().toJSON(),
  canvas: document.querySelector('.gallery-scene canvas')?.getBoundingClientRect().toJSON()
})`);
check('mobile editor fits and keeps view controls available', report.editorMobile.overflowX === 0 && report.editorMobile.view === 'arrange' && Boolean(report.editorMobile.switchRect), report.editorMobile);
await screenshot('regression-editor-mobile');

stage = 'danny-mobile';
await navigate('/#/demo', 600);
await waitFor(`Number(document.querySelector('.gallery-scene')?.dataset.artworkTargets) > 0`, 16000);
await evaluate(`[...document.querySelectorAll('.view-switch button')].find((button) => button.innerText.toLowerCase().includes('overview'))?.click()`);
await wait(450);
await evaluate(`[...document.querySelectorAll('.view-switch button')].find((button) => button.innerText.toLowerCase().includes('walk'))?.click()`);
await wait(500);
report.dannyMobileBefore = await evaluate(`(() => {
  const caption = document.querySelector('.viewer-caption')?.getBoundingClientRect(); const hint = document.querySelector('.movement-hint')?.getBoundingClientRect();
  const overlap = Boolean(caption && hint && caption.left < hint.right && caption.right > hint.left && caption.top < hint.bottom && caption.bottom > hint.top);
  const body = document.querySelector('.viewer-caption > p:last-child');
  return { overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, caption: caption?.toJSON(), hint: hint?.toJSON(), overlap, captionColor: body ? getComputedStyle(body).color : null, captionFontSize: body ? getComputedStyle(body).fontSize : null, dataset: { ...document.querySelector('.gallery-scene')?.dataset } };
})()`);
check('Danny mobile caption and hint no longer overlap', report.dannyMobileBefore.overflowX === 0 && !report.dannyMobileBefore.overlap && report.dannyMobileBefore.captionColor === 'rgb(224, 223, 216)' && report.dannyMobileBefore.captionFontSize === '11px', report.dannyMobileBefore);
await screenshot('regression-danny-mobile');
await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: 195, y: 420, button: 'left', buttons: 1, clickCount: 1 });
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 195, y: 420, button: 'left', buttons: 0, clickCount: 1 });
await wait(300);
report.dannyMetadata = await evaluate(`({
  visible: Boolean(document.querySelector('.artwork-info')),
  title: document.querySelector('.artwork-info h2')?.innerText ?? null,
  byline: document.querySelector('.artwork-info h2 + span')?.innerText ?? null,
  description: document.querySelector('.artwork-info > div > p:last-child')?.innerText ?? null,
  hitMode: document.querySelector('.gallery-scene')?.dataset.artworkHitMode,
  lastHit: document.querySelector('.gallery-scene')?.dataset.lastArtworkHit
})`);
check('front Danny mobile artwork opens complete metadata', report.dannyMetadata.visible && Boolean(report.dannyMetadata.title) && report.dannyMetadata.byline?.toLowerCase().includes('danny hirsch') && Boolean(report.dannyMetadata.description) && ['raycast', 'screen-fallback'].includes(report.dannyMetadata.hitMode), report.dannyMetadata);
if (report.dannyMetadata.visible) await screenshot('regression-danny-mobile-metadata');

report.newConsoleErrors = diagnostics.filter((entry) => ['error', 'exception'].includes(entry.type));
check('regression produced no console errors', report.newConsoleErrors.length === 0, report.newConsoleErrors);
report.summary = { passed: report.checks.filter((item) => item.pass).length, failed: report.checks.filter((item) => !item.pass).length, diagnostics: diagnostics.length };

const reportUrl = new URL('browser-qa.json', outDir);
let existing = {};
try { existing = JSON.parse(await readFile(reportUrl, 'utf8')); } catch { /* first report */ }
const merged = { ...existing, historicalSummary: existing.historicalSummary ?? existing.summary, latestRegression: report, summary: report.summary };
await writeFile(reportUrl, JSON.stringify(merged, null, 2));
socket.close();
await fetch(`${endpoint}/json/close/${target.id}`).catch(() => null);
console.log(JSON.stringify(report.summary, null, 2));
