import { mkdir, writeFile } from 'node:fs/promises';

const endpoint = 'http://127.0.0.1:9333';
const baseUrl = 'http://127.0.0.1:5174';
const outDir = new URL('./', import.meta.url);
await mkdir(outDir, { recursive: true });

const target = await fetch(`${endpoint}/json/new?${encodeURIComponent(`${baseUrl}/#/`)}`, { method: 'PUT' }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

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
    if (message.error) request.reject(new Error(`${message.error.message}: ${JSON.stringify(message.error.data ?? '')}`));
    else request.resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled') {
    const { type, args = [] } = message.params;
    if (['error', 'warning', 'warn'].includes(type)) diagnostics.push({ stage, type, message: args.map((arg) => arg.value ?? arg.description ?? arg.type).join(' ') });
  }
  if (message.method === 'Runtime.exceptionThrown') {
    diagnostics.push({ stage, type: 'exception', message: message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text ?? 'Unknown exception' });
  }
  if (message.method === 'Log.entryAdded' && ['error', 'warning'].includes(message.params.entry.level)) {
    diagnostics.push({ stage, type: message.params.entry.level, message: message.params.entry.text, url: message.params.entry.url });
  }
  if (message.method === 'Network.loadingFailed' && !message.params.canceled) {
    diagnostics.push({ stage, type: 'network-failed', message: message.params.errorText, url: message.params.requestId });
  }
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

function once(method, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeout);
    const listeners = events.get(method) ?? [];
    listeners.push((params) => { clearTimeout(timer); resolve(params); });
    events.set(method, listeners);
  });
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function evaluate(expression, returnByValue = true) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, timeout = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return true;
    await wait(250);
  }
  return false;
}

async function setViewport(width, height, mobile = false, scale = 1) {
  await command('Emulation.clearDeviceMetricsOverride').catch(() => null);
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile, screenWidth: width, screenHeight: height });
}

async function navigate(path, waitMs = 1000) {
  const loaded = once('Page.loadEventFired', 6000).catch(() => null);
  await command('Page.navigate', { url: `${baseUrl}${path}` });
  await loaded;
  await wait(waitMs);
}

async function reload(waitMs = 1200) {
  const loaded = once('Page.loadEventFired', 6000).catch(() => null);
  await command('Page.reload', { ignoreCache: false });
  await loaded;
  await wait(waitMs);
}

async function capture(name) {
  const result = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(new URL(`${name}.png`, outDir), Buffer.from(result.data, 'base64'));
}

async function resources() {
  return evaluate(`performance.getEntriesByType('resource').map((entry) => entry.name)`);
}

function resourceGroups(names) {
  return {
    story: names.filter((name) => /ScrollGalleryStory\.tsx/i.test(name)),
    storyStyles: names.filter((name) => /scrollGalleryStory\.css/i.test(name)),
    galleryScene: names.filter((name) => /GalleryScene/i.test(name)),
    firebase: names.filter((name) => /firebase|firebaseGalleryRepository/i.test(name))
  };
}

await Promise.all([
  command('Page.enable'),
  command('Runtime.enable'),
  command('Log.enable'),
  command('Network.enable'),
  command('DOM.enable')
]);

const report = { checks: [], diagnostics };
const check = (name, pass, details) => report.checks.push({ name, pass: Boolean(pass), details });

stage = 'landing-initial';
await command('Network.clearBrowserCache');
await command('Storage.clearDataForOrigin', { origin: baseUrl, storageTypes: 'all' });
await setViewport(1440, 1000);
await navigate('/#/', 900);
await evaluate(`document.documentElement.style.scrollBehavior = 'auto'`);
const landingInitialResources = resourceGroups(await resources());
report.landingDesktop = await evaluate(`({
  title: document.title,
  h1: document.querySelector('h1')?.innerText,
  viewport: [innerWidth, innerHeight],
  scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  placeholder: document.querySelector('.story-placeholder')?.innerText ?? null,
  storyMounted: Boolean(document.querySelector('.sgs')),
  heroImage: { complete: document.querySelector('.hero-gallery-visual img')?.complete, width: document.querySelector('.hero-gallery-visual img')?.naturalWidth }
})`);
report.landingInitialResources = landingInitialResources;
check('landing desktop has no horizontal overflow', report.landingDesktop.overflowX === 0, report.landingDesktop);
check('scroll story is deferred above the fold', !report.landingDesktop.storyMounted && landingInitialResources.story.length === 0, landingInitialResources);
check('GalleryScene and Firebase are deferred above the fold', landingInitialResources.galleryScene.length === 0 && landingInitialResources.firebase.length === 0, landingInitialResources);
await capture('01-landing-desktop');

