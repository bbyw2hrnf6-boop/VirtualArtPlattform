import { mkdir, writeFile } from 'node:fs/promises';

const endpoint = 'http://127.0.0.1:9333';
const baseUrl = 'http://127.0.0.1:5174';
const outDir = new URL('./screenshots/', import.meta.url);
await mkdir(outDir, { recursive: true });

const target = await fetch(`${endpoint}/json/new?${encodeURIComponent(`${baseUrl}/#/`)}`, { method: 'PUT' }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let sequence = 0;
const pending = new Map();
const events = new Map();
const consoleEvents = [];

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
  if (message.method === 'Runtime.consoleAPICalled' || message.method === 'Runtime.exceptionThrown' || message.method === 'Log.entryAdded') {
    consoleEvents.push(message);
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

function once(method, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeout);
    const listeners = events.get(method) ?? [];
    listeners.push((params) => {
      clearTimeout(timer);
      resolve(params);
    });
    events.set(method, listeners);
  });
}

async function evaluate(expression, returnByValue = true) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function setViewport(width, height, mobile = false, scale = 1) {
  await command('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: scale,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
}

async function navigate(path, waitMs = 1800) {
  const loaded = once('Page.loadEventFired', 3000).catch(() => null);
  await command('Page.navigate', { url: `${baseUrl}${path}` });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

async function capture(name, fullPage = false) {
  let clip;
  if (fullPage) {
    const metrics = await command('Page.getLayoutMetrics');
    const width = Math.ceil(metrics.cssContentSize.width);
    const height = Math.ceil(metrics.cssContentSize.height);
    clip = { x: 0, y: 0, width, height, scale: 1 };
  }
  const result = await command('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: fullPage,
    ...(clip ? { clip } : {}),
  });
  await writeFile(new URL(`${name}.png`, outDir), Buffer.from(result.data, 'base64'));
}

await Promise.all([
  command('Page.enable'),
  command('Runtime.enable'),
  command('Log.enable'),
  command('Network.enable'),
  command('Accessibility.enable'),
]);

if (process.env.DEMO_ONLY === '1') {
  await setViewport(1440, 1000);
  await navigate('/#/demo', 12500);
  const before = await evaluate(`[...document.querySelectorAll('.view-switch button')].map(button => ({ text: button.innerText, pressed: button.getAttribute('aria-pressed') }))`);
  await evaluate(`document.querySelector('.view-switch button:nth-child(2)').click()`);
  await new Promise((resolve) => setTimeout(resolve, 2200));
  const after = await evaluate(`({
    view: [...document.querySelectorAll('.view-switch button')].map(button => ({ text: button.innerText, pressed: button.getAttribute('aria-pressed') })),
    hint: document.querySelector('.movement-hint')?.innerText,
  })`);
  await capture('demo-overview-verified');
  console.log(JSON.stringify({ before, after }, null, 2));
  socket.close();
  process.exit(0);
}

if (process.env.TEMPLATES_ONLY === '1') {
  await setViewport(1440, 1000);
  const templates = ['white-cube', 'nocturne', 'pavilion'];
  const states = {};
  for (const template of templates) {
    await navigate('/#/', 400);
    await navigate('/#/create', 900);
    await evaluate(`document.querySelector('.template-card--${template}').click()`);
    await new Promise((resolve) => setTimeout(resolve, 2600));
    states[template] = await evaluate(`({
      badge: document.querySelector('.canvas-badge')?.innerText,
      canvas: document.querySelector('canvas')?.getBoundingClientRect().toJSON(),
      controls: [...document.querySelectorAll('.ceiling-toggle button')].map(button => button.innerText),
    })`);
    await capture(`room-${template}-default`);
  }
  console.log(JSON.stringify(states, null, 2));
  socket.close();
  process.exit(0);
}

const report = {};

await setViewport(1440, 1000);
await navigate('/#/', 2500);
report.home = await evaluate(`({
  title: document.title,
  viewport: [innerWidth, innerHeight],
  scrollHeight: document.documentElement.scrollHeight,
  h1: document.querySelector('h1')?.innerText,
  sections: document.querySelectorAll('main > section').length,
  buttons: document.querySelectorAll('button').length,
  links: document.querySelectorAll('a').length,
  images: [...document.images].map(img => ({ src: img.getAttribute('src'), complete: img.complete, naturalWidth: img.naturalWidth })),
  overflowX: document.documentElement.scrollWidth - innerWidth,
})`);
await capture('home-cdp-desktop');
await capture('home-cdp-full', true);

await setViewport(390, 844, true, 1);
await navigate('/#/', 1600);
report.homeMobile = await evaluate(`({
  viewport: [innerWidth, innerHeight],
  scrollHeight: document.documentElement.scrollHeight,
  scrollWidth: document.documentElement.scrollWidth,
  overflowX: document.documentElement.scrollWidth - innerWidth,
  headerRect: document.querySelector('.site-header')?.getBoundingClientRect().toJSON(),
  heroRect: document.querySelector('.hero')?.getBoundingClientRect().toJSON(),
  heroVisualDisplay: getComputedStyle(document.querySelector('.hero-gallery-visual')).display,
})`);
await capture('home-cdp-mobile');
await capture('home-cdp-mobile-full', true);

await setViewport(1440, 1000);
await navigate('/#/create', 1600);
report.picker = await evaluate(`({
  cards: [...document.querySelectorAll('.template-card')].map(card => ({
    name: card.querySelector('h2')?.innerText,
    rect: card.getBoundingClientRect().toJSON(),
  })),
  scrollHeight: document.documentElement.scrollHeight,
})`);
await capture('picker-cdp-desktop');
await evaluate(`document.querySelector('.template-card--white-cube').click()`);
await new Promise((resolve) => setTimeout(resolve, 3000));
report.editorEmpty = await evaluate(`({
  canvas: document.querySelector('canvas')?.getBoundingClientRect().toJSON(),
  panel: document.querySelector('.tool-panel')?.getBoundingClientRect().toJSON(),
  body: document.querySelector('.studio-body')?.getBoundingClientRect().toJSON(),
  scrollHeight: document.documentElement.scrollHeight,
  bodyOverflow: getComputedStyle(document.body).overflow,
  hasWebgl: !!document.querySelector('canvas'),
})`);
await capture('editor-empty-desktop');

const documentNode = await command('DOM.getDocument', { depth: -1, pierce: true });
const fileInput = await command('DOM.querySelector', { nodeId: documentNode.root.nodeId, selector: 'input[type=file]' });
await command('DOM.setFileInputFiles', {
  nodeId: fileInput.nodeId,
  files: [`${process.cwd()}/public/assets/demo/danny-cover.webp`],
});
await new Promise((resolve) => setTimeout(resolve, 3200));
report.editorArtwork = await evaluate(`({
  artworkCount: document.querySelectorAll('.artwork-list button').length,
  selectedArtwork: document.querySelector('.artwork-list button.active')?.innerText,
  wallButtons: [...document.querySelectorAll('.wall-picker__grid button')].map(button => button.innerText),
  canvas: document.querySelector('canvas')?.getBoundingClientRect().toJSON(),
})`);
await capture('editor-artwork-desktop');

await evaluate(`[...document.querySelectorAll('.wall-picker__grid button')].find(button => button.innerText.includes('Right wall'))?.click()`);
await new Promise((resolve) => setTimeout(resolve, 1400));
await evaluate(`document.querySelectorAll('details')[4].open = true`);
await new Promise((resolve) => setTimeout(resolve, 300));
report.editorObjectPanel = await evaluate(`({
  objectButtons: [...document.querySelectorAll('.object-grid button')].map(button => button.innerText),
  openDetails: [...document.querySelectorAll('details')].filter(item => item.open).map(item => item.querySelector('summary')?.innerText),
})`);
await capture('editor-object-panel-desktop');

await setViewport(390, 844, true, 1);
await new Promise((resolve) => setTimeout(resolve, 600));
report.editorMobile = await evaluate(`({
  viewport: [innerWidth, innerHeight],
  bodyScroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
  canvas: document.querySelector('canvas')?.getBoundingClientRect().toJSON(),
  panel: document.querySelector('.tool-panel')?.getBoundingClientRect().toJSON(),
  header: document.querySelector('.studio-header')?.getBoundingClientRect().toJSON(),
})`);
await capture('editor-mobile');

await setViewport(1440, 1000);
await navigate('/#/demo', 12500);
report.demoWalk = await evaluate(`({
  canvas: document.querySelector('canvas')?.getBoundingClientRect().toJSON(),
  intro: !!document.querySelector('.gallery-intro'),
  view: [...document.querySelectorAll('.view-switch button')].map(button => ({ text: button.innerText, pressed: button.getAttribute('aria-pressed') })),
  caption: document.querySelector('.viewer-caption')?.innerText,
  webgl: document.querySelector('canvas')?.getContext('webgl2')?.getParameter(7938) ?? document.querySelector('canvas')?.getContext('webgl')?.getParameter(7938),
})`);
await capture('demo-walk-desktop');
await evaluate(`[...document.querySelectorAll('.view-switch button')].find(button => button.innerText.includes('Overview'))?.click()`);
await new Promise((resolve) => setTimeout(resolve, 2200));
report.demoOverview = await evaluate(`({
  view: [...document.querySelectorAll('.view-switch button')].map(button => ({ text: button.innerText, pressed: button.getAttribute('aria-pressed') })),
  hint: document.querySelector('.movement-hint')?.innerText,
})`);
await capture('demo-overview-desktop');

await setViewport(390, 844, true, 1);
await new Promise((resolve) => setTimeout(resolve, 1000));
report.demoMobile = await evaluate(`({
  viewport: [innerWidth, innerHeight],
  scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
  canvas: document.querySelector('canvas')?.getBoundingClientRect().toJSON(),
  controls: document.querySelector('.view-switch')?.getBoundingClientRect().toJSON(),
  header: document.querySelector('.viewer-header')?.getBoundingClientRect().toJSON(),
})`);
await capture('demo-mobile-cdp');

report.accessibility = await command('Accessibility.getFullAXTree');
report.console = consoleEvents.map((entry) => ({ method: entry.method, params: entry.params }));
report.resources = await evaluate(`performance.getEntriesByType('resource').map(entry => ({ name: entry.name, duration: entry.duration, transferSize: entry.transferSize, decodedBodySize: entry.decodedBodySize }))`);
await writeFile(new URL('../browser-report.json', outDir), JSON.stringify(report, null, 2));

socket.close();
await fetch(`${endpoint}/json/close/${target.id}`);
console.log(JSON.stringify({ report: 'audit/browser-report.json', screenshots: 'audit/screenshots', summary: report }, null, 2));