stage = 'landing-story';
await evaluate(`document.querySelector('.story-deferred')?.scrollIntoView({ block: 'start' })`);
await waitFor(`Boolean(document.querySelector('.sgs'))`, 6000);
await wait(900);
report.storyStart = await evaluate(`({
  mounted: Boolean(document.querySelector('.sgs')),
  webgl: document.querySelector('.sgs')?.dataset.webgl ?? null,
  motion: document.querySelector('.sgs')?.dataset.motion ?? null,
  progress: getComputedStyle(document.querySelector('.sgs')).getPropertyValue('--sgs-progress').trim(),
  canvas: document.querySelector('.sgs canvas')?.getBoundingClientRect().toJSON()
})`);
report.storyResources = resourceGroups(await resources());
check('scroll story mounts on demand', report.storyStart.mounted && report.storyResources.story.length > 0, report.storyStart);
check('story WebGL initializes', report.storyStart.webgl === 'ready', report.storyStart);
await evaluate(`(() => { const section = document.querySelector('.sgs'); const top = section.getBoundingClientRect().top + scrollY; scrollTo(0, top + (section.offsetHeight - innerHeight) * .56); })()`);
await wait(500);
report.storyMid = await evaluate(`({
  progress: Number(getComputedStyle(document.querySelector('.sgs')).getPropertyValue('--sgs-progress')),
  chapters: [...document.querySelectorAll('.sgs__chapters article')].map((item) => Number(getComputedStyle(item).opacity)),
  arrangeOpacity: Number(getComputedStyle(document.querySelector('.sgs__arrange-ui')).opacity),
  viewMode: document.querySelector('.sgs__view-ui')?.dataset.mode,
  scrollY
})`);
check('story progress follows scroll', report.storyMid.progress > .45 && report.storyMid.progress < .7, report.storyMid);
await capture('02-story-mid');
await evaluate(`(() => { const section = document.querySelector('.sgs'); const top = section.getBoundingClientRect().top + scrollY; scrollTo(0, top + (section.offsetHeight - innerHeight) * .97); })()`);
await wait(500);
report.storyEnd = await evaluate(`({
  progress: Number(getComputedStyle(document.querySelector('.sgs')).getPropertyValue('--sgs-progress')),
  publishOpacity: Number(getComputedStyle(document.querySelector('.sgs__publish-ui')).opacity),
  createLinkTabIndex: document.querySelector('.sgs__publish-ui a')?.tabIndex,
  scrollY
})`);
check('story completes with usable builder CTA', report.storyEnd.progress > .93 && report.storyEnd.publishOpacity > .8 && report.storyEnd.createLinkTabIndex === 0, report.storyEnd);
await capture('03-story-end');
await evaluate(`(() => { const section = document.querySelector('.sgs'); const top = section.getBoundingClientRect().top + scrollY; scrollTo(0, top + (section.offsetHeight - innerHeight) * .24); })()`);
await wait(400);
report.storyReverse = await evaluate(`({
  progress: Number(getComputedStyle(document.querySelector('.sgs')).getPropertyValue('--sgs-progress')),
  publishOpacity: Number(getComputedStyle(document.querySelector('.sgs__publish-ui')).opacity)
})`);
check('scroll story reverses when scrolling upward', report.storyReverse.progress < .3 && report.storyReverse.publishOpacity < .1, report.storyReverse);

stage = 'landing-discover';
const firebaseBeforeDiscover = resourceGroups(await resources()).firebase;
await evaluate(`document.querySelector('.discover')?.scrollIntoView({ block: 'center' })`);
await wait(3500);
const firebaseAfterDiscover = resourceGroups(await resources()).firebase;
report.discover = await evaluate(`({
  text: document.querySelector('.discover-empty')?.innerText ?? null,
  cards: document.querySelectorAll('.discover-card').length,
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`);
report.firebaseDeferred = { before: firebaseBeforeDiscover, after: firebaseAfterDiscover };
check('Firebase loads only when Discover approaches', firebaseBeforeDiscover.length === 0 && firebaseAfterDiscover.length > 0, report.firebaseDeferred);
await capture('04-discover-desktop');

stage = 'landing-mobile';
await setViewport(390, 844, true);
await navigate('/#/', 700);
await evaluate(`scrollTo(0, 0)`);
await wait(200);
report.landingMobile = await evaluate(`({
  viewport: [innerWidth, innerHeight],
  scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  header: document.querySelector('.site-header')?.getBoundingClientRect().toJSON(),
  hero: document.querySelector('.hero')?.getBoundingClientRect().toJSON(),
  heroVisual: getComputedStyle(document.querySelector('.hero-gallery-visual')).display,
  ctas: [...document.querySelectorAll('.hero-actions button')].map((button) => button.getBoundingClientRect().toJSON())
})`);
check('landing mobile has no horizontal overflow', report.landingMobile.overflowX === 0, report.landingMobile);
await capture('05-landing-mobile');

stage = 'picker';
await command('Storage.clearDataForOrigin', { origin: baseUrl, storageTypes: 'indexeddb,local_storage' });
report.testStorageReset = await evaluate(`new Promise((resolve) => {
  try { localStorage.clear(); } catch {}
  const request = indexedDB.deleteDatabase('aura-gallery-editor');
  request.onsuccess = () => resolve('deleted');
  request.onerror = () => resolve('error');
  request.onblocked = () => resolve('blocked');
})`);
await setViewport(1440, 1000);
await navigate('/#/create', 800);
report.picker = await evaluate(`({
  cards: [...document.querySelectorAll('.template-card')].map((card) => ({ name: card.querySelector('h2')?.innerText, rect: card.getBoundingClientRect().toJSON() })),
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  scrollHeight: document.documentElement.scrollHeight
})`);
check('template picker exposes all three templates', report.picker.cards.length === 3, report.picker.cards);
check('template picker has no horizontal overflow', report.picker.overflowX === 0, report.picker);
await capture('06-template-picker');

await evaluate(`document.querySelector('.template-card--white-cube')?.click()`);
await waitFor(`Boolean(document.querySelector('.gallery-scene canvas'))`, 10000);
await wait(1800);
report.editorEmpty = await evaluate(`(() => {
  const canvas = document.querySelector('.gallery-scene canvas');
  if (canvas) { canvas.dataset.qaIdentity = 'persistent-canvas'; window.__qaCanvas = canvas; }
  return {
    canvas: canvas?.getBoundingClientRect().toJSON(),
    canvasLabel: canvas?.getAttribute('aria-label'),
    canvasTabIndex: canvas?.tabIndex,
    sceneQuality: document.querySelector('.gallery-scene')?.dataset.quality,
    sceneTemplate: document.querySelector('.gallery-scene')?.dataset.template,
    rendererResources: ${JSON.stringify(resourceGroups(await resources()).galleryScene)},
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
  };
})()`);
check('editor WebGL is keyboard focusable and labelled', report.editorEmpty.canvasTabIndex === 0 && Boolean(report.editorEmpty.canvasLabel), report.editorEmpty);
check('editor has no horizontal overflow', report.editorEmpty.overflowX === 0, report.editorEmpty);
await capture('07-editor-empty');

stage = 'editor-upload';
const documentNode = await command('DOM.getDocument', { depth: -1, pierce: true });
const fileInput = await command('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector: 'input[type=file]' });
await command('DOM.setFileInputFiles', { nodeId: fileInput.nodeId, files: [`${process.cwd()}/public/assets/demo/danny-cover.webp`] });
await waitFor(`document.querySelectorAll('.artwork-list button').length === 1`, 10000);
await wait(1000);
report.editorArtwork = await evaluate(`({
  artworkCount: document.querySelectorAll('.artwork-list button').length,
  selectedArtwork: document.querySelector('.artwork-list button.active')?.innerText,
  wallCount: document.querySelectorAll('.wall-picker__grid button').length,
  undoEnabled: !document.querySelector('[aria-label="Undo last change"]')?.disabled,
  canvasPersistent: window.__qaCanvas === document.querySelector('.gallery-scene canvas')
})`);
check('artwork upload selects and places one work', report.editorArtwork.artworkCount === 1 && report.editorArtwork.wallCount === 4, report.editorArtwork);
check('scene canvas survives editor state changes', report.editorArtwork.canvasPersistent, report.editorArtwork);
await capture('08-editor-artwork');

stage = 'publish-blocked';
await evaluate(`[...document.querySelectorAll('button')].find((button) => button.innerText.toLowerCase().includes('review & publish'))?.click()`);
await waitFor(`Boolean(document.querySelector('.publish-review'))`, 3000);
report.publishBlocked = await evaluate(`({
  summary: document.querySelector('#publish-review-summary')?.innerText,
  blockers: document.querySelectorAll('.publish-review-list .is-error').length,
  warnings: document.querySelectorAll('.publish-review-list .is-warning').length,
  publishDisabled: document.querySelector('.publish-review .publish-button')?.disabled,
  activeElement: document.activeElement?.className
})`);
check('pre-publish review blocks placeholder identity', report.publishBlocked.blockers >= 2 && report.publishBlocked.publishDisabled, report.publishBlocked);
await capture('09-publish-blocked');
await evaluate(`document.querySelector('[aria-label="Close publish review"]')?.click()`);
await wait(150);

stage = 'editor-history';
await evaluate(`(() => {
  const input = document.querySelector('.studio-title input[aria-label="Gallery title"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'QA Exhibition'); input.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await wait(120);
const titleAfterEdit = await evaluate(`document.querySelector('.studio-title input[aria-label="Gallery title"]')?.value`);
await evaluate(`document.querySelector('[aria-label="Undo last change"]')?.click()`);
await wait(120);
const titleAfterUndo = await evaluate(`document.querySelector('.studio-title input[aria-label="Gallery title"]')?.value`);
await evaluate(`document.querySelector('[aria-label="Redo last change"]')?.click()`);
await wait(120);
const titleAfterRedo = await evaluate(`document.querySelector('.studio-title input[aria-label="Gallery title"]')?.value`);
await evaluate(`(() => {
  const input = document.querySelector('.studio-title input[aria-label="Artist name"]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, 'QA Artist'); input.dispatchEvent(new Event('input', { bubbles: true }));
})()`);
await waitFor(`document.querySelector('.draft-save-status')?.innerText === 'Saved locally'`, 4000);
report.historyAndSave = await evaluate(`({
  title: document.querySelector('.studio-title input[aria-label="Gallery title"]')?.value,
  artist: document.querySelector('.studio-title input[aria-label="Artist name"]')?.value,
  saveStatus: document.querySelector('.draft-save-status')?.innerText,
  canvasPersistent: window.__qaCanvas === document.querySelector('.gallery-scene canvas')
})`);
report.historyAndSave.titleSequence = { titleAfterEdit, titleAfterUndo, titleAfterRedo };
report.storedDraft = await evaluate(`new Promise((resolve) => {
  const open = indexedDB.open('aura-gallery-editor', 1);
  open.onerror = () => resolve({ error: String(open.error) });
  open.onsuccess = () => {
    const database = open.result;
    const request = database.transaction('drafts', 'readonly').objectStore('drafts').get('white-cube');
    request.onerror = () => { database.close(); resolve({ error: String(request.error) }); };
    request.onsuccess = () => { const value = request.result; database.close(); resolve(value ? { revision: value.revision, schemaVersion: value.schemaVersion, title: value.draft?.title, artist: value.draft?.artist, artworks: value.draft?.artworks?.length } : null); };
  };
})`);
check('undo and redo restore the exact title', titleAfterEdit === 'QA Exhibition' && titleAfterUndo === 'Untitled exhibition' && titleAfterRedo === 'QA Exhibition', report.historyAndSave.titleSequence);
check('autosave persists a versioned draft', report.historyAndSave.saveStatus === 'Saved locally' && report.storedDraft?.schemaVersion === 1 && report.storedDraft?.artworks === 1, report.storedDraft);
check('scene canvas survives metadata/history updates', report.historyAndSave.canvasPersistent, report.historyAndSave);

stage = 'editor-recovery';
await reload(1000);
report.refreshRecoveryEntry = await evaluate(`({
  pickerVisible: Boolean(document.querySelector('.template-grid')),
  studioVisible: Boolean(document.querySelector('.studio')),
  recoveryVisible: Boolean(document.querySelector('.recovery-dialog'))
})`);
if (report.refreshRecoveryEntry.pickerVisible) {
  await evaluate(`document.querySelector('.template-card--white-cube')?.click()`);
}
await waitFor(`Boolean(document.querySelector('.recovery-dialog'))`, 5000);
report.recovery = await evaluate(`({
  visible: Boolean(document.querySelector('.recovery-dialog')),
  summary: document.querySelector('.recovery-dialog')?.innerText,
  activeRole: document.activeElement?.closest('[role="dialog"]') ? 'dialog' : document.activeElement?.tagName
})`);
check('refresh offers focused local draft recovery', report.recovery.visible && report.recovery.activeRole === 'dialog', report.recovery);
check('refresh exposes recovery without requiring template reselection', report.refreshRecoveryEntry.recoveryVisible, report.refreshRecoveryEntry);
await capture('10-draft-recovery');
await evaluate(`[...document.querySelectorAll('.recovery-dialog button')].find((button) => button.innerText.toLowerCase().includes('recover draft'))?.click()`);
await wait(900);
report.recovered = await evaluate(`({
  title: document.querySelector('.studio-title input[aria-label="Gallery title"]')?.value,
  artist: document.querySelector('.studio-title input[aria-label="Artist name"]')?.value,
  artworkCount: document.querySelectorAll('.artwork-list button').length,
  saveStatus: document.querySelector('.draft-save-status')?.innerText
})`);
check('recovery restores identity and artwork', report.recovered.title === 'QA Exhibition' && report.recovered.artist === 'QA Artist' && report.recovered.artworkCount === 1, report.recovered);

stage = 'publish-ready';
await evaluate(`[...document.querySelectorAll('button')].find((button) => button.innerText.toLowerCase().includes('review & publish'))?.click()`);
await waitFor(`Boolean(document.querySelector('.publish-review'))`, 3000);
report.publishReady = await evaluate(`({
  summary: document.querySelector('#publish-review-summary')?.innerText,
  blockers: document.querySelectorAll('.publish-review-list .is-error').length,
  warnings: document.querySelectorAll('.publish-review-list .is-warning').length,
  publishDisabled: document.querySelector('.publish-review .publish-button')?.disabled,
  visibilityOptions: [...document.querySelectorAll('.publish-visibility label')].map((label) => ({ text: label.innerText, disabled: label.getAttribute('aria-disabled') }))
})`);
check('valid geometry can reach publish with metadata warnings only', report.publishReady.blockers === 0 && report.publishReady.warnings === 2 && !report.publishReady.publishDisabled, report.publishReady);
await capture('11-publish-ready');
await evaluate(`document.querySelector('[aria-label="Close publish review"]')?.click()`);
await wait(150);

stage = 'editor-mobile';
await setViewport(390, 844, true);
await wait(700);
report.editorMobileHalf = await evaluate(`({
  viewport: [innerWidth, innerHeight],
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  scrollHeight: document.documentElement.scrollHeight,
  header: document.querySelector('.studio-header')?.getBoundingClientRect().toJSON(),
  canvas: document.querySelector('.canvas-wrap')?.getBoundingClientRect().toJSON(),
  panel: document.querySelector('.tool-panel')?.getBoundingClientRect().toJSON(),
  panelClass: document.querySelector('.tool-panel')?.className,
  handle: { label: document.querySelector('.tool-sheet-handle')?.getAttribute('aria-label'), expanded: document.querySelector('.tool-sheet-handle')?.getAttribute('aria-expanded'), rect: document.querySelector('.tool-sheet-handle')?.getBoundingClientRect().toJSON() }
})`);
check('mobile editor has no horizontal overflow', report.editorMobileHalf.overflowX === 0, report.editorMobileHalf);
check('mobile editor exposes sheet handle', report.editorMobileHalf.handle.rect?.height >= 44, report.editorMobileHalf.handle);
await capture('12-editor-mobile-half');
await evaluate(`document.querySelector('.tool-sheet-handle')?.click()`);
await wait(500);
report.editorMobileFull = await evaluate(`({
  panelClass: document.querySelector('.tool-panel')?.className,
  panel: document.querySelector('.tool-panel')?.getBoundingClientRect().toJSON(),
  handleLabel: document.querySelector('.tool-sheet-handle')?.getAttribute('aria-label'),
  expanded: document.querySelector('.tool-sheet-handle')?.getAttribute('aria-expanded'),
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`);
check('mobile sheet expands without overflow', report.editorMobileFull.panelClass?.includes('tool-panel--full') && report.editorMobileFull.expanded === 'true' && report.editorMobileFull.overflowX === 0, report.editorMobileFull);
await capture('13-editor-mobile-full');

stage = 'danny-walk';
await setViewport(1440, 1000);
await navigate('/#/demo', 1000);
const dannyReady = await waitFor(`Number(document.querySelector('.gallery-scene')?.dataset.artworkTargets) > 0`, 16000);
await wait(800);
report.dannyWalk = await evaluate(`({
  ready: ${dannyReady},
  dataset: { ...document.querySelector('.gallery-scene')?.dataset },
  canvas: { rect: document.querySelector('.gallery-scene canvas')?.getBoundingClientRect().toJSON(), tabIndex: document.querySelector('.gallery-scene canvas')?.tabIndex, label: document.querySelector('.gallery-scene canvas')?.getAttribute('aria-label') },
  views: [...document.querySelectorAll('.view-switch button')].map((button) => ({ text: button.innerText, pressed: button.getAttribute('aria-pressed'), rect: button.getBoundingClientRect().toJSON() })),
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
})`);
check('Danny loads authored collision and artwork metadata', Number(report.dannyWalk.dataset.colliders) > 0 && Number(report.dannyWalk.dataset.artworkTargets) > 0, report.dannyWalk.dataset);
check('Danny desktop has no horizontal overflow', report.dannyWalk.overflowX === 0, report.dannyWalk);
await capture('14-danny-walk');

stage = 'danny-overview';
await evaluate(`[...document.querySelectorAll('.view-switch button')].find((button) => button.innerText.toLowerCase().includes('overview'))?.click()`);
await wait(800);
report.dannyOverview = await evaluate(`({
  dollhouse: document.querySelector('.gallery-scene')?.dataset.dollhouse,
  camera: document.querySelector('.gallery-scene')?.dataset.cameraPosition,
  views: [...document.querySelectorAll('.view-switch button')].map((button) => ({ text: button.innerText, pressed: button.getAttribute('aria-pressed') })),
  hint: document.querySelector('.movement-hint')?.innerText
})`);
check('Danny overview switches to dollhouse orbit state', report.dannyOverview.dollhouse === 'active' && report.dannyOverview.views[1]?.pressed === 'true', report.dannyOverview);
await capture('15-danny-overview');
await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 350, button: 'left', buttons: 1, clickCount: 1 });
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 350, button: 'left', buttons: 0, clickCount: 1 });
await wait(250);
report.dannyOverviewArtworkInfo = await evaluate(`({
  visible: Boolean(document.querySelector('.artwork-info')),
  title: document.querySelector('.artwork-info h2')?.innerText ?? null,
  byline: document.querySelector('.artwork-info h2 + span')?.innerText ?? null,
  description: document.querySelector('.artwork-info h2 + span + p')?.innerText ?? null,
  closeLabel: document.querySelector('.artwork-info button')?.getAttribute('aria-label') ?? null
})`);
check('Danny overview artwork opens visitor metadata', report.dannyOverviewArtworkInfo.visible && Boolean(report.dannyOverviewArtworkInfo.title) && report.dannyOverviewArtworkInfo.byline?.toLowerCase().includes('danny hirsch'), report.dannyOverviewArtworkInfo);
if (report.dannyOverviewArtworkInfo.visible) {
  await capture('15b-danny-overview-metadata');
  await evaluate(`document.querySelector('.artwork-info button')?.click()`);
  await wait(100);
}

stage = 'danny-walk-collision';
await evaluate(`[...document.querySelectorAll('.view-switch button')].find((button) => button.innerText.toLowerCase().includes('walk'))?.click()`);
await wait(700);
await evaluate(`document.querySelector('.gallery-scene canvas')?.focus()`);
const cameraBeforeWalk = await evaluate(`document.querySelector('.gallery-scene')?.dataset.cameraPosition`);
await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 });
await wait(1300);
await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87 });
await wait(100);
const cameraAfterWalk = await evaluate(`document.querySelector('.gallery-scene')?.dataset.cameraPosition`);
report.dannyMovement = { before: cameraBeforeWalk, after: cameraAfterWalk, changed: cameraBeforeWalk !== cameraAfterWalk, colliders: report.dannyWalk.dataset.colliders };
check('focused Danny canvas accepts scoped movement with colliders active', report.dannyMovement.changed && Number(report.dannyMovement.colliders) > 0, report.dannyMovement);

stage = 'danny-mobile';
await setViewport(390, 844, true);
await wait(700);
report.dannyMobile = await evaluate(`({
  viewport: [innerWidth, innerHeight],
  scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
  overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  header: document.querySelector('.viewer-header')?.getBoundingClientRect().toJSON(),
  controls: document.querySelector('.view-switch')?.getBoundingClientRect().toJSON(),
  buttons: [...document.querySelectorAll('.view-switch button')].map((button) => button.getBoundingClientRect().toJSON()),
  canvas: document.querySelector('.gallery-scene canvas')?.getBoundingClientRect().toJSON()
})`);
check('Danny mobile has no horizontal overflow', report.dannyMobile.overflowX === 0, report.dannyMobile);
check('Danny mobile view controls meet touch height', report.dannyMobile.buttons.every((button) => button.height >= 44), report.dannyMobile.buttons);
await capture('16-danny-mobile');

stage = 'danny-artwork-metadata';
await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: 195, y: 420, button: 'left', buttons: 1, clickCount: 1 });
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 195, y: 420, button: 'left', buttons: 0, clickCount: 1 });
await wait(350);
report.dannyMobileArtworkInfo = await evaluate(`({
  visible: Boolean(document.querySelector('.artwork-info')),
  title: document.querySelector('.artwork-info h2')?.innerText ?? null,
  byline: document.querySelector('.artwork-info h2 + span')?.innerText ?? null,
  description: document.querySelector('.artwork-info h2 + span + p')?.innerText ?? null,
  closeLabel: document.querySelector('.artwork-info button')?.getAttribute('aria-label') ?? null
})`);
check('obvious front artwork opens metadata on mobile', report.dannyMobileArtworkInfo.visible && Boolean(report.dannyMobileArtworkInfo.title) && report.dannyMobileArtworkInfo.byline?.includes('Danny Hirsch'), report.dannyMobileArtworkInfo);
if (report.dannyMobileArtworkInfo.visible) await capture('17-danny-mobile-artwork-metadata');

report.summary = {
  passed: report.checks.filter((item) => item.pass).length,
  failed: report.checks.filter((item) => !item.pass).length,
  diagnostics: diagnostics.length
};

await writeFile(new URL('browser-qa.json', outDir), JSON.stringify(report, null, 2));
socket.close();
await fetch(`${endpoint}/json/close/${target.id}`).catch(() => null);
console.log(JSON.stringify(report.summary, null, 2));
